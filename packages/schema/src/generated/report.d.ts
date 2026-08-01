/**
 * Generated from schemas/report.schema.json. Do not edit by hand.
 * Normative schema SHA-256: ac071b4681788e205119c0828bae1afb9295c3145afe992b2216d5f224fe20a8
 * JSON Schema validation remains the runtime authority.
 */

export type Semver = string;
export type ReportId = string;
export type ShortString = string;
export type NullableShortString = ShortString | null;
export type PhaseStatus = "passed" | "failed" | "skipped" | "unknown";
export type CheckReason =
  | "completed"
  | "failed"
  | "timed-out"
  | "missing-qvac"
  | "not-applicable"
  | "not-reached"
  | "unavailable"
  | "unknown";
export type NullableSemver = Semver | null;
export type Sha256 = string;
export type RequestedDevice = "auto" | "cpu" | "gpu";
export type RuntimeBackend = "cpu" | "gpu" | "unknown";

/**
 * Allowlist-only, immutable evidence from one standardized QVAC Atlas probe.
 */
export interface AtlasReport {
  schema_version: "1.0.0";
  probe_version: Semver;
  report_id: ReportId;
  created_at: string;
  provenance: Provenance;
  consent: Consent;
  platform: Platform;
  runtime: Runtime;
  qvac: Qvac;
  official_checks: OfficialChecks;
  profile: Profile;
  execution: Execution;
  result: Result;
  privacy: Privacy;
}
export interface Provenance {
  kind: "probe" | "fixture";
  fixture_id: string | null;
}
export interface Consent {
  fingerprint_acknowledged: boolean;
  publication: boolean;
}
export interface Platform {
  os: Os;
  architecture: "arm64" | "x64" | "unknown";
  cpu: Cpu;
  memory_bucket:
    "under-8-gib" | "8-15-gib" | "16-31-gib" | "32-63-gib" | "64-gib-or-more" | "unknown";
  /**
   * @maxItems 8
   */
  gpus: Gpu[];
}
export interface Os {
  family: "linux" | "macos" | "windows" | "unknown";
  version: ShortString;
  build: NullableShortString;
}
export interface Cpu {
  vendor: ShortString;
  model: ShortString;
  family: NullableShortString;
  /**
   * @maxItems 128
   */
  feature_flags: string[];
}
export interface Gpu {
  index: number;
  vendor: ShortString;
  model: ShortString;
  device_id: string | null;
  driver_version: NullableShortString;
}
export interface Runtime {
  node_version: Semver;
}
export interface Qvac {
  discovery: Check;
  sdk_version: NullableSemver;
  /**
   * @maxItems 64
   */
  packages: QvacPackage[];
}
export interface Check {
  status: PhaseStatus;
  reason: CheckReason;
  duration_ms: number | null;
}
export interface QvacPackage {
  name: string;
  version: Semver;
}
export interface OfficialChecks {
  doctor: Check;
  bundle_verification: Check;
}
export interface Profile {
  id: string;
  version: Semver;
  artifact_sha256: Sha256;
  requested_backend: RequestedDevice;
}
export interface Execution {
  /**
   * @minItems 1
   * @maxItems 16
   */
  phases: Phase[];
  backend_observation: BackendObservation;
  termination: Termination;
}
export interface Phase {
  name: "qvac-import" | "worker-start" | "model-load" | "inference" | "clean-shutdown";
  status: PhaseStatus;
  duration_ms: number | null;
}
export interface BackendObservation {
  status: "observed" | "not-reached" | "unavailable";
  backend: RuntimeBackend | null;
  method: "public-api" | "qvac-structured-output" | "runner-event" | "unavailable";
}
export interface Termination {
  kind:
    "clean-exit" | "exit-code" | "signal" | "timeout" | "spawn-error" | "not-started" | "unknown";
  exit_code: number | null;
  signal: ("SIGABRT" | "SIGBUS" | "SIGILL" | "SIGKILL" | "SIGSEGV" | "SIGTERM" | "UNKNOWN") | null;
  last_completed_phase:
    ("qvac-import" | "worker-start" | "model-load" | "inference" | "clean-shutdown") | null;
}
export interface Result {
  workload_status: PhaseStatus;
  completion_observed: boolean;
  failure: Failure;
}
export interface Failure {
  category:
    | "none"
    | "missing-qvac"
    | "native-runtime"
    | "worker-crash"
    | "timeout"
    | "backend-unobserved"
    | "workload-failed"
    | "spawn-error"
    | "unknown";
  phase:
    | (
        | "discover-qvac"
        | "run-doctor"
        | "run-verification"
        | "qvac-import"
        | "worker-start"
        | "model-load"
        | "inference"
        | "clean-shutdown"
      )
    | null;
  code: string | null;
  sanitized_excerpt: string | null;
}
export interface Privacy {
  collection_policy: "allowlist-v1";
  sanitizer_version: Semver;
  redaction_counts: {
    credentials: number;
    identifiers: number;
    network: number;
    paths: number;
  };
}
