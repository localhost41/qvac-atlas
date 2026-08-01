import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join, parse, sep } from "node:path";
import { ArtifactError, type ArtifactErrorCode } from "./errors.js";

export interface OpenPrivateRoot {
  readonly canonicalRoot: string;
  readonly handle: FileHandle;
  readonly snapshot: Stats;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function sameObject(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
  );
}

function ownedByProcess(stat: Stats): boolean {
  return typeof process.getuid !== "function" || stat.uid === process.getuid();
}

function privateMode(stat: Stats, expected: number): boolean {
  return process.platform === "win32" || (stat.mode & 0o777) === expected;
}

async function assertPhysicalComponents(
  path: string,
  allowMissingLeaf: boolean,
): Promise<void> {
  const root = parse(path).root;
  const parts = path.slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink())
        throw new ArtifactError("artifact-private-root-unsafe");
    } catch (error) {
      if (allowMissingLeaf && index === parts.length - 1 && isMissing(error)) {
        return;
      }
      throw error;
    }
  }
}

export async function openPrivateRoot(path: string): Promise<OpenPrivateRoot> {
  let handle: FileHandle | undefined;
  try {
    if (process.platform === "win32")
      throw new ArtifactError("artifact-private-root-unsafe");
    await assertPhysicalComponents(path, true);
    let pathStat: Stats;
    try {
      pathStat = await lstat(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = await realpath(dirname(path));
      if (basename(path) === "." || basename(path) === "..") throw error;
      await mkdir(join(parent, basename(path)), { mode: 0o700 });
      pathStat = await lstat(path);
    }

    if (
      pathStat.isSymbolicLink() ||
      !pathStat.isDirectory() ||
      !ownedByProcess(pathStat)
    ) {
      throw new ArtifactError("artifact-private-root-unsafe");
    }
    if (!privateMode(pathStat, 0o700)) {
      throw new ArtifactError("artifact-private-root-unsafe");
    }

    const canonicalRoot = await realpath(path);
    if (canonicalRoot !== path)
      throw new ArtifactError("artifact-private-root-unsafe");
    handle = await open(
      canonicalRoot,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const descriptorStat = await handle.stat();
    const canonicalStat = await lstat(canonicalRoot);
    if (
      !descriptorStat.isDirectory() ||
      !sameIdentity(descriptorStat, canonicalStat) ||
      !ownedByProcess(descriptorStat) ||
      !privateMode(descriptorStat, 0o700)
    ) {
      await handle.close();
      throw new ArtifactError("artifact-private-root-unsafe");
    }
    return { canonicalRoot, handle, snapshot: descriptorStat };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-private-root-unsafe");
  }
}

export async function assertRootStable(root: OpenPrivateRoot): Promise<void> {
  try {
    await assertPhysicalComponents(root.canonicalRoot, false);
    if ((await realpath(root.canonicalRoot)) !== root.canonicalRoot)
      throw new ArtifactError("artifact-private-root-unsafe");
    const descriptorStat = await root.handle.stat();
    const pathStat = await lstat(root.canonicalRoot);
    if (
      !sameIdentity(descriptorStat, root.snapshot) ||
      !sameIdentity(descriptorStat, pathStat) ||
      !descriptorStat.isDirectory() ||
      !ownedByProcess(descriptorStat) ||
      !privateMode(descriptorStat, 0o700)
    ) {
      throw new ArtifactError("artifact-private-root-unsafe");
    }
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-private-root-unsafe");
  }
}

export async function openRegularPrivateFile(
  path: string,
  failure: ArtifactErrorCode,
): Promise<{ readonly handle: FileHandle; readonly snapshot: Stats }> {
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(path);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.nlink !== 1 ||
      !ownedByProcess(before) ||
      !privateMode(before, 0o600)
    ) {
      throw new ArtifactError(failure);
    }
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptor = await handle.stat();
    if (
      !descriptor.isFile() ||
      descriptor.nlink !== 1 ||
      !sameObject(before, descriptor) ||
      !ownedByProcess(descriptor) ||
      !privateMode(descriptor, 0o600)
    ) {
      await handle.close();
      throw new ArtifactError(failure);
    }
    return { handle, snapshot: descriptor };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError(failure);
  }
}

export async function assertFileStable(
  path: string,
  handle: FileHandle,
  snapshot: Stats,
  failure: ArtifactErrorCode,
): Promise<void> {
  try {
    const descriptor = await handle.stat();
    const pathStat = await lstat(path);
    if (
      !sameObject(snapshot, descriptor) ||
      !sameObject(descriptor, pathStat) ||
      !ownedByProcess(descriptor) ||
      !privateMode(descriptor, 0o600)
    ) {
      throw new ArtifactError(failure);
    }
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError(failure);
  }
}

export async function unlinkIfSame(
  path: string,
  expected: Stats | undefined,
): Promise<void> {
  if (expected === undefined) return;
  try {
    const current = await lstat(path);
    if (current.dev === expected.dev && current.ino === expected.ino) {
      await unlink(path);
    }
  } catch {
    // Best-effort cleanup must never replace the fixed primary failure.
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw new ArtifactError("artifact-cache-unsafe");
  }
}
