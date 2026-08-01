import { constants, type Stats } from "node:fs";
import { lstat, open, unlink, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import {
  PINNED_MODEL_CANDIDATE,
  type ModelArtifactCandidate,
} from "./candidate.js";
import { ArtifactError } from "./errors.js";
import {
  assertRootStable,
  hashExactDescriptor,
  openExistingPrivateRoot,
  type OpenPrivateRoot,
} from "./filesystem.js";

const SESSION_NONCE_PATTERN = /^[0-9a-f]{48}$/;

function missing(error: unknown): boolean {
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

function safeOwnedFile(stat: Stats): boolean {
  return (
    !stat.isSymbolicLink() &&
    stat.isFile() &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid()) &&
    (process.platform === "win32" || (stat.mode & 0o777) === 0o600) &&
    (stat.nlink === 1 || stat.nlink === 2)
  );
}

async function openExactOwnedEntry(
  path: string,
): Promise<{ readonly handle: FileHandle; readonly snapshot: Stats }> {
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(path);
    if (!safeOwnedFile(before)) {
      throw new ArtifactError("artifact-cleanup-failed");
    }
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const descriptor = await handle.stat();
    if (!safeOwnedFile(descriptor) || !sameObject(before, descriptor)) {
      throw new ArtifactError("artifact-cleanup-failed");
    }
    return { handle, snapshot: descriptor };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-cleanup-failed");
  }
}

async function assertEntryStable(
  path: string,
  handle: FileHandle,
  expected: Stats,
): Promise<void> {
  const descriptor = await handle.stat();
  const current = await lstat(path);
  if (!sameObject(descriptor, expected) || !sameObject(current, expected)) {
    throw new ArtifactError("artifact-cleanup-failed");
  }
}

export interface RecoverOwnedStagingOptions {
  readonly privateRoot: string;
  readonly sessionNonce: string;
  readonly candidate?: ModelArtifactCandidate;
  readonly hooks?: {
    readonly beforeUnlink?: () => void | Promise<void>;
  };
}

/**
 * Recovery is deliberately narrower than ordinary acquisition cleanup. It opens
 * one already-existing root and one nonce-derived name, and never creates,
 * scans, fetches, overwrites, or grants authority for any artifact. A two-link
 * publish is normalized only after a full descriptor hash proves pinned bytes.
 */
export async function internalRecoverOwnedStaging(
  options: RecoverOwnedStagingOptions,
): Promise<void> {
  const candidate = options.candidate ?? PINNED_MODEL_CANDIDATE;
  if (!SESSION_NONCE_PATTERN.test(options.sessionNonce)) {
    throw new ArtifactError("artifact-cleanup-failed");
  }
  let root: OpenPrivateRoot | undefined;
  let staging: FileHandle | undefined;
  try {
    try {
      await lstat(options.privateRoot);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    root = await openExistingPrivateRoot(options.privateRoot);
    await assertRootStable(root);
    const stagingPath = join(
      root.canonicalRoot,
      `.${candidate.filename}.${options.sessionNonce}.partial`,
    );
    try {
      await lstat(stagingPath);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    const opened = await openExactOwnedEntry(stagingPath);
    staging = opened.handle;
    if (opened.snapshot.size > candidate.byteLength) {
      throw new ArtifactError("artifact-cleanup-failed");
    }
    await assertRootStable(root);
    await assertEntryStable(stagingPath, staging, opened.snapshot);

    if (opened.snapshot.nlink === 1) {
      await options.hooks?.beforeUnlink?.();
      await assertEntryStable(stagingPath, staging, opened.snapshot);
      await unlink(stagingPath);
      const descriptor = await staging.stat();
      if (descriptor.nlink !== 0) {
        throw new ArtifactError("artifact-cleanup-failed");
      }
    } else {
      const destination = join(root.canonicalRoot, candidate.filename);
      const finalStat = await lstat(destination);
      if (
        !safeOwnedFile(finalStat) ||
        finalStat.nlink !== 2 ||
        finalStat.dev !== opened.snapshot.dev ||
        finalStat.ino !== opened.snapshot.ino ||
        !sameObject(finalStat, opened.snapshot) ||
        finalStat.size !== candidate.byteLength ||
        (await hashExactDescriptor(
          staging,
          candidate.byteLength,
          "artifact-cleanup-failed",
        )) !== candidate.sha256
      ) {
        throw new ArtifactError("artifact-cleanup-failed");
      }
      await options.hooks?.beforeUnlink?.();
      await assertEntryStable(stagingPath, staging, opened.snapshot);
      const finalBeforeUnlink = await lstat(destination);
      if (!sameObject(finalBeforeUnlink, opened.snapshot)) {
        throw new ArtifactError("artifact-cleanup-failed");
      }
      await unlink(stagingPath);
      const descriptor = await staging.stat();
      const repairedFinal = await lstat(destination);
      if (
        descriptor.nlink !== 1 ||
        repairedFinal.nlink !== 1 ||
        descriptor.dev !== repairedFinal.dev ||
        descriptor.ino !== repairedFinal.ino ||
        !safeOwnedFile(repairedFinal)
      ) {
        throw new ArtifactError("artifact-cleanup-failed");
      }
    }
    await root.handle.sync();
    await assertRootStable(root);
  } catch (error) {
    if (error instanceof ArtifactError) {
      if (error.code === "artifact-cleanup-failed") throw error;
      throw new ArtifactError("artifact-cleanup-failed");
    }
    throw new ArtifactError("artifact-cleanup-failed");
  } finally {
    await staging?.close().catch(() => undefined);
    await root?.handle.close().catch(() => undefined);
  }
}
