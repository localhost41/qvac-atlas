import { scanPrivacy } from "@qvac-atlas/schema";

import type { CheckStatus, LifecyclePhase, RunnerEvidence } from "./types.js";

export type FixtureScenario =
  "success" | "missing-qvac" | "worker-crash" | "timeout";

export interface RunnerExecutor {
  /**
   * Future production executors will be preconfigured with an ATLAS-015 audited
   * SDK grant. Structured IPC must never contain or accept an SDK path.
   */
  execute(): Promise<readonly unknown[]>;
}

type RunnerEvent =
  | {
      type: "phase";
      name: LifecyclePhase;
      status: CheckStatus;
      duration_ms: number | null;
    }
  | { type: "backend"; backend: "cpu" | "gpu" }
  | {
      type: "termination";
      kind: RunnerEvidence["termination"]["kind"];
      exit_code: number | null;
      signal: RunnerEvidence["termination"]["signal"];
      last_completed_phase: LifecyclePhase | null;
    }
  | {
      type: "result";
      workload_status: CheckStatus;
      completion_observed: boolean;
      failure: RunnerEvidence["result"]["failure"];
    };

const PHASES = new Set<LifecyclePhase>([
  "qvac-import",
  "worker-start",
  "model-load",
  "inference",
  "clean-shutdown",
]);
const STATUSES = new Set<CheckStatus>([
  "passed",
  "failed",
  "skipped",
  "unknown",
]);
const TERMINATIONS = new Set([
  "clean-exit",
  "exit-code",
  "signal",
  "timeout",
  "spawn-error",
  "not-started",
  "unknown",
]);
const SIGNALS = new Set([
  "SIGABRT",
  "SIGBUS",
  "SIGILL",
  "SIGKILL",
  "SIGSEGV",
  "SIGTERM",
  "UNKNOWN",
]);
const FAILURE_CATEGORIES = new Set([
  "none",
  "missing-qvac",
  "native-runtime",
  "worker-crash",
  "timeout",
  "backend-unobserved",
  "workload-failed",
  "spawn-error",
  "unknown",
]);
const FAILURE_PHASES = new Set([
  "discover-qvac",
  "run-doctor",
  "run-verification",
  ...PHASES,
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return (
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

function duration(value: unknown, status: CheckStatus): value is number | null {
  if (status === "passed" || status === "failed")
    return (
      Number.isInteger(value) &&
      Number(value) >= 0 &&
      Number(value) <= 3_600_000
    );
  return value === null;
}

function parseFailure(
  value: unknown,
): RunnerEvidence["result"]["failure"] | null {
  const item = record(value);
  if (
    item === null ||
    !exactKeys(item, ["category", "phase", "code", "sanitized_excerpt"])
  )
    return null;
  if (!FAILURE_CATEGORIES.has(String(item.category))) return null;
  if (item.phase !== null && !FAILURE_PHASES.has(String(item.phase)))
    return null;
  if (
    item.code !== null &&
    (typeof item.code !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(item.code))
  )
    return null;
  if (
    item.sanitized_excerpt !== null &&
    (typeof item.sanitized_excerpt !== "string" ||
      item.sanitized_excerpt.length < 1 ||
      item.sanitized_excerpt.length > 1024)
  )
    return null;
  return item as unknown as RunnerEvidence["result"]["failure"];
}

function parseEvent(value: unknown): RunnerEvent | null {
  const item = record(value);
  if (item === null || typeof item.type !== "string") return null;
  if (item.type === "phase") {
    if (!exactKeys(item, ["type", "name", "status", "duration_ms"]))
      return null;
    if (
      !PHASES.has(item.name as LifecyclePhase) ||
      !STATUSES.has(item.status as CheckStatus)
    )
      return null;
    if (!duration(item.duration_ms, item.status as CheckStatus)) return null;
    return item as unknown as RunnerEvent;
  }
  if (item.type === "backend") {
    if (
      !exactKeys(item, ["type", "backend"]) ||
      !["cpu", "gpu"].includes(String(item.backend))
    )
      return null;
    return item as unknown as RunnerEvent;
  }
  if (item.type === "termination") {
    if (
      !exactKeys(item, [
        "type",
        "kind",
        "exit_code",
        "signal",
        "last_completed_phase",
      ])
    )
      return null;
    if (!TERMINATIONS.has(String(item.kind))) return null;
    if (
      item.exit_code !== null &&
      (!Number.isInteger(item.exit_code) ||
        Number(item.exit_code) < 0 ||
        Number(item.exit_code) > 4_294_967_295)
    )
      return null;
    if (item.signal !== null && !SIGNALS.has(String(item.signal))) return null;
    if (
      item.last_completed_phase !== null &&
      !PHASES.has(item.last_completed_phase as LifecyclePhase)
    )
      return null;
    return item as unknown as RunnerEvent;
  }
  if (item.type === "result") {
    if (
      !exactKeys(item, [
        "type",
        "workload_status",
        "completion_observed",
        "failure",
      ])
    )
      return null;
    if (
      !STATUSES.has(item.workload_status as CheckStatus) ||
      typeof item.completion_observed !== "boolean"
    )
      return null;
    const failure = parseFailure(item.failure);
    if (failure === null) return null;
    return {
      type: "result",
      workload_status: item.workload_status as CheckStatus,
      completion_observed: item.completion_observed,
      failure,
    };
  }
  return null;
}

function rejectedEvidence(): RunnerEvidence {
  return {
    phases: [{ name: "qvac-import", status: "unknown", duration_ms: null }],
    backend_observation: {
      status: "unavailable",
      backend: null,
      method: "unavailable",
    },
    termination: {
      kind: "unknown",
      exit_code: null,
      signal: null,
      last_completed_phase: null,
    },
    result: {
      workload_status: "unknown",
      completion_observed: false,
      failure: {
        category: "unknown",
        phase: "qvac-import",
        code: "RUNNER_EVENT_REJECTED",
        sanitized_excerpt: null,
      },
    },
  };
}

export class StructuredRunnerAdapter {
  constructor(private readonly executor: RunnerExecutor) {}

  async run(): Promise<RunnerEvidence> {
    let raw: unknown;
    try {
      raw = await this.executor.execute();
    } catch {
      return rejectedEvidence();
    }
    if (!Array.isArray(raw) || raw.length > 32 || scanPrivacy(raw).length > 0)
      return rejectedEvidence();
    const events = raw.map(parseEvent);
    if (events.some((event) => event === null)) return rejectedEvidence();

    const phases = events.filter(
      (event): event is Extract<RunnerEvent, { type: "phase" }> =>
        event?.type === "phase",
    );
    const backends = events.filter(
      (event): event is Extract<RunnerEvent, { type: "backend" }> =>
        event?.type === "backend",
    );
    const terminations = events.filter(
      (event): event is Extract<RunnerEvent, { type: "termination" }> =>
        event?.type === "termination",
    );
    const results = events.filter(
      (event): event is Extract<RunnerEvent, { type: "result" }> =>
        event?.type === "result",
    );
    if (
      phases.length === 0 ||
      backends.length > 1 ||
      terminations.length !== 1 ||
      results.length !== 1
    )
      return rejectedEvidence();

    const inferenceAttempted = phases.some(
      ({ name, status }) =>
        name === "inference" && (status === "passed" || status === "failed"),
    );
    if (backends.length === 1 && !inferenceAttempted) return rejectedEvidence();

    return {
      phases: phases.map(({ name, status, duration_ms }) => ({
        name,
        status,
        duration_ms,
      })),
      backend_observation:
        backends.length === 1
          ? {
              status: "observed",
              backend: backends[0]?.backend ?? null,
              method: "runner-event",
            }
          : inferenceAttempted
            ? { status: "unavailable", backend: null, method: "unavailable" }
            : { status: "not-reached", backend: null, method: "unavailable" },
      termination: {
        kind: terminations[0]!.kind,
        exit_code: terminations[0]!.exit_code,
        signal: terminations[0]!.signal,
        last_completed_phase: terminations[0]!.last_completed_phase,
      },
      result: {
        workload_status: results[0]!.workload_status,
        completion_observed: results[0]!.completion_observed,
        failure: results[0]!.failure,
      },
    };
  }
}

const successEvents: readonly unknown[] = [
  { type: "phase", name: "qvac-import", status: "passed", duration_ms: 20 },
  { type: "phase", name: "worker-start", status: "passed", duration_ms: 200 },
  { type: "phase", name: "model-load", status: "passed", duration_ms: 800 },
  { type: "phase", name: "inference", status: "passed", duration_ms: 400 },
  { type: "phase", name: "clean-shutdown", status: "passed", duration_ms: 40 },
  { type: "backend", backend: "gpu" },
  {
    type: "termination",
    kind: "clean-exit",
    exit_code: 0,
    signal: null,
    last_completed_phase: "clean-shutdown",
  },
  {
    type: "result",
    workload_status: "passed",
    completion_observed: true,
    failure: {
      category: "none",
      phase: null,
      code: null,
      sanitized_excerpt: null,
    },
  },
];

const eventsByScenario: Record<FixtureScenario, readonly unknown[]> = {
  success: successEvents,
  "worker-crash": [
    { type: "phase", name: "qvac-import", status: "passed", duration_ms: 20 },
    { type: "phase", name: "worker-start", status: "failed", duration_ms: 30 },
    {
      type: "termination",
      kind: "signal",
      exit_code: null,
      signal: "SIGILL",
      last_completed_phase: "qvac-import",
    },
    {
      type: "result",
      workload_status: "failed",
      completion_observed: false,
      failure: {
        category: "worker-crash",
        phase: "worker-start",
        code: "WORKER_SIGILL",
        sanitized_excerpt: null,
      },
    },
  ],
  timeout: [
    { type: "phase", name: "qvac-import", status: "passed", duration_ms: 20 },
    { type: "phase", name: "worker-start", status: "passed", duration_ms: 200 },
    {
      type: "phase",
      name: "model-load",
      status: "failed",
      duration_ms: 60_000,
    },
    {
      type: "termination",
      kind: "timeout",
      exit_code: null,
      signal: null,
      last_completed_phase: "worker-start",
    },
    {
      type: "result",
      workload_status: "failed",
      completion_observed: false,
      failure: {
        category: "timeout",
        phase: "model-load",
        code: "MODEL_LOAD_TIMEOUT",
        sanitized_excerpt: null,
      },
    },
  ],
  "missing-qvac": [
    {
      type: "phase",
      name: "qvac-import",
      status: "skipped",
      duration_ms: null,
    },
    {
      type: "termination",
      kind: "not-started",
      exit_code: null,
      signal: null,
      last_completed_phase: null,
    },
    {
      type: "result",
      workload_status: "skipped",
      completion_observed: false,
      failure: {
        category: "missing-qvac",
        phase: "discover-qvac",
        code: "QVAC_NOT_FOUND",
        sanitized_excerpt: null,
      },
    },
  ],
};

export class FakeRunnerExecutor implements RunnerExecutor {
  constructor(private readonly scenario: FixtureScenario) {}
  async execute(): Promise<readonly unknown[]> {
    return structuredClone(eventsByScenario[this.scenario]);
  }
}
