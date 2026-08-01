import { canonicalize, validateReport, withReportId } from "@qvac-atlas/schema";

import type {
  AtlasReport,
  CheckEvidence,
  PlatformEvidence,
  ProfileEvidence,
  QvacEvidence,
  RunnerEvidence,
} from "./types.js";

export const FIXTURE_PROFILE: ProfileEvidence = {
  id: "atlas-small-llm-lifecycle-test",
  version: "1.0.0",
  artifact_sha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  requested_backend: "gpu",
};

export const CANDIDATE_PROFILE: ProfileEvidence = Object.freeze({
  id: "atlas-smollm2-360m-lifecycle",
  version: "1.0.0-candidate.1",
  artifact_sha256:
    "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
  requested_backend: "gpu",
});

export interface AssembleReportInput {
  fixtureId: "success" | "missing-qvac" | "worker-crash" | "timeout";
  createdAt: string;
  publication: boolean;
  platform: PlatformEvidence;
  nodeVersion: string;
  qvac: QvacEvidence;
  doctor: CheckEvidence;
  runner: RunnerEvidence;
}

export function assembleFixtureReport(input: AssembleReportInput): AtlasReport {
  const draft: AtlasReport = {
    schema_version: "1.0.0",
    probe_version: "0.1.0",
    report_id: `sha256:${"0".repeat(64)}`,
    created_at: input.createdAt,
    provenance: { kind: "fixture", fixture_id: input.fixtureId },
    consent: { fingerprint_acknowledged: true, publication: input.publication },
    platform: input.platform,
    runtime: { node_version: input.nodeVersion },
    qvac: input.qvac,
    official_checks: {
      doctor: input.doctor,
      bundle_verification: {
        status: "skipped",
        reason: "not-applicable",
        duration_ms: null,
      },
    },
    profile: FIXTURE_PROFILE,
    execution: {
      phases: input.runner.phases,
      backend_observation: input.runner.backend_observation,
      termination: input.runner.termination,
    },
    result: input.runner.result,
    privacy: {
      collection_policy: "allowlist-v1",
      sanitizer_version: "0.1.0",
      redaction_counts: {
        credentials: 0,
        identifiers: 0,
        network: 0,
        paths: 0,
      },
    },
  };
  return withReportId(draft) as AtlasReport;
}

export interface AssembleProbeReportInput {
  createdAt: string;
  publication: boolean;
  platform: PlatformEvidence;
  nodeVersion: string;
  qvac: QvacEvidence;
  doctor: CheckEvidence;
  runner: RunnerEvidence;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Assemble one genuine but deliberately nonstandard candidate report. */
export function assembleProbeReport(
  input: AssembleProbeReportInput,
): AtlasReport {
  let snapshot: AssembleProbeReportInput;
  try {
    snapshot = structuredClone(input);
  } catch {
    throw new Error("probe-report-input-invalid");
  }
  const draft: AtlasReport = {
    schema_version: "1.0.0",
    probe_version: "0.1.0",
    report_id: `sha256:${"0".repeat(64)}`,
    created_at: snapshot.createdAt,
    provenance: { kind: "probe", fixture_id: null },
    consent: {
      fingerprint_acknowledged: true,
      publication: snapshot.publication,
    },
    platform: snapshot.platform,
    runtime: { node_version: snapshot.nodeVersion },
    qvac: snapshot.qvac,
    official_checks: {
      doctor: snapshot.doctor,
      bundle_verification: {
        status: "skipped",
        reason: "not-applicable",
        duration_ms: null,
      },
    },
    profile: CANDIDATE_PROFILE,
    execution: {
      phases: snapshot.runner.phases,
      backend_observation: snapshot.runner.backend_observation,
      termination: snapshot.runner.termination,
    },
    result: snapshot.runner.result,
    privacy: {
      collection_policy: "allowlist-v1",
      sanitizer_version: "0.1.0",
      redaction_counts: {
        credentials: 0,
        identifiers: 0,
        network: 0,
        paths: 0,
      },
    },
  };
  try {
    return deepFreeze(withReportId(draft) as AtlasReport);
  } catch {
    throw new Error("probe-report-input-invalid");
  }
}

export function withProbePublication(
  report: AtlasReport,
  publication: boolean,
): AtlasReport {
  try {
    const snapshot = structuredClone(report);
    return deepFreeze(
      withReportId({
        ...snapshot,
        consent: { ...snapshot.consent, publication },
      }) as AtlasReport,
    );
  } catch {
    throw new Error("probe-report-input-invalid");
  }
}

export function validateLocalReport(report: AtlasReport): void {
  const result = validateReport(report);
  if (!result.valid) {
    throw new Error(
      result.errors
        .map(({ path, code, message }) => `${path} [${code}] ${message}`)
        .join("\n"),
    );
  }
}

export function serializeReport(report: AtlasReport): string {
  return `${canonicalize(report)}\n`;
}
