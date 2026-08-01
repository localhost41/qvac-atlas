import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePublishableReport, withReportId } from "@qvac-atlas/schema";
import { buildCatalog, serializeCatalog } from "../src/index.js";

const fixtureUrl = (name) =>
  new URL(`../../schema/fixtures/${name}`, import.meta.url);

async function fixture(name) {
  return JSON.parse(await readFile(fixtureUrl(name), "utf8"));
}

function profileOf(report) {
  const { id, version, artifact_sha256 } = report.profile;
  return {
    id,
    version,
    artifact_sha256,
    requested_backend: report.profile.requested_backend,
    test_only: false,
  };
}

function fixtureProfileOf(report) {
  return { ...profileOf(report), test_only: true };
}

function asProbe(report, createdAt = report.created_at) {
  const copy = structuredClone(report);
  copy.created_at = createdAt;
  copy.provenance = { kind: "probe", fixture_id: null };
  return withReportId(copy);
}

function source(report, sourceKey, path, kind = "genuine") {
  return { kind, path, report, sourceKey };
}

function failedAfterBackend(success) {
  const copy = structuredClone(success);
  copy.created_at = "2026-08-01T00:00:00.000Z";
  copy.execution.phases = [
    { name: "qvac-import", status: "passed", duration_ms: 35 },
    { name: "worker-start", status: "passed", duration_ms: 210 },
    { name: "model-load", status: "passed", duration_ms: 840 },
    { name: "inference", status: "failed", duration_ms: 420 },
  ];
  copy.execution.termination = {
    kind: "exit-code",
    exit_code: 1,
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

test("invalid reports are rejected before catalog admission", async () => {
  const report = await fixture("success.json");
  report.consent.publication = false;

  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [fixtureProfileOf(report)],
        sources: [
          source(
            report,
            "fixture:invalid",
            "reports/fixtures/invalid.json",
            "fixture",
          ),
        ],
      }),
    /not publishable/,
  );
});

test("privacy-invalid evidence is rejected without echoing its value", async () => {
  const report = await fixture("success.json");
  const canary = "AKIAIOSFODNN7EXAMPLE";
  report.platform.cpu.model = canary;
  const adjusted = withReportId(report);

  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [fixtureProfileOf(report)],
        sources: [
          source(
            adjusted,
            "fixture:private",
            "reports/fixtures/private.json",
            "fixture",
          ),
        ],
      }),
    (error) => {
      assert.match(error.message, /privacy:known-token/);
      assert.doesNotMatch(error.message, new RegExp(canary));
      return true;
    },
  );
});

test("fixtures remain segregated and never produce genuine claims", async () => {
  const report = await fixture("success.json");
  const catalog = buildCatalog({
    fixtureProfiles: [fixtureProfileOf(report)],
    sources: [
      source(
        report,
        "fixture:success",
        "packages/schema/fixtures/success.json",
        "fixture",
      ),
    ],
  });

  assert.equal(catalog.reports.length, 0);
  assert.equal(catalog.claims.length, 0);
  assert.equal(catalog.fixtures.length, 1);
  assert.equal(catalog.fixtures[0].claim.claim, "unknown");
  assert.deepEqual(catalog.fixtures[0].claim.reasons, ["fixture-evidence"]);
});

test("duplicate report IDs are rejected even when metadata differs", async () => {
  const report = await fixture("success.json");
  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [fixtureProfileOf(report)],
        sources: [
          source(report, "fixture:one", "reports/fixtures/one.json", "fixture"),
          source(report, "fixture:two", "reports/fixtures/two.json", "fixture"),
        ],
      }),
    /duplicate report ID/,
  );
});

