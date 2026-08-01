import { createHash, randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { link, lstat, open, unlink, type FileHandle } from "node:fs/promises";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  PINNED_MODEL_CANDIDATE,
  createPinnedArtifactDisclosure,
  type ModelArtifactCandidate,
} from "./candidate.js";
import {
  type ArtifactAcquisitionConsent,
  type VerifiedArtifactCapability,
  internalConsumeConsent,
  internalIssueArtifact,
} from "./capabilities.js";
import { ArtifactError } from "./errors.js";
import {
  assertFileStable,
  assertRootStable,
  openPrivateRoot,
  openRegularPrivateFile,
  pathExists,
  unlinkIfSame,
  type OpenPrivateRoot,
} from "./filesystem.js";

const MAX_SOURCE_CHUNK = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;

export interface ArtifactByteSourceContext {
  readonly candidate: ModelArtifactCandidate;
  readonly signal: AbortSignal;
}

export type ArtifactByteSource = (
  context: ArtifactByteSourceContext,
) => AsyncIterable<Uint8Array> | Promise<AsyncIterable<Uint8Array>>;

export interface AcquirePinnedArtifactOptions {
  readonly privateRoot: string;
  readonly consent: ArtifactAcquisitionConsent;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

interface InternalAcquireOptions extends AcquirePinnedArtifactOptions {
  readonly byteSource: ArtifactByteSource;
  readonly candidate?: ModelArtifactCandidate;
  readonly hooks?: {
    readonly beforePublish?: (destinationPath: string) => void | Promise<void>;
    readonly afterRename?: (destinationPath: string) => void | Promise<void>;
    readonly afterCacheOpen?: (destinationPath: string) => void | Promise<void>;
    readonly beforeCacheHash?: (
      destinationPath: string,
    ) => void | Promise<void>;
    readonly afterCacheClose?: (handle: FileHandle) => void | Promise<void>;
    readonly afterStagingOpen?: (stagingPath: string) => void | Promise<void>;
    readonly afterStagingClose?: (handle: FileHandle) => void | Promise<void>;
  };
}

interface Deadline {
  readonly signal: AbortSignal;
  check(): void;
  failure(): ArtifactError | undefined;
  race<T>(promise: Promise<T>): Promise<T>;
  stop(): void;
}

function createDeadline(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Deadline {
  const controller = new AbortController();
  let rejectDeadline: ((error: ArtifactError) => void) | undefined;
  let settled = false;
  let terminalError: ArtifactError | undefined;
  const expiresAt = performance.now() + timeoutMs;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const fail = (
    code: "artifact-acquisition-timeout" | "artifact-acquisition-aborted",
  ): ArtifactError => {
    const error = new ArtifactError(code);
    if (settled) return error;
    settled = true;
    terminalError = error;
    rejectDeadline?.(error);
    controller.abort();
    return error;
  };
  const timer = setTimeout(() => {
    fail("artifact-acquisition-timeout");
  }, timeoutMs);
  const onExternalAbort = () => fail("artifact-acquisition-aborted");
  const externallyAborted = () => externalSignal?.aborted === true;
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  if (externalSignal?.aborted === true) onExternalAbort();
  const check = () => {
    if (externallyAborted()) throw fail("artifact-acquisition-aborted");
    if (performance.now() >= expiresAt)
      throw fail("artifact-acquisition-timeout");
    if (terminalError !== undefined) throw terminalError;
  };
  return {
    signal: controller.signal,
    check,
    failure: () => terminalError,
    race: async <T>(promise: Promise<T>) => {
      check();
      const result = await Promise.race([promise, timeout]);
      check();
      return result;
    },
    stop: () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function validateTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > MAX_TIMEOUT_MS
  ) {
    throw new ArtifactError("artifact-request-invalid");
  }
  return timeout;
}

function validateCandidate(candidate: ModelArtifactCandidate): void {
  let source: URL;
  try {
    source = new URL(candidate.sourceUrl);
  } catch {
    throw new ArtifactError("artifact-request-invalid");
  }
  if (
    candidate.filename.length === 0 ||
    candidate.filename.length > 255 ||
    basename(candidate.filename) !== candidate.filename ||
    candidate.filename === "." ||
    candidate.filename === ".." ||
    source.protocol !== "https:" ||
    !/^[0-9a-f]{40}$/.test(candidate.revision) ||
    !Number.isSafeInteger(candidate.byteLength) ||
    candidate.byteLength < 1 ||
    !/^[0-9a-f]{64}$/.test(candidate.sha256) ||
    candidate.license !== "Apache-2.0" ||
    candidate.engine !== "llamacpp-completion"
  ) {
    throw new ArtifactError("artifact-request-invalid");
  }
}

async function hashDescriptor(
  handle: FileHandle,
  expectedSize: number,
  deadline?: Deadline,
): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  while (offset < expectedSize) {
    const length = Math.min(buffer.length, expectedSize - offset);
    deadline?.check();
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    deadline?.check();
    if (bytesRead === 0)
      throw new ArtifactError("artifact-verification-failed");
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  const extra = Buffer.allocUnsafe(1);
  deadline?.check();
  if ((await handle.read(extra, 0, 1, offset)).bytesRead !== 0) {
    throw new ArtifactError("artifact-verification-failed");
  }
  return hash.digest("hex");
}

async function verifyCache(
  root: OpenPrivateRoot,
  destination: string,
  candidate: ModelArtifactCandidate,
  deadline: Deadline,
  hook?: (destinationPath: string) => void | Promise<void>,
  beforeHash?: (destinationPath: string) => void | Promise<void>,
  afterClose?: (handle: FileHandle) => void | Promise<void>,
): Promise<boolean> {
  deadline.check();
  if (!(await pathExists(destination))) return false;
  deadline.check();
  await assertRootStable(root);
  deadline.check();
  const opened = await openRegularPrivateFile(
    destination,
    "artifact-cache-unsafe",
  );
  try {
    deadline.check();
    if (hook !== undefined)
      await deadline.race(Promise.resolve(hook(destination)));
    if (opened.snapshot.size !== candidate.byteLength) {
      throw new ArtifactError("artifact-cache-unsafe");
    }
    if (beforeHash !== undefined)
      await deadline.race(Promise.resolve(beforeHash(destination)));
    const digest = await hashDescriptor(
      opened.handle,
      candidate.byteLength,
      deadline,
    );
    if (digest !== candidate.sha256) {
      throw new ArtifactError("artifact-cache-unsafe");
    }
    await assertFileStable(
      destination,
      opened.handle,
      opened.snapshot,
      "artifact-cache-unsafe",
    );
    deadline.check();
    await assertRootStable(root);
    deadline.check();
    return true;
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-cache-unsafe");
  } finally {
    await opened.handle.close().catch(() => undefined);
    await afterClose?.(opened.handle);
  }
}

async function writeAll(
  handle: FileHandle,
  chunk: Uint8Array,
  deadline: Deadline,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    deadline.check();
    const { bytesWritten } = await handle.write(
      chunk,
      offset,
      chunk.byteLength - offset,
    );
    deadline.check();
    if (bytesWritten === 0) throw new ArtifactError("artifact-source-failed");
    offset += bytesWritten;
  }
}

async function openStagingFile(
  root: OpenPrivateRoot,
  filename: string,
): Promise<{ path: string; handle: FileHandle; snapshot: Stats }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const path = join(
      root.canonicalRoot,
      `.${filename}.${randomBytes(12).toString("hex")}.partial`,
    );
    let handle: FileHandle | undefined;
    let snapshot: Stats | undefined;
    try {
      handle = await open(
        path,
        constants.O_RDWR |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      snapshot = await handle.stat();
      await handle.chmod(0o600);
      snapshot = await handle.stat();
      if (!snapshot.isFile() || snapshot.nlink !== 1) {
        throw new ArtifactError("artifact-publish-failed");
      }
      return { path, handle, snapshot };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlinkIfSame(path, snapshot);
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        continue;
      }
      throw new ArtifactError("artifact-publish-failed");
    }
  }
  throw new ArtifactError("artifact-publish-failed");
}

