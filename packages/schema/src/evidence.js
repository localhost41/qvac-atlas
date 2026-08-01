export const PHASE_ORDER = [
  "qvac-import",
  "worker-start",
  "model-load",
  "inference",
  "clean-shutdown",
];

export const SUPPORTED_NODE_MAJOR = 22;
export const SUPPORTED_QVAC_SDK_VERSION = "0.16.0";

const DEFINED_FAILURE_TERMINATIONS = new Map([
  ["native-runtime", new Set(["exit-code", "signal"])],
  ["worker-crash", new Set(["exit-code", "signal"])],
  ["timeout", new Set(["timeout"])],
  ["workload-failed", new Set(["clean-exit", "exit-code"])],
  ["spawn-error", new Set(["spawn-error"])],
]);

function profileIdentity(profile) {
  return `${profile.id}@${profile.version}:${profile.artifact_sha256}:${profile.requested_backend}`;
}

function hasExactlyOneTrustedProfile(report, standardProfiles) {
  const identity = profileIdentity(report.profile);
  return (
    standardProfiles.filter((profile) => profileIdentity(profile) === identity)
      .length === 1
  );
}

function hasSupportedRuntime(report) {
  return /^22\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    report.runtime.node_version,
  );
}

function hasSupportedQvac(report) {
  const sdkPackages = report.qvac.packages.filter(
    ({ name }) => name === "@qvac/sdk",
  );
  return (
    report.qvac.discovery.status === "passed" &&
    report.qvac.sdk_version === SUPPORTED_QVAC_SDK_VERSION &&
    sdkPackages.length === 1 &&
    sdkPackages[0].version === SUPPORTED_QVAC_SDK_VERSION
  );
}

function directlyObservedBackend(report) {
  const observation = report.execution.backend_observation;
  return (
    observation.status === "observed" &&
    ["cpu", "gpu"].includes(observation.backend)
  );
}

function phasesAreExactSuccess(phases) {
  return (
    phases.length === PHASE_ORDER.length &&
    phases.every(
      (phase, index) =>
        phase.name === PHASE_ORDER[index] && phase.status === "passed",
    )
  );
}

function failureLifecycle(report) {
  const { phases, termination } = report.execution;
  const {
    failure,
    workload_status: workloadStatus,
    completion_observed: completed,
  } = report.result;
  const failedIndex = PHASE_ORDER.indexOf(failure.phase);
  const permittedTerminations = DEFINED_FAILURE_TERMINATIONS.get(
    failure.category,
  );
  const terminationShapeMatches =
    (termination.kind === "clean-exit" &&
      termination.exit_code === 0 &&
      termination.signal === null) ||
    (termination.kind === "exit-code" &&
      Number.isInteger(termination.exit_code) &&
      termination.exit_code > 0 &&
      termination.signal === null) ||
    (termination.kind === "signal" &&
      termination.exit_code === null &&
      termination.signal !== null) ||
    (["timeout", "spawn-error"].includes(termination.kind) &&
      termination.exit_code === null &&
      termination.signal === null);
  if (
    workloadStatus !== "failed" ||
    completed ||
    failedIndex < 0 ||
    permittedTerminations === undefined ||
    !permittedTerminations.has(termination.kind) ||
    !terminationShapeMatches
  ) {
    return false;
  }

  const byName = new Map(phases.map((phase) => [phase.name, phase]));
  const phaseIndexes = phases.map(({ name }) => PHASE_ORDER.indexOf(name));
  const phasesInLifecycleOrder = phaseIndexes.every(
    (index, position) =>
      index >= 0 && (position === 0 || phaseIndexes[position - 1] < index),
  );
  if (
    byName.size !== phases.length ||
    !phasesInLifecycleOrder ||
    byName.get(failure.phase)?.status !== "failed"
  )
    return false;
  for (let index = 0; index < failedIndex; index += 1) {
    if (byName.get(PHASE_ORDER[index])?.status !== "passed") return false;
  }
  for (let index = failedIndex + 1; index < PHASE_ORDER.length; index += 1) {
    const status = byName.get(PHASE_ORDER[index])?.status;
    if (status === "passed" || status === "failed") return false;
  }

  const expectedLastCompleted =
    failedIndex === 0 ? null : PHASE_ORDER[failedIndex - 1];
  return termination.last_completed_phase === expectedLastCompleted;
}

function lifecycleContradictions(report) {
  const contradictions = [];
  const inference = report.execution.phases.find(
    ({ name }) => name === "inference",
  );
  if (
    directlyObservedBackend(report) &&
    !["passed", "failed"].includes(inference?.status)
  ) {
    contradictions.push({
      path: "/execution/backend_observation",
      code: "backend-before-inference",
      message: "an observed backend requires an attempted inference phase",
    });
  }

  if (
    report.result.workload_status === "passed" &&
    !phasesAreExactSuccess(report.execution.phases)
  ) {
    contradictions.push({
      path: "/execution/phases",
      code: "successful-lifecycle",
      message: "a passed workload requires the complete passed lifecycle",
    });
  }

  if (
    report.result.workload_status === "failed" &&
    DEFINED_FAILURE_TERMINATIONS.has(report.result.failure.category) &&
    !failureLifecycle(report)
  ) {
    contradictions.push({
      path: "/result/failure",
      code: "failure-lifecycle",
      message:
        "a defined failure must identify the reached failed phase and correlated termination",
    });
  }
  return contradictions;
}

/**
 * Central fail-closed evaluator for every V1 claim-producing path. Unsupported,
 * unavailable, or incomplete evidence is not a compatibility failure.
 */
export function evaluateV1ClaimEvidence(
  report,
  { standardProfiles = [] } = {},
) {
  const trustedProfile = hasExactlyOneTrustedProfile(report, standardProfiles);
  const supportedRuntime = hasSupportedRuntime(report);
  const supportedQvac = hasSupportedQvac(report);
  const backendObserved = directlyObservedBackend(report);
  const privacySafe =
    report.provenance.kind !== "probe" ||
    report.result.failure.sanitized_excerpt === null;
  const boundarySatisfied =
    trustedProfile && supportedRuntime && supportedQvac && privacySafe;
  const successLifecycle =
    phasesAreExactSuccess(report.execution.phases) &&
    report.result.workload_status === "passed" &&
    report.result.completion_observed === true &&
    report.result.failure.category === "none" &&
    backendObserved &&
    report.execution.termination.kind === "clean-exit" &&
    report.execution.termination.exit_code === 0 &&
    report.execution.termination.signal === null &&
    report.execution.termination.last_completed_phase === "clean-shutdown";

  const contradictions = lifecycleContradictions(report);
  return {
    trustedProfile,
    supportedRuntime,
    supportedQvac,
    privacySafe,
    backendObserved,
    successEligible: boundarySatisfied && successLifecycle,
    failureEligible:
      boundarySatisfied &&
      failureLifecycle(report) &&
      contradictions.length === 0,
    contradictions,
  };
}
