import { scanPrivacy } from "@qvac-atlas/schema";

import { collectPlatform, type PlatformSource } from "./platform.js";
import {
  assembleProbeReport,
  serializeReport,
  validateLocalReport,
  withProbePublication,
} from "./report.js";
import {
  RealProbeStateMachine,
  type RealProbeStage,
} from "./real-state-machine.js";
import type {
  AtlasReport,
  CheckEvidence,
  QvacEvidence,
  RunnerEvidence,
} from "./types.js";

export const REAL_PRIVACY_DISCLOSURE = Object.freeze({
  kind: "real-probe-privacy-v1" as const,
  collection:
    "allowlisted platform, normalized project-local Doctor, and structured lifecycle evidence",
  projectCodeExecutes: true,
  candidateNonClaim: true,
  installs: false,
  uploads: false,
  artifactEffectsBeforePreview: true,
});

export const PROJECT_CODE_DISCLOSURE = Object.freeze({
  kind: "project-code-v1" as const,
  package: "@qvac/sdk" as const,
  version: "0.16.0" as const,
  source: "exact-current-project" as const,
  containment: "isolated-and-bounded-not-a-sandbox" as const,
});

export const COMBINED_WORKLOAD_DISCLOSURE = Object.freeze({
  kind: "artifact-and-workload-v1" as const,
  artifact: Object.freeze({
    candidateId: "smollm2-360m-instruct-q8_0",
    filename: "smollm2-360m-instruct-q8_0.gguf",
    revision: "593b5a2e04c8f3e4ee880263f93e0bd2901ad47f",
    sourceUrl:
      "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf",
    license: "Apache-2.0" as const,
    byteLength: 386_404_992,
    approximateSize: "about 368.5 MiB" as const,
    sha256: "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
    destination: "~/.qvac-atlas-models/smollm2-360m-instruct-q8_0.gguf",
    requestedModes: "0700-directory/0600-file" as const,
    cachePolicy: "full-size-hash-identity-verification-on-every-reuse" as const,
    networkPolicy: "cache-miss-only-bounded-official-redirects" as const,
    invalidFinalPolicy: "never-repair-delete-or-overwrite" as const,
    retentionPolicy: "cached-until-user-removes" as const,
    cleanupPolicy: "owned-attempt-staging-only" as const,
    crashPolicy:
      "named-partial-may-require-manual-review-and-is-never-treated-as-a-model" as const,
  }),
  workload: Object.freeze({
    profileId: "atlas-smollm2-360m-lifecycle",
    profileVersion: "1.0.0-candidate.1",
    requestedBackend: "gpu" as const,
    localPathPassedToProjectQvac: true,
    lifecycle: Object.freeze([
      "qvac-import",
      "worker-start",
      "model-load",
      "inference",
      "clean-shutdown",
    ] as const),
  }),
  excludedEffects: Object.freeze([
    "installation",
    "telemetry",
    "upload",
    "submission",
    "repair",
    "retry",
    "compatibility-claim",
  ] as const),
});

export const CANDIDATE_PUBLICATION_WARNING = Object.freeze({
  kind: "candidate-publication-warning-v1" as const,
  claimEligible: false,
  currentlyAdmissible: false,
  uploadOccurs: false,
});

export interface RealProbeInteraction {
  disclosePrivacy(disclosure: typeof REAL_PRIVACY_DISCLOSURE): Promise<void>;
  decideFingerprint(): Promise<boolean>;
  discloseProjectCode(
    disclosure: typeof PROJECT_CODE_DISCLOSURE,
  ): Promise<void>;
  decideProjectCode(): Promise<boolean>;
  discloseWorkload(
    disclosure: typeof COMBINED_WORKLOAD_DISCLOSURE,
  ): Promise<void>;
  decideWorkload(): Promise<boolean>;
  preview(exactJson: string, kind: "draft" | "final"): Promise<void>;
  choosePublication(
    warning: typeof CANDIDATE_PUBLICATION_WARNING,
  ): Promise<boolean | null>;
  confirmLocalWrite(): Promise<boolean>;
}

