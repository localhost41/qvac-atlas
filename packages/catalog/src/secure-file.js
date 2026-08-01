import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const READ_CHUNK_BYTES = 64 * 1024;

class CatalogFileError extends Error {}

function reject(label, reason) {
  throw new CatalogFileError(`Catalog filesystem rejected ${label}: ${reason}`);
}

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameSnapshot(left, right) {
  return (
    sameFile(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

export function assertCanonicalRepositoryPath(candidate, label = "path") {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > 512 ||
    isAbsolute(candidate) ||
    candidate.includes("\\")
  ) {
    reject(label, "path must be a bounded repository-relative POSIX path");
  }
  const segments = candidate.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !SAFE_SEGMENT.test(segment),
    )
  ) {
    reject(label, "path contains an empty, ambiguous, or unsupported segment");
  }
  return candidate;
}

export async function canonicalDirectory({ root, relativePath, label }) {
  assertCanonicalRepositoryPath(relativePath, label);
  try {
    const lexical = resolve(root, relativePath);
    const [rootPath, info] = await Promise.all([
      realpath(root),
      lstat(lexical, { bigint: true }),
    ]);
    if (!info.isDirectory() || info.isSymbolicLink())
      reject(label, "must be a physical directory");
    const directoryPath = await realpath(lexical);
    if (!contained(rootPath, directoryPath))
      reject(label, "canonical directory escapes the repository");
    return { directoryPath, rootPath };
  } catch (error) {
    if (error instanceof CatalogFileError) throw error;
    reject(label, "directory is unavailable or unsafe");
  }
}

async function readCapped(handle, maxBytes, label) {
  const chunks = [];
  let total = 0;
  while (true) {
    const requestBytes = Math.min(READ_CHUNK_BYTES, maxBytes - total + 1);
    const buffer = Buffer.allocUnsafe(requestBytes);
    const { bytesRead } = await handle.read(buffer, 0, requestBytes, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes)
      reject(label, "actual bytes read exceed the size limit");
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

/**
 * Opens one descriptor, validates that descriptor, caps bytes while reading it,
 * and verifies the path and descriptor remained the same snapshot. `afterOpen`
 * exists solely for deterministic filesystem-race tests and is never populated by
 * registry input.
 */
export async function readBoundedRegularFile({
  root,
  relativePath,
  allowedDirectory,
  maxBytes,
  label,
  afterOpen,
}) {
  assertCanonicalRepositoryPath(relativePath, label);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    reject(label, "size limit is invalid");

  let handle;
  try {
    const rootPath = await realpath(root);
    let allowedPath = rootPath;
    if (allowedDirectory !== undefined) {
      ({ directoryPath: allowedPath } = await canonicalDirectory({
        root,
        relativePath: allowedDirectory,
        label: `${label} allowed directory`,
      }));
    }

    const lexical = resolve(root, relativePath);
    const before = await lstat(lexical, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink())
      reject(label, "must be a physical regular file");
    if (before.size > BigInt(maxBytes))
      reject(label, "declared size exceeds the limit");
    const canonicalBefore = await realpath(lexical);
    if (!contained(allowedPath, canonicalBefore))
      reject(label, "canonical file escapes its allowed directory");

    const noFollow = constants.O_NOFOLLOW ?? 0;
    handle = await open(lexical, constants.O_RDONLY | noFollow);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameSnapshot(before, opened))
      reject(label, "path changed before descriptor validation");
    if (opened.size > BigInt(maxBytes))
      reject(label, "opened size exceeds the limit");

    if (afterOpen !== undefined) await afterOpen({ lexicalPath: lexical });
    const content = await readCapped(handle, maxBytes, label);
    const [afterDescriptor, afterPath, canonicalAfter] = await Promise.all([
      handle.stat({ bigint: true }),
      lstat(lexical, { bigint: true }),
      realpath(lexical),
    ]);
    if (
      !afterDescriptor.isFile() ||
      !afterPath.isFile() ||
      afterPath.isSymbolicLink() ||
      !sameSnapshot(opened, afterDescriptor) ||
      !sameFile(opened, afterPath) ||
      afterDescriptor.size !== BigInt(content.length)
    ) {
      reject(label, "file changed while it was being read");
    }
    if (!contained(allowedPath, canonicalAfter))
      reject(label, "canonical file changed or escaped its allowed directory");
    return content.toString("utf8");
  } catch (error) {
    if (error instanceof CatalogFileError) throw error;
    reject(label, "file is unavailable, changed, or unsafe");
  } finally {
    await handle?.close();
  }
}
