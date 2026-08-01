import type { ChildProcess } from "node:child_process";
import { performance } from "node:perf_hooks";

import {
  LIFECYCLE_PHASES,
  parseChildEvent,
  type LifecyclePhase,
} from "./protocol.js";

export interface ExecutorLimits {
  overallMs: number;
  phaseMs: Readonly<Record<LifecyclePhase, number>>;
  termGraceMs: number;
  killSettleMs: number;
  postExitSweepMs: number;
  maxEvents: number;
  maxEventBytes: number;
  maxAggregateEventBytes: number;
  maxOutputBytes: number;
}

export const DEFAULT_EXECUTOR_LIMITS: ExecutorLimits = Object.freeze({
  overallMs: 180_000,
  phaseMs: Object.freeze({
    "qvac-import": 15_000,
    "worker-start": 10_000,
    "model-load": 120_000,
    inference: 30_000,
    "clean-shutdown": 10_000,
  }),
  termGraceMs: 250,
  killSettleMs: 2_000,
  postExitSweepMs: 25,
  maxEvents: 16,
  maxEventBytes: 4 * 1024,
  maxAggregateEventBytes: 16 * 1024,
  maxOutputBytes: 16 * 1024,
});

type ProbeEvent =
  | {
      type: "phase";
      name: LifecyclePhase;
      status: "passed" | "failed" | "unknown" | "skipped";
      duration_ms: number | null;
    }
  | { type: "backend"; backend: "cpu" | "gpu" }
  | {
      type: "termination";
      kind:
        | "clean-exit"
        | "exit-code"
        | "signal"
        | "timeout"
        | "spawn-error"
        | "not-started"
        | "unknown";
      exit_code: number | null;
      signal:
        | "SIGABRT"
        | "SIGBUS"
        | "SIGILL"
        | "SIGKILL"
        | "SIGSEGV"
        | "SIGTERM"
        | "UNKNOWN"
        | null;
      last_completed_phase: LifecyclePhase | null;
    }
  | {
      type: "result";
      workload_status: "passed" | "failed" | "unknown" | "skipped";
      completion_observed: boolean;
      failure: {
        category:
          | "none"
          | "native-runtime"
          | "worker-crash"
          | "timeout"
          | "workload-failed"
          | "spawn-error"
          | "unknown";
        phase: LifecyclePhase | null;
        code: string | null;
        sanitized_excerpt: null;
      };
    };

class BoundedTail {
  readonly #limit: number;
  #buffer = Buffer.alloc(0);

  constructor(limit: number) {
    this.#limit = limit;
  }