/**
 * Owns the private, continuous resolved-project session. An executed runner has
 * already passed StructuredRunnerAdapter after child settlement; acquisition,
 * grant, launch, and containment failures return preflight-failed instead.
 */
export interface RealCoordinatorBoundary {
  resolve(signal: AbortSignal): Promise<
    | {
        readonly status: "resolved";
        readonly qvac: QvacEvidence;
      }
    | { readonly status: "failed" }
    | { readonly status: "aborted" }
  >;
  runDoctor(
    signal: AbortSignal,
  ): Promise<
    | { readonly status: "completed"; readonly doctor: CheckEvidence }
    | { readonly status: "preflight-failed" }
    | { readonly status: "aborted" }
  >;
  runWorkload(
    signal: AbortSignal,
  ): Promise<
    | { readonly status: "executed"; readonly runner: RunnerEvidence }
    | { readonly status: "preflight-failed" }
    | { readonly status: "aborted" }
  >;
}

/** Owns the private output path; neither interactions nor results receive it. */
export interface RealOutputBoundary {
  preflight(signal: AbortSignal): Promise<boolean>;
  /**
   * Uncancellable after invocation. Every structural outcome settles after the
   * attempted transaction. `write-failed` proves Atlas-owned names are absent;
   * `cleanup-uncertain` makes no such claim.
   */
  writeExclusive(
    exactJson: string,
  ): Promise<
    | { readonly status: "written" }
    | { readonly status: "write-failed" }
    | { readonly status: "cleanup-uncertain" }
  >;
}

export interface RealProbeOptions {
  readonly signal: AbortSignal;
}

export interface RealProbeDependencies {
  readonly interaction: RealProbeInteraction;
  readonly coordinator: RealCoordinatorBoundary;
  readonly output: RealOutputBoundary;
  readonly platformSource?: PlatformSource;
  readonly now?: () => Date;
}

export type RealProbeRunResult =
  | {
      readonly status:
        | "refused"
        | "aborted"
        | "preflight-failed"
        | "write-failed"
        | "cleanup-uncertain";
      readonly stage: RealProbeStage;
      readonly history: readonly RealProbeStage[];
    }
  | {
      readonly status: "previewed-not-written" | "written";
      readonly report: AtlasReport;
      readonly exactJson: string;
      readonly history: readonly RealProbeStage[];
    };

type FixedStop = "aborted" | "preflight-failed";
type Guarded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: FixedStop };

