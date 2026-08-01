import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, URL } from "node:url";
import { PINNED_MODEL_CANDIDATE } from "./candidate.js";
import {
  type VerifiedArtifactCapability,
  internalIssueArtifact,
} from "./capabilities.js";
import { ArtifactError, type ArtifactErrorCode } from "./errors.js";

const MAX_MESSAGE_BYTES = 512;
const MAX_MESSAGES = 12;
const TERMINATION_GRACE_MS = 500;
const KILL_SETTLE_MS = 2_000;
const DEFAULT_RECOVERY_TIMEOUT_MS = 60_000;
const NETWORK_POLICY = "official-huggingface-finite-v1";
const ALLOWED_CHILD_ERRORS = new Set<ArtifactErrorCode>([
  "artifact-request-invalid",
  "artifact-consent-required",
  "artifact-private-root-unsafe",
  "artifact-cache-unsafe",
  "artifact-capacity-insufficient",
  "artifact-capacity-unavailable",
  "artifact-source-failed",
  "artifact-acquisition-timeout",
  "artifact-acquisition-aborted",
  "artifact-size-mismatch",
  "artifact-hash-mismatch",
  "artifact-publish-collision",
  "artifact-publish-failed",
  "artifact-verification-failed",
  "artifact-worker-failed",
  "artifact-worker-protocol-invalid",
]);
const HIT_STATES = ["accepted", "cache-hit", "capacity-ok", "ready"] as const;
const MISS_STATES = [
  "accepted",
  "cache-miss",
  "capacity-ok",
  "staging-open",
  "hard-linked",
  "staging-unlinked",
  "directory-synced",
  "ready",
] as const;

interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly spawnFailed: boolean;
}

interface ChildObservation {
  readonly rootExited: Promise<ChildExit>;
  readonly closed: Promise<ChildExit>;
  isRootExited(): boolean;
}

interface SupervisorOptions {
  readonly privateRoot: string;
  readonly sessionNonce: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly runnerUrl?: URL;
  readonly recoveryRunnerUrl?: URL;
  readonly recoveryTimeoutMs?: number;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cancelableDeadline<T>(
  ms: number,
  value: T,
): {
  readonly promise: Promise<T>;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(value), ms);
    timer.unref?.();
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

function drainBounded(stream: NodeJS.ReadableStream | null): void {
  let observed = 0;
  stream?.on("data", (chunk: unknown) => {
    if (observed < 64 * 1_024) {
      observed += Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(String(chunk));
    }
  });
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function fixedMessageSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return MAX_MESSAGE_BYTES + 1;
  }
}

function sendOne(child: ChildProcess, message: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!child.connected) {
      reject(new ArtifactError("artifact-worker-failed"));
      return;
    }
    child.send(message, (error) =>
      error === null
        ? resolve()
        : reject(new ArtifactError("artifact-worker-failed")),
    );
  });
}

function observeChild(child: ChildProcess): ChildObservation {
  let rootSettled = false;
  let closeSettled = false;
  let spawned = false;
  let resolveRoot: (result: ChildExit) => void;
  let resolveClose: (result: ChildExit) => void;
  const rootExited = new Promise<ChildExit>((resolve) => {
    resolveRoot = resolve;
  });
  const closed = new Promise<ChildExit>((resolve) => {
    resolveClose = resolve;
  });
  const finishRoot = (result: ChildExit) => {
    if (rootSettled) return;
    rootSettled = true;
    resolveRoot(result);
  };
  const finishClose = (result: ChildExit) => {
    if (closeSettled) return;
    closeSettled = true;
    resolveClose(result);
  };
  child.once("spawn", () => {
    spawned = true;
  });
  child.on("error", () => {
    if (!spawned) {
      const failure = { code: null, signal: null, spawnFailed: true } as const;
      finishRoot(failure);
      finishClose(failure);
    }
  });
  child.once("exit", (code, signal) =>
    finishRoot({ code, signal, spawnFailed: false }),
  );
  child.once("close", (code, signal) =>
    finishClose({ code, signal, spawnFailed: false }),
  );
  return { rootExited, closed, isRootExited: () => rootSettled };
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The single observation resolves a raced exit.
    }
  }
}