  append(value: string | Buffer): void {
    const incoming = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (incoming.length >= this.#limit) {
      this.#buffer = Buffer.from(
        incoming.subarray(incoming.length - this.#limit),
      );
      return;
    }
    const combined = Buffer.concat([this.#buffer, incoming]);
    this.#buffer =
      combined.length > this.#limit
        ? Buffer.from(combined.subarray(combined.length - this.#limit))
        : combined;
  }

  clear(): void {
    this.#buffer.fill(0);
    this.#buffer = Buffer.alloc(0);
  }
}

function elapsed(startedAt: number): number {
  return Math.min(
    3_600_000,
    Math.max(0, Math.round(performance.now() - startedAt)),
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined || process.platform === "win32") return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group may already be empty.
  }
}

type ReportSignal =
  | "SIGABRT"
  | "SIGBUS"
  | "SIGILL"
  | "SIGKILL"
  | "SIGSEGV"
  | "SIGTERM"
  | "UNKNOWN"
  | null;

function normalizedSignal(value: NodeJS.Signals | null): ReportSignal {
  if (value === null) return null;
  if (
    value === "SIGABRT" ||
    value === "SIGBUS" ||
    value === "SIGILL" ||
    value === "SIGKILL" ||
    value === "SIGSEGV" ||
    value === "SIGTERM"
  )
    return value;
  return "UNKNOWN";
}

function timeoutCode(phase: LifecyclePhase): string {
  return `${phase.replaceAll("-", "_").toUpperCase()}_TIMEOUT`;
}

function failureCode(phase: LifecyclePhase): string {
  return `${phase.replaceAll("-", "_").toUpperCase()}_FAILED`;
}

export function notStartedEvents(code: string): readonly unknown[] {
  return [
    {
      type: "phase",
      name: "qvac-import",
      status: "skipped",
      duration_ms: null,
    },
    {
      type: "termination",
      kind: "spawn-error",
      exit_code: null,
      signal: null,
      last_completed_phase: null,
    },
    {
      type: "result",
      workload_status: "unknown",
      completion_observed: false,
      failure: {
        category: "spawn-error",
        phase: "qvac-import",
        code,
        sanitized_excerpt: null,
      },
    },
  ];
}

type TerminationOverride = "timeout" | "protocol" | null;

export class ExecutorSupervisor {
  readonly #limits: ExecutorLimits;
  readonly #stdout: BoundedTail;
  readonly #stderr: BoundedTail;
  readonly #phases: Extract<ProbeEvent, { type: "phase" }>[] = [];
  readonly #completion: Promise<readonly unknown[]>;
  #resolveCompletion!: (events: readonly unknown[]) => void;
  #child: ChildProcess | undefined;
  #pid: number | undefined;
  #attachedAt = performance.now();
  #expectedPhaseIndex = 0;
  #openPhase: LifecyclePhase | null = null;
  #openPhaseStartedAt = 0;
  #firstFailure: LifecyclePhase | null = null;
  #backend: "cpu" | "gpu" | null = null;
  #completionObserved = false;
  #nextSequence = 0;
  #eventCount = 0;
  #aggregateEventBytes = 0;
  #override: TerminationOverride = null;
  #timeoutPhase: LifecyclePhase | null = null;
  #timeoutAfterFailure = false;
  #protocolPhase: LifecyclePhase | null = null;
  #lifecycleTerminal = false;
  #terminating = false;
  #finalized = false;
  #disposed = false;
  #overallTimer: NodeJS.Timeout | undefined;
  #phaseTimer: NodeJS.Timeout | undefined;
  #killTimer: NodeJS.Timeout | undefined;
  #settleTimer: NodeJS.Timeout | undefined;

  constructor(limits: ExecutorLimits = DEFAULT_EXECUTOR_LIMITS) {
    this.#limits = limits;
    this.#stdout = new BoundedTail(limits.maxOutputBytes);
    this.#stderr = new BoundedTail(limits.maxOutputBytes);
    this.#completion = new Promise((resolve) => {
      this.#resolveCompletion = resolve;
    });
  }

  attach(child: ChildProcess): void {
    if (this.#child !== undefined || process.platform === "win32") {
      throw new Error("executor-supervision-unavailable");
    }
    if (
      child.pid === undefined ||
      child.stdout === null ||
      child.stderr === null
    ) {
      throw new Error("executor-supervision-unavailable");
    }
    this.#child = child;
    this.#pid = child.pid;
    this.#attachedAt = performance.now();
    child.stdout.on("data", this.#onStdout);
    child.stderr.on("data", this.#onStderr);
    child.on("message", this.#onMessage);
    child.once("exit", this.#onExit);
    child.once("error", this.#onError);
    this.#overallTimer = setTimeout(
      () => this.#timeout(),
      this.#limits.overallMs,
    );
    this.#armPhaseTimer();
  }

  wait(): Promise<readonly unknown[]> {
    return this.#completion;
  }

  disposeAfterLaunchFailure(): void {
    this.#disposed = true;
    this.#clearTimers();
    this.#detachListeners();
    this.#stdout.clear();
    this.#stderr.clear();
  }

  readonly #onStdout = (chunk: Buffer | string): void =>
    this.#stdout.append(chunk);
  readonly #onStderr = (chunk: Buffer | string): void =>
    this.#stderr.append(chunk);

  readonly #onError = (): void => {
    if (this.#child?.pid === undefined) void this.#finalize(null, null);
  };

  readonly #onExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    void this.#finalize(code, signal);
  };

  readonly #onMessage = (message: unknown): void => {
    if (this.#finalized || this.#disposed || this.#override !== null) return;
    if (this.#lifecycleTerminal) {
      this.#protocolFailure();
      return;
    }
    let bytes: number;
    try {
      bytes = Buffer.byteLength(JSON.stringify(message));
    } catch {
      this.#protocolFailure();
      return;
    }
    this.#eventCount += 1;
    this.#aggregateEventBytes += bytes;
    if (
      this.#eventCount > this.#limits.maxEvents ||
      bytes > this.#limits.maxEventBytes ||
      this.#aggregateEventBytes > this.#limits.maxAggregateEventBytes
    ) {
      this.#protocolFailure();
      return;
    }
    const event = parseChildEvent(message);
    if (event === null || event.sequence !== this.#nextSequence) {
      this.#protocolFailure();
      return;
    }
    this.#nextSequence += 1;

    if (event.type === "backend") {
      if (this.#openPhase !== "inference" || this.#backend !== null) {
        this.#protocolFailure();
        return;
      }
      this.#backend = event.backend;
      return;
    }

    const expected = LIFECYCLE_PHASES[this.#expectedPhaseIndex];
    if (event.state === "started") {
      if (this.#openPhase !== null || event.phase !== expected) {
        this.#protocolFailure();
        return;
      }
      this.#openPhase = event.phase;
      this.#openPhaseStartedAt = performance.now();
      this.#armPhaseTimer();
      return;
    }

    if (this.#openPhase !== event.phase || event.phase !== expected) {
      this.#protocolFailure();
      return;
    }
    this.#phases.push({
      type: "phase",
      name: event.phase,
      status: event.state === "succeeded" ? "passed" : "failed",
      duration_ms: elapsed(this.#openPhaseStartedAt),
    });
    this.#openPhase = null;
    if (event.phase === "inference" && event.state === "succeeded") {
      this.#completionObserved = true;
    }
    if (event.state === "failed" && this.#firstFailure === null) {
      this.#firstFailure = event.phase;
      this.#expectedPhaseIndex = LIFECYCLE_PHASES.length - 1;
    } else if (event.phase !== "clean-shutdown") {
      this.#expectedPhaseIndex += 1;
    }
    if (event.phase === "clean-shutdown") {
      if (event.state === "failed" && this.#firstFailure === null)
        this.#firstFailure = event.phase;
      this.#lifecycleTerminal = true;
      this.#clearPhaseTimer();
    } else {
      this.#armPhaseTimer();
    }
  };

  #armPhaseTimer(): void {
    this.#clearPhaseTimer();
    const phase = LIFECYCLE_PHASES[this.#expectedPhaseIndex];
    if (phase === undefined) return;
    this.#phaseTimer = setTimeout(
      () => this.#timeout(),
      this.#limits.phaseMs[phase],
    );
  }

  #clearPhaseTimer(): void {
    if (this.#phaseTimer !== undefined) clearTimeout(this.#phaseTimer);
    this.#phaseTimer = undefined;
  }

  #timeout(): void {
    if (this.#override !== null || this.#finalized) return;
    this.#timeoutAfterFailure = this.#firstFailure !== null;
    this.#override = "timeout";
    this.#timeoutPhase =
      this.#openPhase ??
      LIFECYCLE_PHASES[this.#expectedPhaseIndex] ??
      "qvac-import";
    this.#terminate();
  }

  #protocolFailure(): void {
    if (this.#override !== null || this.#finalized) return;
    this.#override = "protocol";
    this.#protocolPhase =
      this.#openPhase ??
      LIFECYCLE_PHASES[this.#expectedPhaseIndex] ??
      "qvac-import";
    this.#terminate();
  }

  #terminate(): void {
    if (this.#terminating) return;
    this.#terminating = true;
    this.#clearPhaseTimer();
    signalGroup(this.#pid, "SIGTERM");
    this.#killTimer = setTimeout(() => {
      signalGroup(this.#pid, "SIGKILL");
      this.#settleTimer = setTimeout(
        () => void this.#finalize(null, null),
        this.#limits.killSettleMs,
      );
    }, this.#limits.termGraceMs);
  }

  async #finalize(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (this.#finalized || this.#disposed) return;
    this.#finalized = true;
    this.#clearTimers();
    signalGroup(this.#pid, "SIGTERM");
    await delay(this.#limits.postExitSweepMs);
    signalGroup(this.#pid, "SIGKILL");
    this.#ensureTerminalPhase(code, signal);
    const events = this.#buildEvents(code, signal);
    this.#detachListeners();
    this.#stdout.clear();
    this.#stderr.clear();
    this.#resolveCompletion(events);
  }

  #ensureTerminalPhase(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.#override === "protocol") {
      const phase = this.#protocolPhase ?? this.#openPhase ?? "qvac-import";
      if (!this.#phases.some(({ name }) => name === phase)) {
        this.#phases.push({
          type: "phase",
          name: phase,
          status: "unknown",
          duration_ms: null,
        });
      }
      return;
    }
    const failurePhase =
      this.#timeoutPhase ??
      this.#openPhase ??
      LIFECYCLE_PHASES[this.#expectedPhaseIndex] ??
      "clean-shutdown";
    const alreadyRecorded = this.#phases.some(
      ({ name }) => name === failurePhase,
    );
    if (
      code === 0 &&
      signal === null &&
      this.#override === null &&
      !this.#lifecycleTerminal &&
      this.#firstFailure === null
    ) {
      // A clean root exit is not evidence that the unfinished phase failed.
      if (!alreadyRecorded) {
        this.#phases.push({
          type: "phase",
          name: failurePhase,
          status: "unknown",
          duration_ms: null,
        });
      }
      return;
    }
    if (!alreadyRecorded && this.#firstFailure === null) {
      this.#phases.push({
        type: "phase",
        name: failurePhase,
        status: "failed",
        duration_ms:
          this.#openPhase === failurePhase
            ? elapsed(this.#openPhaseStartedAt)
            : elapsed(this.#attachedAt),
      });
      this.#firstFailure = failurePhase;
    }
  }

  #lastCompletedPhase(): LifecyclePhase | null {
    let last: LifecyclePhase | null = null;
    for (const phase of LIFECYCLE_PHASES) {
      const event = this.#phases.find(({ name }) => name === phase);
      if (event?.status !== "passed") break;
      last = phase;
    }
    return last;
  }

  #reportedPhases(): readonly Extract<ProbeEvent, { type: "phase" }>[] {
    if (this.#firstFailure === null) return this.#phases;
    const failedIndex = LIFECYCLE_PHASES.indexOf(this.#firstFailure);
    return this.#phases.filter(
      ({ name }) => LIFECYCLE_PHASES.indexOf(name) <= failedIndex,
    );
  }

  #buildEvents(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): readonly unknown[] {
    const allPassed =
      this.#firstFailure === null &&
      LIFECYCLE_PHASES.every((phase) =>
        this.#phases.some(
          ({ name, status }) => name === phase && status === "passed",
        ),
      );
    let termination: Extract<ProbeEvent, { type: "termination" }>;
    if (this.#override === "timeout") {
      termination = {
        type: "termination",
        kind: "timeout",
        exit_code: null,
        signal: null,
        last_completed_phase: this.#lastCompletedPhase(),
      };
    } else if (this.#override === "protocol") {
      termination = {
        type: "termination",
        kind: "unknown",
        exit_code: null,
        signal: null,
        last_completed_phase: this.#lastCompletedPhase(),
      };
    } else if (signal !== null) {
      termination = {
        type: "termination",
        kind: "signal",
        exit_code: null,
        signal: normalizedSignal(signal),
        last_completed_phase: this.#lastCompletedPhase(),
      };
    } else if (code === 0) {
      termination = {
        type: "termination",
        kind: "clean-exit",
        exit_code: 0,
        signal: null,
        last_completed_phase: this.#lastCompletedPhase(),
      };
    } else if (code !== null) {
      termination = {
        type: "termination",
        kind: "exit-code",
        exit_code: Math.max(0, code),
        signal: null,
        last_completed_phase: this.#lastCompletedPhase(),
      };
    } else {
      termination = {
        type: "termination",
        kind: "unknown",
        exit_code: null,
        signal: null,
        last_completed_phase: this.#lastCompletedPhase(),
      };
    }

