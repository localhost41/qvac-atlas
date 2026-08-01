import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveReportClaim,
  deriveAggregateClaim,
  validateReport,
  withReportId,
} from "../src/index.js";
import { asProbe, jsonFixture, standardProfiles } from "./helpers.js";

function failedAfterObservedBackend(report) {
  const copy = structuredClone(report);
  copy.created_at = "2026-08-01T00:00:00.000Z";
  copy.execution.phases = [
    { name: "qvac-import", status: "passed", duration_ms: 1 },
    { name: "worker-start", status: "passed", duration_ms: 1 },
    { name: "model-load", status: "passed", duration_ms: 1 },
    { name: "inference", status: "failed", duration_ms: 1 },
  ];
  copy.execution.termination = {
    kind: "clean-exit",
    exit_code: 0,
    signal: null,
    last_completed_phase: "model-load",
  };
  copy.result = {
    workload_status: "failed",
    completion_observed: false,
    failure: {
      category: "workload-failed",
      phase: "inference",
      code: "WORKLOAD_FAILED",
      sanitized_excerpt: null,
    },
  };
  return withReportId(copy);
}

test("contributors cannot author public claim state", async () => {
  const report = await jsonFixture("success.json");
  report.claim_status = "reproduced-success";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(
      ({ code }) => code === "schema:additionalProperties",
    ),
    true,
  );
});

test("schema rejects fabricated OS-specific execution backends", async () => {
  const report = await jsonFixture("success.json");
  report.execution.backend_observation.backend = "metal";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ path }) =>
      path.includes("backend_observation/backend"),
    ),
    true,
  );
});

test("semantic validator enforces canonical arrays and explicit durations", async () => {
  const report = await jsonFixture("fallback.json");
  report.platform.cpu.feature_flags.reverse();
  report.execution.phases[0].duration_ms = null;
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ code }) => code === "canonical-order"),
    true,
  );
  assert.equal(
    validation.errors.some(({ code }) => code === "phase-duration"),
    true,
  );
});

test("semantic validator enforces check and termination consistency", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.official_checks.doctor.reason = "unknown";
  report.execution.termination.exit_code = 1;
  report.execution.termination.last_completed_phase = "worker-start";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ code }) => code === "check-reason"),
    true,
  );
  assert.equal(
    validation.errors.filter(({ code }) => code === "termination").length >= 2,
    true,
  );
});

test("partial success and unreached failures cannot produce claims", async () => {
  const profiles = await standardProfiles();
  const partial = asProbe(await jsonFixture("success.json"));
  partial.execution.phases = [
    { name: "qvac-import", status: "passed", duration_ms: 1 },
  ];
  partial.execution.backend_observation = {
    status: "not-reached",
    backend: null,
    method: "unavailable",
  };
  partial.execution.termination.last_completed_phase = "qvac-import";
  const partialReport = withReportId(partial);
  assert.equal(validateReport(partialReport).valid, false);
  assert.equal(
    deriveReportClaim(partialReport, { standardProfiles: profiles }).claim,
    "unknown",
  );

  const unreached = asProbe(await jsonFixture("timeout.json"));
  unreached.execution.phases = [
    { name: "qvac-import", status: "unknown", duration_ms: null },
  ];
  unreached.execution.termination.last_completed_phase = null;
  const unreachedReport = withReportId(unreached);
  const validation = validateReport(unreachedReport);
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ code }) => code === "failure-lifecycle"),
    true,
  );
  assert.equal(
    deriveReportClaim(unreachedReport, { standardProfiles: profiles }).claim,
    "unknown",
  );

  const prematureBackend = asProbe(await jsonFixture("worker-crash.json"));
  prematureBackend.execution.backend_observation = {
    status: "observed",
    backend: "cpu",
    method: "runner-event",
  };
  const prematureReport = withReportId(prematureBackend);
  assert.equal(
    validateReport(prematureReport).errors.some(
      ({ code }) => code === "backend-before-inference",
    ),
    true,
  );
  assert.equal(
    deriveReportClaim(prematureReport, { standardProfiles: profiles }).claim,
    "unknown",
  );
});