test("two independent trusted sources produce reproduced success", async () => {
  const raw = await fixture("success.json");
  const first = asProbe(raw);
  const second = asProbe(raw, "2026-08-01T00:00:01.000Z");
  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources: [
      source(first, "review:alice", "reports/v1/first.json"),
      source(second, "review:bob", "reports/v1/second.json"),
    ],
  });

  assert.equal(catalog.claims.length, 1);
  assert.equal(catalog.claims[0].claim.claim, "reproduced-success");
  assert.equal(catalog.claims[0].sourceCount, 2);
});

test("compatible success and failure evidence produce a mixed claim", async () => {
  const raw = await fixture("success.json");
  const success = asProbe(raw);
  const failure = failedAfterBackend(success);
  assert.equal(validatePublishableReport(failure).valid, true);

  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources: [
      source(success, "review:alice", "reports/v1/success.json"),
      source(failure, "review:bob", "reports/v1/failure.json"),
    ],
  });

  assert.equal(catalog.claims.length, 1);
  assert.equal(catalog.claims[0].claim.claim, "mixed");
});

test("catalog serialization is deterministic across input order", async () => {
  const success = await fixture("success.json");
  const timeout = await fixture("timeout.json");
  const sources = [
    source(
      success,
      "fixture:success",
      "packages/schema/fixtures/success.json",
      "fixture",
    ),
    source(
      timeout,
      "fixture:timeout",
      "packages/schema/fixtures/timeout.json",
      "fixture",
    ),
  ];

  const options = { fixtureProfiles: [fixtureProfileOf(success)] };
  const left = serializeCatalog(buildCatalog({ ...options, sources }));
  const right = serializeCatalog(
    buildCatalog({ ...options, sources: [...sources].reverse() }),
  );
  assert.equal(left, right);
});

test("reports without exactly one profile in the correct trust list are rejected", async () => {
  const raw = await fixture("success.json");
  const genuine = asProbe(raw);

  assert.throws(
    () =>
      buildCatalog({
        sources: [source(genuine, "review:one", "reports/v1/one.json")],
      }),
    /genuine report must match exactly one trusted profile/,
  );
  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [
          { ...fixtureProfileOf(raw), requested_backend: "cpu" },
        ],
        sources: [
          source(raw, "fixture:one", "reports/fixtures/one.json", "fixture"),
        ],
      }),
    /fixture report must match exactly one trusted profile/,
  );
});

test("contributor-controlled markup remains inert catalog text", async () => {
  const raw = await fixture("success.json");
  const report = asProbe(raw);
  report.platform.cpu.model =
    "<script data-atlas-canary>globalThis.pwned=true</script>";
  const adjusted = withReportId(report);
  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources: [source(adjusted, "review:canary", "reports/v1/canary.json")],
  });

  assert.equal(
    catalog.reports[0].report.platform.cpu.model,
    report.platform.cpu.model,
  );
  assert.equal(Object.hasOwn(catalog.reports[0], "html"), false);
});

test("profile allowlists require an explicit test boundary", async () => {
  const report = await fixture("success.json");
  const missingMarker = profileOf(report);
  delete missingMarker.test_only;

  assert.throws(
    () => buildCatalog({ productionProfiles: [missingMarker], sources: [] }),
    /unsupported field/,
  );
  assert.throws(
    () =>
      buildCatalog({
        productionProfiles: [{ ...profileOf(report), test_only: true }],
        sources: [],
      }),
    /wrong test_only boundary/,
  );
  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [{ ...profileOf(report), test_only: false }],
        sources: [],
      }),
    /wrong test_only boundary/,
  );
});

test("duplicate and cross-boundary profile identities fail closed", async () => {
  const report = await fixture("success.json");
  const production = profileOf(report);
  const fixtureProfile = fixtureProfileOf(report);

  assert.throws(
    () =>
      buildCatalog({
        productionProfiles: [production, production],
        sources: [],
      }),
    /duplicate production profile identity/,
  );
  assert.throws(
    () =>
      buildCatalog({
        productionProfiles: [production],
        fixtureProfiles: [fixtureProfile],
        sources: [],
      }),
    /crosses production and fixture boundaries/,
  );
});