    let result: Extract<ProbeEvent, { type: "result" }>;
    if (allPassed && code === 0 && this.#override === null) {
      result = {
        type: "result",
        workload_status: "passed",
        completion_observed: true,
        failure: {
          category: "none",
          phase: null,
          code: null,
          sanitized_excerpt: null,
        },
      };
    } else if (this.#override === "timeout") {
      const phase = this.#timeoutPhase ?? "qvac-import";
      result = this.#timeoutAfterFailure
        ? {
            type: "result",
            workload_status: "unknown",
            completion_observed: false,
            failure: {
              category: "unknown",
              phase: this.#firstFailure,
              code: "CLEANUP_TIMEOUT_AFTER_FAILURE",
              sanitized_excerpt: null,
            },
          }
        : allPassed
          ? {
              type: "result",
              workload_status: "unknown",
              completion_observed: false,
              failure: {
                category: "unknown",
                phase: "clean-shutdown",
                code: "TIMEOUT_AFTER_LIFECYCLE",
                sanitized_excerpt: null,
              },
            }
          : {
              type: "result",
              workload_status: "failed",
              completion_observed: false,
              failure: {
                category: "timeout",
                phase,
                code: timeoutCode(phase),
                sanitized_excerpt: null,
              },
            };
    } else if (this.#override === "protocol") {
      result = {
        type: "result",
        workload_status: "unknown",
        completion_observed: false,
        failure: {
          category: "unknown",
          phase: this.#protocolPhase ?? this.#openPhase ?? "qvac-import",
          code: "RUNNER_PROTOCOL_INVALID",
          sanitized_excerpt: null,
        },
      };
    } else if (signal !== null) {
      const phase = this.#firstFailure ?? this.#openPhase;
      result =
        phase === null
          ? {
              type: "result",
              workload_status: "unknown",
              completion_observed: false,
              failure: {
                category: "unknown",
                phase: "clean-shutdown",
                code: "SIGNAL_AFTER_LIFECYCLE",
                sanitized_excerpt: null,
              },
            }
          : {
              type: "result",
              workload_status: "failed",
              completion_observed: false,
              failure: {
                category: "worker-crash",
                phase,
                code: "WORKER_SIGNAL",
                sanitized_excerpt: null,
              },
            };
    } else if (code === 0 && this.#firstFailure === "qvac-import") {
      // The report contract does not permit a native-runtime failure on exit 0.
      result = {
        type: "result",
        workload_status: "unknown",
        completion_observed: false,
        failure: {
          category: "unknown",
          phase: this.#firstFailure,
          code: "RUNNER_EXIT_UNEXPECTED",
          sanitized_excerpt: null,
        },
      };
    } else if (this.#firstFailure !== null) {
      const phase = this.#firstFailure;
      result = {
        type: "result",
        workload_status: "failed",
        completion_observed: false,
        failure: {
          category:
            phase === "qvac-import" ? "native-runtime" : "workload-failed",
          phase,
          code: failureCode(phase),
          sanitized_excerpt: null,
        },
      };
    } else {
      result = {
        type: "result",
        workload_status: "unknown",
        completion_observed: false,
        failure: {
          category: "unknown",
          phase:
            this.#openPhase ??
            LIFECYCLE_PHASES[this.#expectedPhaseIndex] ??
            "qvac-import",
          code: "RUNNER_EXIT_UNEXPECTED",
          sanitized_excerpt: null,
        },
      };
    }

    const reportedPhases = this.#reportedPhases();
    const inferenceAttempted = reportedPhases.some(
      ({ name, status }) =>
        name === "inference" && (status === "passed" || status === "failed"),
    );
    // An observation made during an incomplete inference is not fixed evidence.
    const backend: ProbeEvent[] =
      this.#backend === null || !inferenceAttempted
        ? []
        : [{ type: "backend", backend: this.#backend }];
    return [...reportedPhases, ...backend, termination, result];
  }

  #clearTimers(): void {
    this.#clearPhaseTimer();
    for (const timer of [
      this.#overallTimer,
      this.#killTimer,
      this.#settleTimer,
    ]) {
      if (timer !== undefined) clearTimeout(timer);
    }
    this.#overallTimer = undefined;
    this.#killTimer = undefined;
    this.#settleTimer = undefined;
  }

  #detachListeners(): void {
    const child = this.#child;
    if (child === undefined) return;
    child.stdout?.off("data", this.#onStdout);
    child.stderr?.off("data", this.#onStderr);
    child.off("message", this.#onMessage);
    child.off("exit", this.#onExit);
    child.off("error", this.#onError);
  }
}