test("unsupported or undiscovered QVAC runtimes remain inconclusive", async () => {
  const profiles = await standardProfiles();
  const mutations = [
    (report) => {
      report.runtime.node_version = "20.19.0";
    },
    (report) => {
      report.qvac.sdk_version = "99.0.0";
      report.qvac.packages = [{ name: "@qvac/sdk", version: "99.0.0" }];
    },
    (report) => {
      report.qvac.discovery = {
        status: "unknown",
        reason: "unavailable",
        duration_ms: null,
      };
    },
  ];

  for (const mutate of mutations) {
    const report = asProbe(await jsonFixture("success.json"));
    mutate(report);
    const adjusted = withReportId(report);
    assert.equal(validateReport(adjusted).valid, true);
    assert.equal(
      deriveReportClaim(adjusted, { standardProfiles: profiles }).claim,
      "unknown",
    );
  }
});

test("trusted profile identity includes the requested device", async () => {
  const report = asProbe(await jsonFixture("success.json"));
  const mismatchedProfiles = (await standardProfiles()).map((profile) => ({
    ...profile,
    requested_backend: "cpu",
  }));
  const claim = deriveReportClaim(report, {
    standardProfiles: mismatchedProfiles,
  });
  assert.equal(claim.claim, "unknown");
  assert.equal(claim.reasons.includes("nonstandard-profile"), true);
});

test("aggregate claims reuse the V1 evidence boundary", async () => {
  const profiles = await standardProfiles();
  const first = asProbe(await jsonFixture("success.json"));
  first.runtime.node_version = "20.19.0";
  const second = structuredClone(first);
  second.created_at = "2026-08-01T00:00:01.000Z";
  const claim = deriveAggregateClaim(
    [
      { report: withReportId(first), sourceKey: "reviewed-source-a" },
      { report: withReportId(second), sourceKey: "reviewed-source-b" },
    ],
    { standardProfiles: profiles },
  );
  assert.equal(claim.claim, "unknown");
  assert.deepEqual(claim.reasons, ["insufficient-evidence"]);
});

test("workload errors may exit cleanly but failure phase order remains mandatory", async () => {
  const profiles = await standardProfiles();
  const report = asProbe(await jsonFixture("success.json"));
  report.execution.phases = [
    { name: "qvac-import", status: "passed", duration_ms: 1 },
    { name: "worker-start", status: "passed", duration_ms: 1 },
    { name: "model-load", status: "passed", duration_ms: 1 },
    { name: "inference", status: "failed", duration_ms: 1 },
  ];
  report.execution.termination = {
    kind: "clean-exit",
    exit_code: 0,
    signal: null,
    last_completed_phase: "model-load",
  };
  report.result = {
    workload_status: "failed",
    completion_observed: false,
    failure: {
      category: "workload-failed",
      phase: "inference",
      code: "WORKLOAD_FAILED",
      sanitized_excerpt: null,
    },
  };
  const adjusted = withReportId(report);
  assert.equal(validateReport(adjusted).valid, true);
  assert.equal(
    deriveReportClaim(adjusted, { standardProfiles: profiles }).claim,
    "observed-failure",
  );

  const reordered = structuredClone(adjusted);
  [reordered.execution.phases[0], reordered.execution.phases[1]] = [
    reordered.execution.phases[1],
    reordered.execution.phases[0],
  ];
  const reorderedReport = withReportId(reordered);
  assert.equal(validateReport(reorderedReport).valid, false);
  assert.equal(
    deriveReportClaim(reorderedReport, { standardProfiles: profiles }).claim,
    "unknown",
  );
});

test("a failure on a different observed device is not attributed to the requested device", async () => {
  const cases = [
    { fixture: "fallback.json", requested: "gpu", observed: "cpu" },
    { fixture: "success.json", requested: "cpu", observed: "gpu" },
  ];

  for (const { fixture, requested, observed } of cases) {
    const report = asProbe(await jsonFixture(fixture));
    report.profile.requested_backend = requested;
    report.execution.backend_observation.backend = observed;
    const profiles = (await standardProfiles()).map((profile) => ({
      ...profile,
      requested_backend: requested,
    }));
    const failed = failedAfterObservedBackend(report);
    assert.equal(validateReport(failed).valid, true);
    const claim = deriveReportClaim(failed, { standardProfiles: profiles });
    assert.equal(claim.observation, "failure");
    assert.equal(claim.claim, "unknown");
    assert.equal(claim.actual_backend_claim, null);
    assert.equal(claim.reasons.includes("defined-runtime-failure"), true);
    assert.equal(claim.reasons.includes("different-backend-observed"), true);
  }

  for (const requested of ["gpu", "auto"]) {
    const report = asProbe(await jsonFixture("success.json"));
    report.profile.requested_backend = requested;
    const profiles = (await standardProfiles()).map((profile) => ({
      ...profile,
      requested_backend: requested,
    }));
    const claim = deriveReportClaim(failedAfterObservedBackend(report), {
      standardProfiles: profiles,
    });
    assert.equal(claim.observation, "failure");
    assert.equal(claim.claim, "observed-failure");
    assert.equal(claim.reasons.includes("different-backend-observed"), false);
  }
});