async function streamIntoStaging(
  staging: FileHandle,
  source: ArtifactByteSource,
  candidate: ModelArtifactCandidate,
  deadline: Deadline,
): Promise<void> {
  const hash = createHash("sha256");
  let total = 0;
  let iterator: AsyncIterator<Uint8Array> | undefined;
  try {
    const iterable = await deadline.race(
      Promise.resolve(source({ candidate, signal: deadline.signal })),
    );
    if (
      iterable === null ||
      typeof iterable[Symbol.asyncIterator] !== "function"
    ) {
      throw new ArtifactError("artifact-source-failed");
    }
    iterator = iterable[Symbol.asyncIterator]();
    for (;;) {
      const item = await deadline.race(Promise.resolve(iterator.next()));
      if (item.done === true) break;
      const chunk = item.value;
      if (
        !(chunk instanceof Uint8Array) ||
        chunk.byteLength === 0 ||
        chunk.byteLength > MAX_SOURCE_CHUNK
      ) {
        throw new ArtifactError("artifact-source-failed");
      }
      if (chunk.byteLength > candidate.byteLength - total) {
        throw new ArtifactError("artifact-size-mismatch");
      }
      await writeAll(staging, chunk, deadline);
      hash.update(chunk);
      total += chunk.byteLength;
    }
    if (total !== candidate.byteLength) {
      throw new ArtifactError("artifact-size-mismatch");
    }
    if (hash.digest("hex") !== candidate.sha256) {
      throw new ArtifactError("artifact-hash-mismatch");
    }
    deadline.check();
    await staging.sync();
    deadline.check();
  } catch (error) {
    const deadlineFailure = deadline.failure();
    if (deadlineFailure !== undefined) throw deadlineFailure;
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-source-failed");
  } finally {
    if (iterator?.return !== undefined) {
      void Promise.resolve(iterator.return()).catch(() => undefined);
    }
  }
}

