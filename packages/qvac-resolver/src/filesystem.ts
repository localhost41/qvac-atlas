import { constants as fsConstants } from "node:fs";
import { access, lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { MAX_MANIFEST_BYTES } from "./constants.js";

export class UnsafeFilesystemShapeError extends Error {
  constructor() {
    super("Filesystem shape is unsafe or invalid");
    this.name = "UnsafeFilesystemShapeError";
  }
}

export function isPathContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

export async function isAccessible(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function requireRealDirectory(
  directoryPath: string,
): Promise<string> {
  const resolved = await realpath(directoryPath);
  const metadata = await stat(resolved);
  if (!metadata.isDirectory()) throw new UnsafeFilesystemShapeError();
  return resolved;
}

export async function readBoundedJson(
  filePath: string,
): Promise<Record<string, unknown>> {
  const linkMetadata = await lstat(filePath);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
    throw new UnsafeFilesystemShapeError();
  }

  const file = await open(filePath, "r");
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > MAX_MANIFEST_BYTES) {
      throw new UnsafeFilesystemShapeError();
    }
    const contents = await file.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(contents, "utf8") > MAX_MANIFEST_BYTES) {
      throw new UnsafeFilesystemShapeError();
    }
    const parsed: unknown = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new UnsafeFilesystemShapeError();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof UnsafeFilesystemShapeError) throw error;
    throw new UnsafeFilesystemShapeError();
  } finally {
    await file.close();
  }
}

export async function requireContainedRegularEntry(
  sdkRoot: string,
  relativeEntry: string,
): Promise<string> {
  const lexicalEntry = path.resolve(sdkRoot, relativeEntry);
  if (!isPathContained(sdkRoot, lexicalEntry) || lexicalEntry === sdkRoot) {
    throw new UnsafeFilesystemShapeError();
  }

  const linkMetadata = await lstat(lexicalEntry);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
    throw new UnsafeFilesystemShapeError();
  }

  const realEntry = await realpath(lexicalEntry);
  const metadata = await stat(realEntry);
  if (
    !metadata.isFile() ||
    !isPathContained(sdkRoot, realEntry) ||
    realEntry === sdkRoot
  ) {
    throw new UnsafeFilesystemShapeError();
  }
  return realEntry;
}