function exactKeys(value: object, expected: readonly string[]): boolean {
  return (
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function snapshotResolvedQvac(value: unknown): QvacEvidence | null {
  try {
    const qvac = record(value);
    if (
      qvac === null ||
      !exactKeys(qvac, ["discovery", "packages", "sdk_version"])
    )
      return null;
    const discovery = record(qvac.discovery);
    if (
      discovery === null ||
      !exactKeys(discovery, ["duration_ms", "reason", "status"]) ||
      discovery.status !== "passed" ||
      discovery.reason !== "completed" ||
      !Number.isInteger(discovery.duration_ms) ||
      Number(discovery.duration_ms) < 0 ||
      Number(discovery.duration_ms) > 3_600_000 ||
      qvac.sdk_version !== "0.16.0" ||
      !Array.isArray(qvac.packages) ||
      qvac.packages.length !== 1
    ) {
      return null;
    }
    const packageEvidence = record(qvac.packages[0]);
    if (
      packageEvidence === null ||
      !exactKeys(packageEvidence, ["name", "version"]) ||
      packageEvidence.name !== "@qvac/sdk" ||
      packageEvidence.version !== "0.16.0"
    ) {
      return null;
    }
    const snapshot: QvacEvidence = {
      discovery: Object.freeze({
        status: "passed" as const,
        reason: "completed" as const,
        duration_ms: Number(discovery.duration_ms),
      }),
      sdk_version: "0.16.0",
      packages: [Object.freeze({ name: "@qvac/sdk", version: "0.16.0" })],
    };
    Object.freeze(snapshot.packages);
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function snapshotDoctor(value: unknown): CheckEvidence {
  try {
    const evidence = record(structuredClone(value));
    if (
      evidence === null ||
      !exactKeys(evidence, ["duration_ms", "reason", "status"])
    )
      throw new Error("invalid");
    if (
      ((evidence.status === "passed" && evidence.reason === "completed") ||
        (evidence.status === "failed" &&
          (evidence.reason === "failed" || evidence.reason === "timed-out"))) &&
      Number.isInteger(evidence.duration_ms) &&
      Number(evidence.duration_ms) >= 0 &&
      Number(evidence.duration_ms) <= 3_600_000
    ) {
      return Object.freeze({
        status: evidence.status,
        reason: evidence.reason,
        duration_ms: Number(evidence.duration_ms),
      }) as CheckEvidence;
    }
    if (
      evidence.status === "unknown" &&
      evidence.reason === "unavailable" &&
      evidence.duration_ms === null
    ) {
      return Object.freeze({
        status: "unknown",
        reason: "unavailable",
        duration_ms: null,
      });
    }
  } catch {
    // Invalid or private Doctor material is unavailable, never report content.
  }
  return Object.freeze({
    status: "unknown",
    reason: "unavailable",
    duration_ms: null,
  });
}

function snapshotRunner(value: unknown): RunnerEvidence | null {
  try {
    const snapshot = structuredClone(value) as RunnerEvidence;
    const runner = record(snapshot);
    const backend = record(snapshot.backend_observation);
    const termination = record(snapshot.termination);
    const result = record(snapshot.result);
    const failure = record(snapshot.result?.failure);
    if (
      runner === null ||
      !exactKeys(runner, [
        "backend_observation",
        "phases",
        "result",
        "termination",
      ]) ||
      !Array.isArray(snapshot.phases) ||
      !snapshot.phases.every((phase) => {
        const item = record(phase);
        return (
          item !== null && exactKeys(item, ["duration_ms", "name", "status"])
        );
      }) ||
      backend === null ||
      !exactKeys(backend, ["backend", "method", "status"]) ||
      termination === null ||
      !exactKeys(termination, [
        "exit_code",
        "kind",
        "last_completed_phase",
        "signal",
      ]) ||
      result === null ||
      !exactKeys(result, [
        "completion_observed",
        "failure",
        "workload_status",
      ]) ||
      failure === null ||
      !exactKeys(failure, ["category", "code", "phase", "sanitized_excerpt"])
    ) {
      return null;
    }
    if (scanPrivacy(snapshot).length > 0) return null;
    if (
      (snapshot.backend_observation.status === "observed" &&
        snapshot.backend_observation.method !== "runner-event") ||
      (snapshot.backend_observation.status !== "observed" &&
        snapshot.backend_observation.method !== "unavailable") ||
      snapshot.termination.kind === "not-started" ||
      snapshot.termination.kind === "spawn-error"
    ) {
      return null;
    }
    const allowedCodes = new Set([
      "QVAC_IMPORT_FAILED",
      "QVAC_IMPORT_TIMEOUT",
      "WORKER_START_FAILED",
      "WORKER_START_TIMEOUT",
      "MODEL_LOAD_FAILED",
      "MODEL_LOAD_TIMEOUT",
      "INFERENCE_FAILED",
      "INFERENCE_TIMEOUT",
      "CLEAN_SHUTDOWN_FAILED",
      "CLEAN_SHUTDOWN_TIMEOUT",
      "CLEANUP_TIMEOUT_AFTER_FAILURE",
      "TIMEOUT_AFTER_LIFECYCLE",
      "RUNNER_PROTOCOL_INVALID",
      "SIGNAL_AFTER_LIFECYCLE",
      "WORKER_SIGNAL",
      "RUNNER_EXIT_UNEXPECTED",
      "RUNNER_EVENT_REJECTED",
    ]);
    if (snapshot.result.failure.sanitized_excerpt !== null) return null;
    if (
      snapshot.result.failure.code !== null &&
      !allowedCodes.has(snapshot.result.failure.code)
    ) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function parseResolved(
  value: unknown,
):
  | { status: "resolved"; qvac: QvacEvidence }
  | { status: "failed" }
  | { status: "aborted" }
  | null {
  try {
    const result = record(value);
    if (result === null || typeof result.status !== "string") return null;
    if (result.status === "failed" || result.status === "aborted") {
      return exactKeys(result, ["status"]) ? { status: result.status } : null;
    }
    if (result.status !== "resolved" || !exactKeys(result, ["qvac", "status"]))
      return null;
    const resolvedQvac = snapshotResolvedQvac(result.qvac);
    return resolvedQvac === null
      ? null
      : { status: "resolved", qvac: resolvedQvac };
  } catch {
    return null;
  }
}

function parseWorkload(
  value: unknown,
):
  | { status: "executed"; runner: RunnerEvidence }
  | { status: "preflight-failed" }
  | { status: "aborted" }
  | null {
  try {
    const result = record(value);
    if (result === null || typeof result.status !== "string") return null;
    if (result.status === "preflight-failed" || result.status === "aborted") {
      return exactKeys(result, ["status"]) ? { status: result.status } : null;
    }
    if (
      result.status !== "executed" ||
      !exactKeys(result, ["runner", "status"])
    )
      return null;
    const runner = snapshotRunner(result.runner);
    return runner === null ? null : { status: "executed", runner };
  } catch {
    return null;
  }
}

function parseDoctorOutcome(
  value: unknown,
):
  | { status: "completed"; doctor: CheckEvidence }
  | { status: "preflight-failed" }
  | { status: "aborted" }
  | null {
  try {
    const snapshot: unknown = structuredClone(value);
    const outcome = record(snapshot);
    if (outcome === null || typeof outcome.status !== "string") return null;
    if (outcome.status === "preflight-failed" || outcome.status === "aborted") {
      return exactKeys(outcome, ["status"]) ? { status: outcome.status } : null;
    }
    if (
      outcome.status !== "completed" ||
      !exactKeys(outcome, ["doctor", "status"])
    ) {
      return null;
    }
    return { status: "completed", doctor: snapshotDoctor(outcome.doctor) };
  } catch {
    return null;
  }
}

function parseWriteOutcome(
  value: unknown,
): "written" | "write-failed" | "cleanup-uncertain" | null {
  try {
    const snapshot: unknown = structuredClone(value);
    const outcome = record(snapshot);
    if (outcome === null || !exactKeys(outcome, ["status"])) return null;
    return outcome.status === "written" ||
      outcome.status === "write-failed" ||
      outcome.status === "cleanup-uncertain"
      ? outcome.status
      : null;
  } catch {
    return null;
  }
}

function stopped(
  status: "refused" | FixedStop | "write-failed" | "cleanup-uncertain",
  state: RealProbeStateMachine,
): RealProbeRunResult {
  return {
    status,
    stage: state.stage,
    history: Object.freeze([...state.history]),
  };
}

async function guarded<T>(
  signal: AbortSignal,
  effect: () => Promise<T>,
): Promise<Guarded<T>> {
  try {
    if (signal.aborted) return { ok: false, status: "aborted" };
    const value = await effect();
    if (signal.aborted) return { ok: false, status: "aborted" };
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      status: signal.aborted ? "aborted" : "preflight-failed",
    };
  }
}

async function coordinatorBoundary<T>(
  signal: AbortSignal,
  effect: () => Promise<T>,
): Promise<Guarded<T>> {
  if (signal.aborted) return { ok: false, status: "aborted" };
  try {
    return { ok: true, value: await effect() };
  } catch {
    return { ok: false, status: "preflight-failed" };
  }
}

function containsPrivateReportMaterial(report: AtlasReport): boolean {
  try {
    return scanPrivacy(report).length > 0;
  } catch {
    return true;
  }
}

export async function runRealProbePipeline(
  options: RealProbeOptions,
  dependencies: RealProbeDependencies,
): Promise<RealProbeRunResult> {
  let signal: AbortSignal;
  try {
    signal = options.signal;
    if (!(signal instanceof AbortSignal)) throw new Error("invalid");
  } catch {
    throw new Error("real-probe-request-invalid");
  }
  const state = new RealProbeStateMachine();
  if (signal.aborted) return stopped("aborted", state);

  const vacancy = await guarded(signal, () =>
    dependencies.output.preflight(signal),
  );
  if (!vacancy.ok) return stopped(vacancy.status, state);
  if (typeof vacancy.value !== "boolean" || !vacancy.value)
    return stopped("preflight-failed", state);
  state.advance("output-vacant");

  const privacyDisclosure = await guarded(signal, () =>
    dependencies.interaction.disclosePrivacy(REAL_PRIVACY_DISCLOSURE),
  );
  if (!privacyDisclosure.ok) return stopped(privacyDisclosure.status, state);
  state.advance("privacy-disclosed");
  const fingerprint = await guarded(signal, () =>
    dependencies.interaction.decideFingerprint(),
  );
  if (!fingerprint.ok) return stopped(fingerprint.status, state);
  if (typeof fingerprint.value !== "boolean")
    return stopped("preflight-failed", state);
  if (!fingerprint.value) return stopped("refused", state);
  state.advance("fingerprint-consented");

  let collected: ReturnType<typeof collectPlatform>;
  try {
    collected = collectPlatform(dependencies.platformSource);
  } catch {
    return stopped("preflight-failed", state);
  }
  state.advance("collected");
  const resolved = await coordinatorBoundary(signal, () =>
    dependencies.coordinator.resolve(signal),
  );
  if (!resolved.ok) return stopped(resolved.status, state);
  const parsedResolution = parseResolved(resolved.value);
  if (parsedResolution === null) return stopped("preflight-failed", state);
  if (parsedResolution.status === "failed")
    return stopped("preflight-failed", state);
  if (parsedResolution.status === "aborted") return stopped("aborted", state);
  if (signal.aborted) return stopped("aborted", state);
  const qvac = parsedResolution.qvac;
  state.advance("project-resolved");

  const projectDisclosure = await guarded(signal, () =>
    dependencies.interaction.discloseProjectCode(PROJECT_CODE_DISCLOSURE),
  );
  if (!projectDisclosure.ok) return stopped(projectDisclosure.status, state);
  state.advance("project-code-disclosed");
  const projectDecision = await guarded(signal, () =>
    dependencies.interaction.decideProjectCode(),
  );
  if (!projectDecision.ok) return stopped(projectDecision.status, state);
  if (typeof projectDecision.value !== "boolean")
    return stopped("preflight-failed", state);
  if (!projectDecision.value) return stopped("refused", state);
  state.advance("project-code-consented");

  const doctorResult = await coordinatorBoundary(signal, () =>
    dependencies.coordinator.runDoctor(signal),
  );
  if (!doctorResult.ok) return stopped(doctorResult.status, state);
  const parsedDoctor = parseDoctorOutcome(doctorResult.value);
  if (parsedDoctor === null) return stopped("preflight-failed", state);
  if (parsedDoctor.status === "preflight-failed")
    return stopped("preflight-failed", state);
  if (parsedDoctor.status === "aborted") return stopped("aborted", state);
  const doctor = parsedDoctor.doctor;
  if (signal.aborted) return stopped("aborted", state);
  state.advance("doctor-complete");

  const workloadDisclosure = await guarded(signal, () =>
    dependencies.interaction.discloseWorkload(COMBINED_WORKLOAD_DISCLOSURE),
  );
  if (!workloadDisclosure.ok) return stopped(workloadDisclosure.status, state);
  state.advance("workload-disclosed");
  const workloadDecision = await guarded(signal, () =>
    dependencies.interaction.decideWorkload(),
  );
  if (!workloadDecision.ok) return stopped(workloadDecision.status, state);
  if (typeof workloadDecision.value !== "boolean")
    return stopped("preflight-failed", state);
  if (!workloadDecision.value) return stopped("refused", state);
  state.advance("workload-consented");

  const runtimeResult = await coordinatorBoundary(signal, () =>
    dependencies.coordinator.runWorkload(signal),
  );
  if (!runtimeResult.ok) return stopped(runtimeResult.status, state);
  const parsedWorkload = parseWorkload(runtimeResult.value);
  if (parsedWorkload === null) return stopped("preflight-failed", state);
  if (parsedWorkload.status === "preflight-failed")
    return stopped("preflight-failed", state);
  if (parsedWorkload.status === "aborted") return stopped("aborted", state);
  if (signal.aborted) return stopped("aborted", state);
  const runner = parsedWorkload.runner;
  state.advance("runtime-complete");

  let report: AtlasReport;
  try {
    report = assembleProbeReport({
      createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      publication: false,
      platform: collected.platform,
      nodeVersion: collected.nodeVersion,
      qvac,
      doctor,
      runner,
      redactionCounts: collected.redactionCounts,
    });
    state.advance("assembled");
    validateLocalReport(report);
    if (containsPrivateReportMaterial(report))
      throw new Error("private-report");
    state.advance("validated");
  } catch {
    return stopped("preflight-failed", state);
  }

  const draftPreview = await guarded(signal, () =>
    dependencies.interaction.preview(serializeReport(report), "draft"),
  );
  if (!draftPreview.ok) return stopped(draftPreview.status, state);
  state.advance("draft-previewed");
  const publication = await guarded(signal, () =>
    dependencies.interaction.choosePublication(CANDIDATE_PUBLICATION_WARNING),
  );
  if (!publication.ok) return stopped(publication.status, state);
  if (
    publication.value !== true &&
    publication.value !== false &&
    publication.value !== null
  ) {
    return stopped("preflight-failed", state);
  }
  if (publication.value === null) return stopped("refused", state);
  state.advance("publication-chosen");

  try {
    report = withProbePublication(report, publication.value);
    validateLocalReport(report);
    if (containsPrivateReportMaterial(report))
      throw new Error("private-report");
    state.advance("final-validated");
  } catch {
    return stopped("preflight-failed", state);
  }
  const exactJson = serializeReport(report);
  const finalPreview = await guarded(signal, () =>
    dependencies.interaction.preview(exactJson, "final"),
  );
  if (!finalPreview.ok) return stopped(finalPreview.status, state);
  state.advance("final-previewed");
  const writeDecision = await guarded(signal, () =>
    dependencies.interaction.confirmLocalWrite(),
  );
  if (!writeDecision.ok) return stopped(writeDecision.status, state);
  if (typeof writeDecision.value !== "boolean")
    return stopped("preflight-failed", state);
  if (!writeDecision.value) {
    return {
      status: "previewed-not-written",
      report,
      exactJson,
      history: Object.freeze([...state.history]),
    };
  }
  state.advance("write-consented");
  if (signal.aborted) return stopped("aborted", state);
  let writeResult: unknown;
  try {
    writeResult = await dependencies.output.writeExclusive(exactJson);
  } catch {
    return stopped("cleanup-uncertain", state);
  }
  const writeStatus = parseWriteOutcome(writeResult);
  if (writeStatus === "write-failed") return stopped("write-failed", state);
  if (writeStatus === "cleanup-uncertain")
    return stopped("cleanup-uncertain", state);
  if (writeStatus !== "written") return stopped("cleanup-uncertain", state);
  state.advance("written");
  state.advance("complete");
  return {
    status: "written",
    report,
    exactJson,
    history: Object.freeze([...state.history]),
  };
}
