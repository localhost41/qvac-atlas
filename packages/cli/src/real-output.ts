import { randomBytes } from "node:crypto";
import { lstat, link, open, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

import type { RealOutputBoundary } from "@qvac-atlas/probe/real";

interface Identity {
  readonly dev: number;
  readonly ino: number;
}

/** Relative-only adversarial seam; production construction supplies no hooks. */
export interface RealOutputTestHooks {
  afterStageCreate?(stagingPath: string): void | Promise<void>;
  afterWrite?(stagingPath: string): void | Promise<void>;
  afterSync?(stagingPath: string): void | Promise<void>;
  afterStageValidation?(stagingPath: string): void | Promise<void>;
  afterLink?(stagingPath: string, outputPath: string): void | Promise<void>;
  afterStagingUnlink?(outputPath: string): void | Promise<void>;
  afterDirectorySync?(outputPath: string): void | Promise<void>;
  unlinkFile?(filePath: string): Promise<void>;
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function sameIdentity(
  value: Awaited<ReturnType<typeof lstat>>,
  expected: Identity,
): boolean {
  return value.dev === expected.dev && value.ino === expected.ino;
}

async function unlinkOwned(
  filePath: string,
  identity: Identity,
  unlinkFile: (filePath: string) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const current = await lstat(filePath);
      if (!sameIdentity(current, identity)) return;
      await unlinkFile(filePath);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      if (attempt === 1) throw error;
    }
  }
  const remaining = await lstat(filePath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (remaining !== null && sameIdentity(remaining, identity))
    throw new Error("real-output-cleanup-failed");
}

function requireOutputPath(outputPath: string): string {
  if (
    typeof outputPath !== "string" ||
    !path.isAbsolute(outputPath) ||
    path.normalize(outputPath) !== outputPath ||
    outputPath.length > 4_096 ||
    path.basename(outputPath) === "." ||
    path.basename(outputPath) === ".."
  ) {
    throw new Error("real-output-path-invalid");
  }
  return outputPath;
}

async function exactDescriptorBytes(
  handle: FileHandle,
  expected: Buffer,
): Promise<boolean> {
  const observed = Buffer.allocUnsafe(Math.min(64 * 1_024, expected.length));
  let position = 0;
  while (position < expected.length) {
    const length = Math.min(observed.length, expected.length - position);
    const { bytesRead } = await handle.read(observed, 0, length, position);
    if (
      bytesRead !== length ||
      !observed
        .subarray(0, length)
        .equals(expected.subarray(position, position + length))
    ) {
      return false;
    }
    position += bytesRead;
  }
  const trailing = Buffer.allocUnsafe(1);
  return (await handle.read(trailing, 0, 1, position)).bytesRead === 0;
}

/** Same-directory staged, identity-checked no-clobber publication. */
export class BoundRealOutput implements RealOutputBoundary {
  readonly #outputPath: string;
  readonly #hooks: RealOutputTestHooks;

  constructor(outputPath: string, hooks: RealOutputTestHooks = {}) {
    this.#outputPath = requireOutputPath(outputPath);
    this.#hooks = Object.freeze({ ...hooks });
    Object.freeze(this);
  }

  async preflight(signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted();
    try {
      await lstat(this.#outputPath);
      signal.throwIfAborted();
      return false;
    } catch (error) {
      signal.throwIfAborted();
      if (errorCode(error) === "ENOENT") return true;
      throw new Error("real-output-preflight-failed");
    }
  }

  async writeExclusive(
    exactJson: string,
  ): Promise<
    | { readonly status: "written" }
    | { readonly status: "write-failed" }
    | { readonly status: "cleanup-uncertain" }
  > {
    if (typeof exactJson !== "string" || !exactJson.endsWith("\n"))
      return { status: "write-failed" };
    const exactBytes = Buffer.from(exactJson, "utf8");
    const parent = path.dirname(this.#outputPath);
    const staging = path.join(
      parent,
      `.${path.basename(this.#outputPath)}.qvac-atlas-${randomBytes(16).toString("hex")}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let identity: Identity | undefined;
    let linked = false;
    let committed = false;
    let openedByUs = false;
    try {
      handle = await open(staging, "wx+", 0o600);
      openedByUs = true;
      await handle.chmod(0o600);
      await this.#hooks.afterStageCreate?.(staging);
      const descriptor = await handle.stat();
      identity = { dev: descriptor.dev, ino: descriptor.ino };
      const opened = await lstat(staging);
      if (!sameIdentity(opened, identity))
        throw new Error("real-output-write-failed");
      await handle.writeFile(exactJson, { encoding: "utf8" });
      await this.#hooks.afterWrite?.(staging);
      await handle.sync();
      await this.#hooks.afterSync?.(staging);
      const complete = await handle.stat();
      if (
        !complete.isFile() ||
        !sameIdentity(complete, identity) ||
        complete.nlink !== 1 ||
        (complete.mode & 0o777) !== 0o600 ||
        complete.size !== exactBytes.length
      ) {
        throw new Error("real-output-write-failed");
      }
      await this.#hooks.afterStageValidation?.(staging);
      await link(staging, this.#outputPath);
      linked = true;
      await this.#hooks.afterLink?.(staging, this.#outputPath);
      const target = await lstat(this.#outputPath);
      const linkedDescriptor = await handle.stat();
      if (
        !target.isFile() ||
        !sameIdentity(target, identity) ||
        !sameIdentity(linkedDescriptor, identity) ||
        target.nlink !== 2 ||
        linkedDescriptor.nlink !== 2 ||
        (target.mode & 0o777) !== 0o600 ||
        (linkedDescriptor.mode & 0o777) !== 0o600 ||
        target.size !== exactBytes.length
      ) {
        throw new Error("real-output-write-failed");
      }
      await unlinkOwned(staging, identity, this.#hooks.unlinkFile ?? unlink);
      await this.#hooks.afterStagingUnlink?.(this.#outputPath);
      const stagingAbsent = await lstat(staging).then(
        () => false,
        (error: unknown) => errorCode(error) === "ENOENT",
      );
      const published = await lstat(this.#outputPath);
      const publishedDescriptor = await handle.stat();
      if (
        !stagingAbsent ||
        !published.isFile() ||
        !sameIdentity(published, identity) ||
        !sameIdentity(publishedDescriptor, identity) ||
        published.nlink !== 1 ||
        publishedDescriptor.nlink !== 1 ||
        (published.mode & 0o777) !== 0o600 ||
        (publishedDescriptor.mode & 0o777) !== 0o600 ||
        published.size !== exactBytes.length
      ) {
        throw new Error("real-output-write-failed");
      }
      const directory = await open(parent, "r");
      try {
        // The complete synced target is already authoritative. Directory-sync
        // failure cannot safely be reported as no-write.
        await directory
          .sync()
          .then(() => this.#hooks.afterDirectorySync?.(this.#outputPath))
          .catch(() => undefined);
      } finally {
        await directory.close().catch(() => undefined);
      }
      const finalTarget = await lstat(this.#outputPath);
      const finalDescriptor = await handle.stat();
      if (
        !finalTarget.isFile() ||
        !sameIdentity(finalTarget, identity) ||
        !sameIdentity(finalDescriptor, identity) ||
        finalTarget.nlink !== 1 ||
        finalDescriptor.nlink !== 1 ||
        (finalTarget.mode & 0o777) !== 0o600 ||
        (finalDescriptor.mode & 0o777) !== 0o600 ||
        finalTarget.size !== exactBytes.length ||
        finalDescriptor.size !== exactBytes.length ||
        !(await exactDescriptorBytes(handle, exactBytes))
      ) {
        throw new Error("real-output-write-failed");
      }
      committed = true;
      await handle.close();
      handle = undefined;
      return { status: "written" };
    } catch {
      if (identity === undefined && handle !== undefined) {
        const opened = await handle.stat().catch(() => undefined);
        if (opened !== undefined)
          identity = { dev: opened.dev, ino: opened.ino };
      }
      let closeFailed = false;
      await handle?.close().catch(() => {
        closeFailed = true;
      });
      if (identity !== undefined) {
        if (committed) {
          // A complete single-link target at the approved path is authoritative.
          return { status: "written" };
        }
        try {
          const unlinkFile = this.#hooks.unlinkFile ?? unlink;
          if (linked) await unlinkOwned(this.#outputPath, identity, unlinkFile);
          await unlinkOwned(staging, identity, unlinkFile);
        } catch {
          return { status: "cleanup-uncertain" };
        }
        return closeFailed
          ? { status: "cleanup-uncertain" }
          : { status: "write-failed" };
      }
      return openedByUs || closeFailed
        ? { status: "cleanup-uncertain" }
        : { status: "write-failed" };
    }
  }
}
