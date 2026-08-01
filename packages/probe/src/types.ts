export type CheckStatus = "passed" | "failed" | "skipped" | "unknown";
export type CheckReason =
  | "completed"
  | "failed"
  | "timed-out"
  | "missing-qvac"
  | "not-applicable"
  | "not-reached"
  | "unavailable"
  | "unknown";
export type LifecyclePhase =
  | "qvac-import"
  | "worker-start"
  | "model-load"
  | "inference"
  | "clean-shutdown";
export type DeviceClass = "cpu" | "gpu";
export type RequestedDevice = "auto" | DeviceClass;

export interface CheckEvidence {
  status: CheckStatus;
  reason: CheckReason;
  duration_ms: number | null;
}

export interface PlatformEvidence {
  os: {
    family: "linux" | "macos" | "windows" | "unknown";
    version: string;
    build: string | null;
  };
  architecture: "arm64" | "x64" | "unknown";
  cpu: {
    vendor: string;
    model: string;
    family: string | null;
    feature_flags: string[];
  };
  memory_bucket:
    | "under-8-gib"
    | "8-15-gib"
    | "16-31-gib"
    | "32-63-gib"
    | "64-gib-or-more"
    | "unknown";
  gpus: Array<{
    index: number;
    vendor: string;
    model: string;
    device_id: string | null;
    driver_version: string | null;
  }>;
}

export interface QvacEvidence {
  discovery: CheckEvidence;
  sdk_version: string | null;
  packages: Array<{ name: string; version: string }>;
}

export interface ProfileEvidence {
  id: string;
  version: string;
  artifact_sha256: string;
  requested_backend: RequestedDevice;
}

export interface RunnerEvidence {
  phases: Array<{
    name: LifecyclePhase;
    status: CheckStatus;
    duration_ms: number | null;
  }>;
  backend_observation: {
    status: "observed" | "not-reached" | "unavailable";
    backend: DeviceClass | null;
    method: "runner-event" | "unavailable";
  };
  termination: {
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
  };
  result: {
    workload_status: CheckStatus;
    completion_observed: boolean;
    failure: {
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
        | "discover-qvac"
        | "run-doctor"
        | "run-verification"
        | LifecyclePhase
        | null;
      code: string | null;
      sanitized_excerpt: string | null;
    };
  };
}

export interface AtlasReport {
  schema_version: "1.0.0";
  probe_version: string;
  report_id: string;
  created_at: string;
  provenance: { kind: "fixture" | "probe"; fixture_id: string | null };
  consent: { fingerprint_acknowledged: boolean; publication: boolean };
  platform: PlatformEvidence;
  runtime: { node_version: string };
  qvac: QvacEvidence;
  official_checks: {
    doctor: CheckEvidence;
    bundle_verification: CheckEvidence;
  };
  profile: ProfileEvidence;
  execution: Omit<RunnerEvidence, "result">;
  result: RunnerEvidence["result"];
  privacy: {
    collection_policy: "allowlist-v1";
    sanitizer_version: string;
    redaction_counts: {
      credentials: number;
      identifiers: number;
      network: number;
      paths: number;
    };
  };
}