async function publish(
  root: OpenPrivateRoot,
  stagingPath: string,
  stagingHandle: FileHandle,
  stagingStat: Stats,
  destination: string,
  candidate: ModelArtifactCandidate,
  deadline: Deadline,
  beforePublish?: (destinationPath: string) => void | Promise<void>,
  afterRename?: (destinationPath: string) => void | Promise<void>,
): Promise<void> {
  let published = false;
  try {
    deadline.check();
    await assertRootStable(root);
    deadline.check();
    if (beforePublish !== undefined)
      await deadline.race(Promise.resolve(beforePublish(destination)));
    try {
      await link(stagingPath, destination);
    } catch {
      throw new ArtifactError("artifact-publish-collision");
    }
    published = true;
    deadline.check();
    const linkedStat = await stagingHandle.stat();
    deadline.check();
    if (linkedStat.nlink !== 2)
      throw new ArtifactError("artifact-publish-failed");
    await assertFileStable(
      destination,
      stagingHandle,
      linkedStat,
      "artifact-publish-failed",
    );
    deadline.check();
    await assertRootStable(root);
    deadline.check();
    await unlink(stagingPath);
    deadline.check();
    if (afterRename !== undefined)
      await deadline.race(Promise.resolve(afterRename(destination)));
    const publishedStat = await lstat(destination);
    deadline.check();
    const descriptor = await stagingHandle.stat();
    deadline.check();
    if (
      publishedStat.dev !== descriptor.dev ||
      publishedStat.ino !== descriptor.ino ||
      !publishedStat.isFile() ||
      publishedStat.nlink !== 1 ||
      descriptor.nlink !== 1 ||
      publishedStat.size !== candidate.byteLength
    ) {
      throw new ArtifactError("artifact-publish-failed");
    }
    const digest = await hashDescriptor(
      stagingHandle,
      candidate.byteLength,
      deadline,
    );
    if (digest !== candidate.sha256)
      throw new ArtifactError("artifact-publish-failed");
    await assertFileStable(
      destination,
      stagingHandle,
      descriptor,
      "artifact-publish-failed",
    );
    deadline.check();
    await root.handle.sync();
    deadline.check();
    await assertRootStable(root);
    deadline.check();
  } catch (error) {
    if (published) await unlinkIfSame(destination, stagingStat);
    const deadlineFailure = deadline.failure();
    if (deadlineFailure !== undefined) throw deadlineFailure;
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-publish-failed");
  }
}

