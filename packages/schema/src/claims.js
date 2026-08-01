import { canonicalize } from "./canonicalize.js";
import { evaluateV1ClaimEvidence, PHASE_ORDER } from "./evidence.js";

/**
 * Derives report-level observation and claim. There is intentionally no input
 * field for a status or badge: only validated evidence participates.
 */
export function deriveReportClaim(report, { standardProfiles = [] } = {}) {
  if (report.provenance.kind === "fixture") {
    return {
      observation: "inconclusive",
      claim: "unknown",
      actual_backend_claim: null,
      reasons: ["fixture-evidence"],
    };
  }

  const evidence = evaluateV1ClaimEvidence(report, { standardProfiles });
  const reasons = [];
  const completed =
    report.result.workload_status === "passed" &&
    report.result.completion_observed === true;
  const actualBackend = report.execution.backend_observation.backend;
  const requestedBackend = report.profile.requested_backend;
  const differentBackendObserved =
    evidence.backendObserved &&
    requestedBackend !== "auto" &&
    requestedBackend !== actualBackend;

  if (!evidence.trustedProfile) reasons.push("nonstandard-profile");
  if (!evidence.supportedRuntime) reasons.push("unsupported-node-runtime");
  if (report.qvac.sdk_version === null)
    reasons.push("qvac-version-unavailable");
  else if (!evidence.supportedQvac) reasons.push("unsupported-qvac-evidence");
  if (!evidence.privacySafe) reasons.push("private-failure-excerpt");
  if (!evidence.backendObserved) reasons.push("backend-not-directly-observed");

  if (evidence.successEligible) {
    reasons.push("standard-workload-completed");
    if (differentBackendObserved) {
      reasons.push("different-backend-observed");
      return {
        observation: "fallback",
        claim: "unknown",
        actual_backend_claim: "observed-success",
        reasons: [...new Set(reasons)].sort(),
      };
    }
    reasons.push("requested-backend-observed");
    return {
      observation: "success",
      claim: "observed-success",
      actual_backend_claim: "observed-success",
      reasons: [...new Set(reasons)].sort(),
    };
  }

  if (evidence.failureEligible) {
    reasons.push("defined-runtime-failure");
    if (differentBackendObserved) {
      reasons.push("different-backend-observed");
      return {
        observation: "failure",
        claim: "unknown",
        actual_backend_claim: null,
        reasons: [...new Set(reasons)].sort(),
      };
    }
    return {
      observation: "failure",
      claim: "observed-failure",
      actual_backend_claim: null,
      reasons: [...new Set(reasons)].sort(),
    };
  }

  if (report.result.workload_status === "skipped")
    reasons.push("workload-skipped");
  else if (report.result.workload_status === "unknown")
    reasons.push("workload-state-unknown");
  else if (!completed) reasons.push("workload-not-completed");
  reasons.push("insufficient-evidence");
  return {
    observation:
      report.result.workload_status === "failed" ? "failure" : "inconclusive",
    claim: "unknown",
    actual_backend_claim: null,
    reasons: [...new Set(reasons)].sort(),
  };
}

/**
 * Derives a compatibility key without timestamps, consent, report identity, or
 * failure text. Array order is validated before this function is used.
 */
export function compatibilityKey(report) {
  return canonicalize({
    probe_version: report.probe_version,
    qvac_version: report.qvac.sdk_version,
    profile: report.profile,
    platform: report.platform,
    requested_backend: report.profile.requested_backend,
    observed_backend: report.execution.backend_observation.backend,
  });
}

/**
 * sourceKey is trusted registry metadata (for example reviewed PR identity),
 * not a report field. Callers must pass only reports sharing a compatibility key.
 */
export function deriveAggregateClaim(entries, options = {}) {
  if (entries.length === 0) {
    return {
      observation: "inconclusive",
      claim: "unknown",
      actual_backend_claim: null,
      reasons: ["insufficient-evidence"],
    };
  }
  const keys = new Set(entries.map(({ report }) => compatibilityKey(report)));
  if (keys.size !== 1)
    throw new Error("aggregate entries do not share one compatibility key");

  const derived = entries.map(({ report, sourceKey }) => ({
    reportId: report.report_id,
    sourceKey,
    result: deriveReportClaim(report, options),
  }));
  const successes = derived.filter(
    ({ result }) => result.claim === "observed-success",
  );
  const failures = derived.filter(
    ({ result }) => result.claim === "observed-failure",
  );
  if (successes.length > 0 && failures.length > 0) {
    return {
      observation: "inconclusive",
      claim: "mixed",
      actual_backend_claim: null,
      reasons: ["success-and-failure-evidence"],
    };
  }
  if (successes.length > 0) {
    const independentSources = new Set(
      successes.map(({ sourceKey }) => sourceKey).filter(Boolean),
    );
    const independentReports = new Set(
      successes.map(({ reportId }) => reportId).filter(Boolean),
    );
    if (independentSources.size >= 2 && independentReports.size >= 2) {
      return {
        observation: "success",
        claim: "reproduced-success",
        actual_backend_claim: "reproduced-success",
        reasons: ["independently-reproduced", "standard-workload-completed"],
      };
    }
    return successes[0].result;
  }
  if (failures.length > 0) return failures[0].result;
  return {
    observation: "inconclusive",
    claim: "unknown",
    actual_backend_claim: null,
    reasons: ["insufficient-evidence"],
  };
}

export { PHASE_ORDER };
