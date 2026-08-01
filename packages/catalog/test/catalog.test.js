import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePublishableReport, withReportId } from "@qvac-atlas/schema";
import { buildCatalog, serializeCatalog } from "../src/index.js";

const fixtureUrl = (name) =>
  new URL(`../../schema/fixtures/${name}`, import.meta.url);
const SOURCE_A = `source:${"a".repeat(32)}`;
const SOURCE_B = `source:${"b".repeat(32)}`;
const SOURCE_C = `source:${"c".repeat(32)}`;

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

function source(
  report,
  sourceKey,
  path,
  kind = "genuine",
  lifecycle = { state: "active" },
) {
  return {
    kind,
    ...(kind === "genuine" ? { lifecycle } : {}),
    path,
    report,
    sourceKey,
  };
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
      source(first, SOURCE_A, "reports/v1/first.json"),
      source(second, SOURCE_B, "reports/v1/second.json"),
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
      source(success, SOURCE_A, "reports/v1/success.json"),
      source(failure, SOURCE_B, "reports/v1/failure.json"),
    ],
  });

  assert.equal(catalog.claims.length, 1);
  assert.equal(catalog.claims[0].claim.claim, "mixed");
});

test("a failed fallback remains an observation, not a requested-device failure claim", async () => {
  const raw = await fixture("success.json");
  const fallback = asProbe(raw);
  fallback.execution.backend_observation.backend = "cpu";
  const failure = failedAfterBackend(fallback);
  assert.equal(failure.profile.requested_backend, "gpu");
  assert.equal(failure.execution.backend_observation.backend, "cpu");
  assert.equal(validatePublishableReport(failure).valid, true);

  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources: [source(failure, SOURCE_C, "reports/v1/failure.json")],
  });

  assert.equal(catalog.reports[0].claim.observation, "failure");
  assert.equal(catalog.reports[0].claim.claim, "unknown");
  assert.equal(
    catalog.reports[0].claim.reasons.includes("different-backend-observed"),
    true,
  );
  assert.equal(catalog.claims[0].claim.claim, "unknown");
  assert.notEqual(catalog.claims[0].claim.claim, "observed-failure");
  assert.notEqual(catalog.claims[0].claim.claim, "mixed");
});

test("Apple SoC GPU identity and kernel release are explicit catalog facets", async () => {
  const raw = await fixture("success.json");
  const report = asProbe(raw);
  report.platform.gpus = [];
  report.platform.os.version = "24.5.0";
  const adjusted = withReportId(report);
  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources: [source(adjusted, SOURCE_A, "reports/v1/apple-soc.json")],
  });

  assert.equal(catalog.reports[0].claim.claim, "observed-success");
  assert.equal(
    catalog.reports[0].facets.hardware,
    "Apple M3 Pro · integrated GPU keyed by Apple SoC identity",
  );
  assert.equal(
    catalog.reports[0].facets.os,
    "macos · kernel release 24.5.0 · arm64",
  );
});

test("withdrawn and superseded evidence cannot influence current output", async () => {
  const raw = await fixture("success.json");
  const active = asProbe(raw, "2026-08-01T00:00:02.000Z");
  const superseded = failedAfterBackend(
    asProbe(raw, "2026-08-01T00:00:01.000Z"),
  );
  const withdrawn = asProbe(raw, "2026-08-01T00:00:03.000Z");
  withdrawn.platform.cpu.model = "RETIRED_HARDWARE_CANARY";
  const withdrawnWithId = withReportId(withdrawn);
  const activePath = "reports/v1/active.json";
  const supersededPath = "reports/v1/superseded.json";
  const withdrawnPath = "reports/v1/withdrawn.json";
  const sources = [
    source(active, SOURCE_A, activePath),
    source(superseded, SOURCE_A, supersededPath, "genuine", {
      state: "superseded",
      replacementPath: activePath,
    }),
    source(withdrawnWithId, SOURCE_C, withdrawnPath, "genuine", {
      state: "withdrawn",
    }),
  ];

  const catalog = buildCatalog({
    productionProfiles: [profileOf(raw)],
    sources,
  });
  assert.equal(catalog.reports.length, 1);
  assert.equal(catalog.reports[0].reportId, active.report_id);
  assert.equal(catalog.claims.length, 1);
  assert.equal(catalog.claims[0].claim.claim, "observed-success");
  assert.deepEqual(catalog.claims[0].reportIds, [active.report_id]);
  assert.equal(catalog.claims[0].sourceCount, 1);

  const serialized = serializeCatalog(catalog);
  for (const retiredValue of [
    superseded.report_id,
    supersededPath,
    withdrawnWithId.report_id,
    withdrawnPath,
    withdrawnWithId.platform.cpu.model,
    SOURCE_C,
  ]) {
    assert.equal(serialized.includes(retiredValue), false);
  }
  assert.equal(
    serialized,
    serializeCatalog(
      buildCatalog({
        productionProfiles: [profileOf(raw)],
        sources: [...sources].reverse(),
      }),
    ),
  );
});

