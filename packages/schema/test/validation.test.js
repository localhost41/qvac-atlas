import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveReportClaim,
  deriveAggregateClaim,
  validateReport,
  withReportId,
} from "../src/index.js";
import { asProbe, jsonFixture, standardProfiles } from "./helpers.js";

test("contributors cannot author public claim state", async () => {
  const report = await jsonFixture("success.json");
  report.claim_status = "reproduced-success";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some(({ code }) => code === "schema:additionalProperties"), true);
});

test("schema rejects fabricated OS-specific execution backends", async () => {
  const report = await jsonFixture("success.json");
  report.execution.backend_observation.backend = "metal";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some(({ path }) => path.includes("backend_observation/backend")), true);
});

test("semantic validator enforces canonical arrays and explicit durations", async () => {
  const report = await jsonFixture("fallback.json");
  report.platform.cpu.feature_flags.reverse();
  report.execution.phases[0].duration_ms = null;
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some(({ code }) => code === "canonical-order"), true);
  assert.equal(validation.errors.some(({ code }) => code === "phase-duration"), true);
});

test("semantic validator enforces check and termination consistency", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.official_checks.doctor.reason = "unknown";
  report.execution.termination.exit_code = 1;
  report.execution.termination.last_completed_phase = "worker-start";
  const validation = validateReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some(({ code }) => code === "check-reason"), true);
  assert.equal(validation.errors.filter(({ code }) => code === "termination").length >= 2, true);
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
    { name: "worker-start", status: "failed", duration_ms: 21 },
  ];
  failure.execution.backend_observation = { status: "observed", backend: "gpu", method: "runner-event" };
  failure.execution.termination = { kind: "signal", exit_code: null, signal: "SIGSEGV", last_completed_phase: "qvac-import" };
  failure.result = {
    workload_status: "failed",
    completion_observed: false,
    failure: { category: "worker-crash", phase: "worker-start", code: "WORKER_SIGSEGV", sanitized_excerpt: null },
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
    () => deriveAggregateClaim([{ report: success, sourceKey: "a" }, { report: withReportId(other), sourceKey: "b" }]),
    /compatibility key/,
  );
});

test("a nonstandard profile cannot produce a public failure claim", async () => {
  const profiles = await standardProfiles();
  const report = asProbe(await jsonFixture("worker-crash.json"));
  report.profile.artifact_sha256 = "b".repeat(64);
  const claim = deriveReportClaim(withReportId(report), { standardProfiles: profiles });
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