export async function internalAcquireArtifact(
  options: InternalAcquireOptions,
): Promise<VerifiedArtifactCapability> {
  const candidate = options.candidate ?? PINNED_MODEL_CANDIDATE;
  createPinnedArtifactDisclosure(options.privateRoot);
  validateCandidate(candidate);
  const timeoutMs = validateTimeout(options.timeoutMs);
  if (
    options.signal !== undefined &&
    !(options.signal instanceof AbortSignal)
  ) {
    throw new ArtifactError("artifact-request-invalid");
  }
  if (options.signal?.aborted === true)
    throw new ArtifactError("artifact-acquisition-aborted");
  if (
    typeof options.byteSource !== "function" ||
    !internalConsumeConsent(options.consent, {
      candidateId: candidate.id,
      privateRoot: options.privateRoot,
    })
  ) {
    throw new ArtifactError("artifact-consent-required");
  }

  const deadline = createDeadline(timeoutMs, options.signal);
  let root: OpenPrivateRoot | undefined;
  try {
    deadline.check();
    root = await openPrivateRoot(options.privateRoot);
    deadline.check();
    const destination = join(root.canonicalRoot, candidate.filename);
    if (
      await verifyCache(
        root,
        destination,
        candidate,
        deadline,
        options.hooks?.afterCacheOpen,
        options.hooks?.beforeCacheHash,
        options.hooks?.afterCacheClose,
      )
    ) {
      return internalIssueArtifact({ canonicalPath: destination, candidate });
    }

    deadline.check();
    const staging = await openStagingFile(root, candidate.filename);
    try {
      deadline.check();
      if (options.hooks?.afterStagingOpen !== undefined) {
        await deadline.race(
          Promise.resolve(options.hooks.afterStagingOpen(staging.path)),
        );
      }
      await streamIntoStaging(
        staging.handle,
        options.byteSource,
        candidate,
        deadline,
      );
      const finalizedStaging = await staging.handle.stat();
      deadline.check();
      if (
        finalizedStaging.size !== candidate.byteLength ||
        finalizedStaging.nlink !== 1 ||
        (await hashDescriptor(
          staging.handle,
          candidate.byteLength,
          deadline,
        )) !== candidate.sha256
      ) {
        throw new ArtifactError("artifact-verification-failed");
      }
      await assertFileStable(
        staging.path,
        staging.handle,
        finalizedStaging,
        "artifact-verification-failed",
      );
      deadline.check();
      await publish(
        root,
        staging.path,
        staging.handle,
        finalizedStaging,
        destination,
        candidate,
        deadline,
        options.hooks?.beforePublish,
        options.hooks?.afterRename,
      );
      return internalIssueArtifact({ canonicalPath: destination, candidate });
    } finally {
      await staging.handle.close().catch(() => undefined);
      await options.hooks?.afterStagingClose?.(staging.handle);
      await unlinkIfSame(staging.path, staging.snapshot);
    }
  } finally {
    if (root !== undefined) await root.handle.close().catch(() => undefined);
    deadline.stop();
  }
}

export async function acquirePinnedArtifact(
  options: AcquirePinnedArtifactOptions,
): Promise<VerifiedArtifactCapability> {
  return internalAcquireArtifact({
    ...options,
    byteSource: pinnedHttpsByteSource,
  });
}

async function pinnedHttpsByteSource({
  candidate,
  signal,
}: ArtifactByteSourceContext): Promise<AsyncIterable<Uint8Array>> {
  try {
    const response = await fetch(candidate.sourceUrl, {
      method: "GET",
      redirect: "follow",
      signal,
    });
    if (!response.ok || response.body === null) {
      throw new ArtifactError("artifact-source-failed");
    }
    if (new URL(response.url).protocol !== "https:") {
      throw new ArtifactError("artifact-source-failed");
    }
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) !== candidate.byteLength)
    ) {
      throw new ArtifactError("artifact-size-mismatch");
    }
    return response.body;
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-source-failed");
  }
}