test("supersession requires one direct active same-source replacement", async () => {
  const raw = await fixture("success.json");
  const fixtureReport = await fixture("success.json");
  const old = asProbe(raw, "2026-08-01T00:00:01.000Z");
  const middle = asProbe(raw, "2026-08-01T00:00:02.000Z");
  const active = asProbe(raw, "2026-08-01T00:00:03.000Z");
  const profile = [profileOf(raw)];
  const oldPath = "reports/v1/old.json";
  const middlePath = "reports/v1/middle.json";
  const activePath = "reports/v1/active.json";
  const superseded = (replacementPath) =>
    source(old, SOURCE_A, oldPath, "genuine", {
      state: "superseded",
      replacementPath,
    });

  for (const [sources, pattern] of [
    [[superseded(oldPath)], /cannot replace itself/],
    [[superseded("reports/v1/missing.json")], /replacement is missing/],
    [
      [
        superseded("reports/fixtures/success.json"),
        source(
          fixtureReport,
          "fixture:success",
          "reports/fixtures/success.json",
          "fixture",
        ),
      ],
      /replacement is missing/,
    ],
    [
      [superseded(activePath), source(active, SOURCE_B, activePath)],
      /same sourceKey/,
    ],
    [
      [
        superseded(middlePath),
        source(middle, SOURCE_A, middlePath, "genuine", {
          state: "superseded",
          replacementPath: activePath,
        }),
        source(active, SOURCE_A, activePath),
      ],
      /replacement must be active/,
    ],
    [
      [
        superseded(middlePath),
        source(middle, SOURCE_A, middlePath, "genuine", {
          state: "superseded",
          replacementPath: oldPath,
        }),
      ],
      /replacement must be active/,
    ],
    [
      [
        superseded(activePath),
        source(active, SOURCE_A, activePath, "genuine", {
          state: "withdrawn",
        }),
      ],
      /replacement must be active/,
    ],
  ]) {
    assert.throws(
      () => buildCatalog({ productionProfiles: profile, sources }),
      pattern,
    );
  }
});

test("lifecycle and opaque source metadata fail closed on unsupported shapes", async () => {
  const raw = await fixture("success.json");
  const report = asProbe(raw);
  const profile = [profileOf(raw)];
  const path = "reports/v1/report.json";

  const withoutLifecycle = source(report, SOURCE_A, path);
  delete withoutLifecycle.lifecycle;
  assert.throws(
    () =>
      buildCatalog({
        productionProfiles: profile,
        sources: [withoutLifecycle],
      }),
    /unsupported field/,
  );

  for (const lifecycle of [
    { state: "active", replacementPath: path },
    { state: "withdrawn", reason: "private detail" },
    { state: "unknown" },
    { state: "superseded" },
  ]) {
    assert.throws(
      () =>
        buildCatalog({
          productionProfiles: profile,
          sources: [source(report, SOURCE_A, path, "genuine", lifecycle)],
        }),
      /lifecycle|replacement/,
    );
  }

  for (const invalidSourceKey of [
    "review:alice",
    "source:pull-request-123",
    "person@example.invalid",
    `source:${"a".repeat(64)}`,
    report.report_id,
  ]) {
    assert.throws(
      () =>
        buildCatalog({
          productionProfiles: profile,
          sources: [source(report, invalidSourceKey, path)],
        }),
      (error) => {
        assert.match(error.message, /sourceKey is invalid/);
        assert.equal(error.message.includes(invalidSourceKey), false);
        return true;
      },
    );
  }

  const fixtureReport = await fixture("success.json");
  const fixtureSource = source(
    fixtureReport,
    "fixture:success",
    "reports/fixtures/success.json",
    "fixture",
  );
  assert.throws(
    () =>
      buildCatalog({
        fixtureProfiles: [fixtureProfileOf(fixtureReport)],
        sources: [{ ...fixtureSource, lifecycle: { state: "withdrawn" } }],
      }),
    /unsupported field/,
  );
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
        sources: [source(genuine, SOURCE_A, "reports/v1/one.json")],
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
    sources: [source(adjusted, SOURCE_C, "reports/v1/canary.json")],
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
