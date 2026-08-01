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