test("32-bit Windows native exit codes remain representable", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.execution.termination = {
    kind: "exit-code",
    exit_code: 3221225477,
    signal: null,
    last_completed_phase: "qvac-import",
  };
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("two trusted independent sources produce reproduced success", async () => {
  const profiles = await standardProfiles();
  const report = asProbe(await jsonFixture("success.json"));
  const second = structuredClone(report);
  second.created_at = "2026-07-31T12:00:01.000Z";
  const claim = deriveAggregateClaim(
    [
      { report, sourceKey: "reviewed-source-a" },
      { report: withReportId(second), sourceKey: "reviewed-source-b" },
    ],
    { standardProfiles: profiles },
  );
  assert.equal(claim.claim, "reproduced-success");
});

test("reruns from one trusted source do not produce reproduced success", async () => {
  const profiles = await standardProfiles();
  const report = asProbe(await jsonFixture("success.json"));
  const claim = deriveAggregateClaim(
    [
      { report, sourceKey: "reviewed-source-a" },
      { report, sourceKey: "reviewed-source-a" },
    ],
    { standardProfiles: profiles },
  );
  assert.equal(claim.claim, "observed-success");
});

test("mixed compatible evidence is derived, never report-authored", async () => {
  const profiles = await standardProfiles();
  const success = asProbe(await jsonFixture("success.json"));
  const failure = structuredClone(success);
  failure.execution.phases = [
    { name: "qvac-import", status: "passed", duration_ms: 35 },
    { name: "worker-start", status: "passed", duration_ms: 21 },
    { name: "model-load", status: "passed", duration_ms: 42 },
    { name: "inference", status: "failed", duration_ms: 10 },
  ];
  failure.execution.backend_observation = {
    status: "observed",
    backend: "gpu",
    method: "runner-event",
  };
  failure.execution.termination = {
    kind: "signal",
    exit_code: null,
    signal: "SIGSEGV",
    last_completed_phase: "model-load",
  };
  failure.result = {
    workload_status: "failed",
    completion_observed: false,
    failure: {
      category: "worker-crash",
      phase: "inference",
      code: "WORKER_SIGSEGV",
      sanitized_excerpt: null,
    },
  };
  const claim = deriveAggregateClaim(
    [
      { report: success, sourceKey: "reviewed-source-a" },
      { report: withReportId(failure), sourceKey: "reviewed-source-b" },
    ],
    { standardProfiles: profiles },
  );
  assert.equal(claim.claim, "mixed");
});

test("aggregation refuses reports from different compatibility keys", async () => {
  const success = asProbe(await jsonFixture("success.json"));
  const other = structuredClone(success);
  other.qvac.sdk_version = "0.17.0";
  assert.throws(
    () =>
      deriveAggregateClaim([
        { report: success, sourceKey: "a" },
        { report: withReportId(other), sourceKey: "b" },
      ]),
    /compatibility key/,
  );
});

test("a nonstandard profile cannot produce a public failure claim", async () => {
  const profiles = await standardProfiles();
  const report = asProbe(await jsonFixture("worker-crash.json"));
  report.profile.artifact_sha256 = "b".repeat(64);
  const claim = deriveReportClaim(withReportId(report), {
    standardProfiles: profiles,
  });
  assert.equal(claim.observation, "failure");
  assert.equal(claim.claim, "unknown");
  assert.equal(claim.reasons.includes("nonstandard-profile"), true);
});

test("fixture reports never contribute to aggregate claims", async () => {
  const profiles = await standardProfiles();
  const fixture = await jsonFixture("success.json");
  const claim = deriveAggregateClaim(
    [
      { report: fixture, sourceKey: "source-a" },
      { report: fixture, sourceKey: "source-b" },
    ],
    { standardProfiles: profiles },
  );
  assert.equal(claim.claim, "unknown");
  assert.equal(claim.reasons.includes("fixture-evidence"), false);
});