function groupExists(child: ChildProcess): boolean {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

async function sweepGroup(child: ChildProcess): Promise<void> {
  signalGroup(child, "SIGKILL");
  const expiresAt = performance.now() + KILL_SETTLE_MS;
  while (groupExists(child) && performance.now() < expiresAt) {
    await delay(20);
  }
  if (groupExists(child)) throw new ArtifactError("artifact-worker-failed");
}

async function awaitBoundedExit(
  observation: ChildObservation,
): Promise<ChildExit> {
  const deadline = cancelableDeadline(KILL_SETTLE_MS, undefined);
  const result = await Promise.race([observation.rootExited, deadline.promise]);
  deadline.cancel();
  if (result === undefined) throw new ArtifactError("artifact-worker-failed");
  return result;
}

async function awaitBoundedClose(
  observation: ChildObservation,
): Promise<ChildExit> {
  const deadline = cancelableDeadline(KILL_SETTLE_MS, undefined);
  const result = await Promise.race([observation.closed, deadline.promise]);
  deadline.cancel();
  if (result === undefined) throw new ArtifactError("artifact-worker-failed");
  return result;
}

async function terminateAndReap(
  child: ChildProcess,
  observation: ChildObservation,
): Promise<ChildExit> {
  if (!observation.isRootExited()) {
    signalGroup(child, "SIGTERM");
    const grace = cancelableDeadline(TERMINATION_GRACE_MS, undefined);
    await Promise.race([observation.rootExited, grace.promise]);
    grace.cancel();
  }
  if (!observation.isRootExited()) signalGroup(child, "SIGKILL");
  const result = await awaitBoundedExit(observation);
  await sweepGroup(child);
  await awaitBoundedClose(observation);
  return result;
}

function spawnFixed(runnerUrl: URL, cwd: string): ChildProcess {
  return fork(fileURLToPath(runnerUrl), [], {
    cwd,
    detached: true,
    env: {},
    execArgv: [],
    serialization: "json",
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

function isLegalPrefix(states: readonly string[]): boolean {
  return [HIT_STATES, MISS_STATES].some(
    (sequence) =>
      states.length <= sequence.length &&
      states.every((state, index) => state === sequence[index]),
  );
}

function isLegalErrorPrefix(states: readonly string[]): boolean {
  return (
    states.length >= 1 && states.at(-1) !== "ready" && isLegalPrefix(states)
  );
}

function exactSuccess(
  states: readonly string[],
  cache: "hit" | "miss",
): boolean {
  const expected = cache === "hit" ? HIT_STATES : MISS_STATES;
  return (
    states.length === expected.length &&
    states.every((state, index) => state === expected[index])
  );
}

async function runRecovery(
  privateRoot: string,
  sessionNonce: string,
  recoveryRunnerUrl: URL,
  timeoutMs: number,
): Promise<void> {
  let cwd: string | undefined;
  let child: ChildProcess | undefined;
  let observation: ChildObservation | undefined;
  try {
    cwd = await mkdtemp(join(tmpdir(), "qvac-atlas-recover-"));
    child = spawnFixed(recoveryRunnerUrl, cwd);
    observation = observeChild(child);
    drainBounded(child.stdout);
    drainBounded(child.stderr);
    let messages = 0;
    let terminalSeen = false;
    let success = false;
    let protocolInvalid = false;
    let violate: (() => void) | undefined;
    const violation = new Promise<"protocol">((resolve) => {
      violate = () => {
        protocolInvalid = true;
        resolve("protocol");
      };
    });
    child.on("message", (message: unknown) => {
      messages += 1;
      if (
        terminalSeen ||
        messages > 1 ||
        fixedMessageSize(message) > MAX_MESSAGE_BYTES ||
        typeof message !== "object" ||
        message === null ||
        !exactKeys(message, ["kind", "status"])
      ) {
        violate?.();
        return;
      }
      const record = message as Record<string, unknown>;
      if (
        record.kind !== "result" ||
        (record.status !== "success" && record.status !== "error")
      ) {
        violate?.();
        return;
      }
      terminalSeen = true;
      success = record.status === "success";
    });
    let sendSucceeded = false;
    void sendOne(child, { privateRoot, sessionNonce })
      .then(() => {
        sendSucceeded = true;
      })
      .catch(() => violate?.());
    const deadline = cancelableDeadline(timeoutMs, "timeout" as const);
    const outcome = await Promise.race([
      observation.rootExited,
      deadline.promise,
      violation,
    ]);
    deadline.cancel();
    let result: ChildExit;
    if (outcome === "timeout" || outcome === "protocol") {
      result = await terminateAndReap(child, observation);
      throw new ArtifactError("artifact-cleanup-failed");
    }
    result = outcome;
    await sweepGroup(child);
    await awaitBoundedClose(observation);
    if (
      result.spawnFailed ||
      result.code !== 0 ||
      result.signal !== null ||
      !terminalSeen ||
      !success ||
      !sendSucceeded ||
      protocolInvalid
    ) {
      throw new ArtifactError("artifact-cleanup-failed");
    }
  } catch {
    if (
      child !== undefined &&
      observation !== undefined &&
      !observation.isRootExited()
    ) {
      await terminateAndReap(child, observation).catch(() => undefined);
    }
    throw new ArtifactError("artifact-cleanup-failed");
  } finally {
    if (cwd !== undefined) {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** Relative-only seam. The package export map exposes no runner override. */
export async function internalRunAcquisitionSupervisor(
  options: SupervisorOptions,
): Promise<VerifiedArtifactCapability> {
  if (process.platform === "win32") {
    throw new ArtifactError("artifact-containment-unavailable");
  }
  if (isAborted(options.signal)) {
    throw new ArtifactError("artifact-acquisition-aborted");
  }
  let abort: (() => void) | undefined;
  const aborted = new Promise<"abort">((resolve) => {
    abort = () => resolve("abort");
    options.signal?.addEventListener("abort", abort, { once: true });
    if (isAborted(options.signal)) abort();
  });
  const startedAt = performance.now();
  const runnerUrl =
    options.runnerUrl ?? new URL("./acquisition-child.js", import.meta.url);
  const recoveryRunnerUrl =
    options.recoveryRunnerUrl ??
    new URL("./recovery-child.js", import.meta.url);
  const recoveryTimeoutMs =
    options.recoveryTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS;
  let cwd: string | undefined;
  let child: ChildProcess | undefined;
  let observation: ChildObservation | undefined;
  let recoveryAttempted = false;
  let ownedStagingAcknowledged = false;
  const recoverOnce = async () => {
    if (recoveryAttempted || !ownedStagingAcknowledged) return;
    recoveryAttempted = true;
    await runRecovery(
      options.privateRoot,
      options.sessionNonce,
      recoveryRunnerUrl,
      recoveryTimeoutMs,
    );
  };
  try {
    cwd = await mkdtemp(join(tmpdir(), "qvac-atlas-acquire-"));
    if (isAborted(options.signal)) {
      throw new ArtifactError("artifact-acquisition-aborted");
    }
    if (performance.now() - startedAt >= options.timeoutMs) {
      throw new ArtifactError("artifact-acquisition-timeout");
    }
    child = spawnFixed(runnerUrl, cwd);
    observation = observeChild(child);
    drainBounded(child.stdout);
    drainBounded(child.stderr);
    const states: string[] = [];
    let messages = 0;
    let terminal:
      | { readonly status: "success"; readonly cache: "hit" | "miss" }
      | { readonly status: "error"; readonly code: ArtifactErrorCode }
      | undefined;
    let protocolInvalid = false;
    let violate: (() => void) | undefined;
    const violation = new Promise<"protocol">((resolve) => {
      violate = () => {
        protocolInvalid = true;
        resolve("protocol");
      };
    });
    child.on("message", (message: unknown) => {
      messages += 1;
      if (
        terminal !== undefined ||
        messages > MAX_MESSAGES ||
        fixedMessageSize(message) > MAX_MESSAGE_BYTES ||
        typeof message !== "object" ||
        message === null
      ) {
        violate?.();
        return;
      }
      const record = message as Record<string, unknown>;
      if (exactKeys(record, ["kind", "token"]) && record.kind === "state") {
        if (typeof record.token !== "string") {
          violate?.();
          return;
        }
        states.push(record.token);
        if (!isLegalPrefix(states)) {
          violate?.();
          return;
        }
        if (record.token === "staging-open") ownedStagingAcknowledged = true;
        return;
      }
      if (
        exactKeys(record, ["cache", "kind", "status"]) &&
        record.kind === "result" &&
        record.status === "success" &&
        (record.cache === "hit" || record.cache === "miss") &&
        exactSuccess(states, record.cache)
      ) {
        terminal = { status: "success", cache: record.cache };
        return;
      }
      if (
        exactKeys(record, ["code", "kind", "status"]) &&
        record.kind === "result" &&
        record.status === "error" &&
        typeof record.code === "string" &&
        ALLOWED_CHILD_ERRORS.has(record.code as ArtifactErrorCode) &&
        isLegalErrorPrefix(states)
      ) {
        terminal = {
          status: "error",
          code: record.code as ArtifactErrorCode,
        };
        return;
      }
      violate?.();
    });

    let sendSucceeded = false;
    void sendOne(child, {
      privateRoot: options.privateRoot,
      sessionNonce: options.sessionNonce,
      timeoutMs: options.timeoutMs,
      networkPolicy: NETWORK_POLICY,
    })
      .then(() => {
        sendSucceeded = true;
      })
      .catch(() => violate?.());
    const remainingMs = Math.max(
      0,
      options.timeoutMs - (performance.now() - startedAt),
    );
    const deadline = cancelableDeadline(remainingMs, "timeout" as const);
    const outcome = await Promise.race([
      observation.rootExited,
      deadline.promise,
      aborted,
      violation,
    ]);
    deadline.cancel();

    if (
      outcome === "timeout" ||
      outcome === "abort" ||
      outcome === "protocol"
    ) {
      await terminateAndReap(child, observation);
      await recoverOnce();
      if (outcome === "abort") {
        throw new ArtifactError("artifact-acquisition-aborted");
      }
      if (outcome === "timeout") {
        throw new ArtifactError("artifact-acquisition-timeout");
      }
      throw new ArtifactError("artifact-worker-protocol-invalid");
    }

    await sweepGroup(child);
    await awaitBoundedClose(observation);
    if (isAborted(options.signal)) {
      await recoverOnce();
      throw new ArtifactError("artifact-acquisition-aborted");
    }
    if (protocolInvalid) {
      await recoverOnce();
      throw new ArtifactError("artifact-worker-protocol-invalid");
    }
    if (
      outcome.spawnFailed ||
      outcome.signal !== null ||
      terminal === undefined ||
      !sendSucceeded
    ) {
      await recoverOnce();
      throw new ArtifactError("artifact-worker-failed");
    }
    if (terminal.status === "error") {
      if (outcome.code !== 1) {
        await recoverOnce();
        throw new ArtifactError("artifact-worker-protocol-invalid");
      }
      throw new ArtifactError(terminal.code);
    }
    if (outcome.code !== 0 || !exactSuccess(states, terminal.cache)) {
      await recoverOnce();
      throw new ArtifactError("artifact-worker-protocol-invalid");
    }
    return internalIssueArtifact({
      canonicalPath: join(options.privateRoot, PINNED_MODEL_CANDIDATE.filename),
      candidate: PINNED_MODEL_CANDIDATE,
    });
  } catch (error) {
    if (
      child !== undefined &&
      observation !== undefined &&
      !observation.isRootExited()
    ) {
      try {
        await terminateAndReap(child, observation);
      } catch {
        throw new ArtifactError("artifact-worker-failed");
      }
      await recoverOnce();
    }
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-worker-failed");
  } finally {
    if (abort !== undefined)
      options.signal?.removeEventListener("abort", abort);
    if (cwd !== undefined) {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export function internalFreshSessionNonce(): string {
  return randomBytes(24).toString("hex");
}
