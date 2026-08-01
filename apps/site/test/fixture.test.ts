import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildCatalog,
  buildCatalogFromFiles,
  serializeCatalog,
} from "../../../packages/catalog/src/index.js";
import { withReportId } from "../../../packages/schema/src/index.js";
import "./deployment.cases.js";

const run = promisify(execFile);
const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sourceKey = (character: string) => `source:${character.repeat(32)}`;

function productionProfileOf(report: Record<string, any>) {
  return { ...report.profile, test_only: false };
}

function asProbe(
  report: Record<string, any>,
  {
    cpuModel,
    createdAt,
    nodeVersion = "22.17.0",
  }: { cpuModel: string; createdAt: string; nodeVersion?: string },
) {
  const copy = structuredClone(report);
  copy.created_at = createdAt;
  copy.provenance = { kind: "probe", fixture_id: null };
  copy.platform.cpu.model = cpuModel;
  copy.runtime.node_version = nodeVersion;
  return withReportId(copy);
}

function failedAfterBackend(success: Record<string, any>, createdAt: string) {
  const copy = structuredClone(success);
  copy.created_at = createdAt;
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

function source(
  report: Record<string, any>,
  sourceKey: string,
  path: string,
  kind: "genuine" | "fixture" = "genuine",
  lifecycle: { state: string; replacementPath?: string } = {
    state: "active",
  },
) {
  return {
    kind,
    ...(kind === "genuine" ? { lifecycle } : {}),
    path,
    report,
    sourceKey,
  };
}

test("fixture pages are visibly segregated from compatibility claims", async () => {
  const html = await readFile(
    new URL("../dist/fixtures/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /Every result on this page is synthetic/);
  assert.match(html, /cannot establish\s+QVAC compatibility/);
});

test("contributor strings are HTML-escaped rather than executed", async () => {
  const html = await readFile(
    new URL("../dist/fixtures/escape-canary/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(html, /<script data-atlas-canary>/);
  assert.match(html, /&lt;script data-atlas-canary&gt;/);
});

test("report details expose the exact validated evidence and its limitations", async () => {
  const html = await readFile(
    new URL(
      "../dist/reports/7f8a961442079a43a4837221a2f3d948bfa606957d0f2b409b8c0d7580a7cd6b/index.html",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(html, /Exact report detail/);
  assert.match(html, /Not a compatibility claim/);
  assert.match(html, /Validated report JSON/);
  assert.match(html, /&quot;schema_version&quot;: &quot;1\.0\.0&quot;/);
  assert.match(
    html,
    /sha256:7f8a961442079a43a4837221a2f3d948bfa606957d0f2b409b8c0d7580a7cd6b/,
  );
});

test("static output has a restrictive CSP, skip link, and no external services", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /Content-Security-Policy/i);
  assert.match(html, /default-src 'self'; script-src 'self'/);
  assert.match(html, /href="#main-content">Skip to content/);
  assert.match(html, /src="\/catalog-filter\.js"/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/i);
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//i);
  assert.doesNotMatch(
    html,
    /google-analytics|googletagmanager|plausible\.io|posthog|segment\.io/i,
  );
});

test("static aggregate cards render the complete claim and observation state matrix", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qvac-atlas-states-"));
  const temporarySite = join(temporaryRoot, "apps/site");
  const canary =
    "<script data-atlas-state-canary>globalThis.atlasStatePwned=true</script>";

  try {
    const successFixture = await readFile(
      join(repositoryRoot, "packages/schema/fixtures/success.json"),
      "utf8",
    ).then(JSON.parse);
    const observed = asProbe(successFixture, {
      cpuModel: canary,
      createdAt: "2026-08-01T01:00:00.000Z",
    });
    const reproducedOne = asProbe(successFixture, {
      cpuModel: "Reproduced state CPU",
      createdAt: "2026-08-01T02:00:00.000Z",
    });
    const reproducedTwo = asProbe(successFixture, {
      cpuModel: "Reproduced state CPU",
      createdAt: "2026-08-01T02:00:01.000Z",
    });
    const fallbackShape = asProbe(successFixture, {
      cpuModel: "Fallback state CPU",
      createdAt: "2026-08-01T03:00:00.000Z",
    });
    fallbackShape.execution.backend_observation.backend = "cpu";
    const fallback = withReportId(fallbackShape);
    const mixedSuccess = asProbe(successFixture, {
      cpuModel: "Mixed state CPU",
      createdAt: "2026-08-01T04:00:00.000Z",
    });
    const mixedFailure = failedAfterBackend(
      mixedSuccess,
      "2026-08-01T04:00:01.000Z",
    );
    const failureSuccessShape = asProbe(successFixture, {
      cpuModel: "Failure state CPU",
      createdAt: "2026-08-01T05:00:00.000Z",
    });
    const failure = failedAfterBackend(
      failureSuccessShape,
      "2026-08-01T05:00:01.000Z",
    );
    const failedFallbackShape = asProbe(successFixture, {
      cpuModel: "Failed fallback state CPU",
      createdAt: "2026-08-01T05:30:00.000Z",
    });
    failedFallbackShape.execution.backend_observation.backend = "cpu";
    const failedFallback = failedAfterBackend(
      failedFallbackShape,
      "2026-08-01T05:30:01.000Z",
    );
    const unknown = asProbe(successFixture, {
      cpuModel: "Unknown state CPU",
      createdAt: "2026-08-01T06:00:00.000Z",
      nodeVersion: "21.7.0",
    });
    const retired = asProbe(successFixture, {
      cpuModel: "RETIRED_SITE_CANARY",
      createdAt: "2026-08-01T07:00:00.000Z",
    });
    const fixture = structuredClone(successFixture);
    fixture.profile = {
      ...fixture.profile,
      id: "atlas-state-matrix-fixture",
      artifact_sha256: "b".repeat(64),
    };
    fixture.provenance.fixture_id = "state-matrix";
    const fixtureReport = withReportId(fixture);

    const catalog = buildCatalog({
      productionProfiles: [productionProfileOf(successFixture)],
      fixtureProfiles: [
        { ...productionProfileOf(fixtureReport), test_only: true },
      ],
      sources: [
        source(observed, sourceKey("a"), "reports/v1/observed.json"),
        source(reproducedOne, sourceKey("b"), "reports/v1/reproduced-one.json"),
        source(reproducedTwo, sourceKey("c"), "reports/v1/reproduced-two.json"),
        source(fallback, sourceKey("d"), "reports/v1/fallback.json"),
        source(mixedSuccess, sourceKey("e"), "reports/v1/mixed-success.json"),
        source(mixedFailure, sourceKey("f"), "reports/v1/mixed-failure.json"),
        source(failure, sourceKey("1"), "reports/v1/failure.json"),
        source(
          failedFallback,
          sourceKey("4"),
          "reports/v1/failed-fallback.json",
        ),
        source(unknown, sourceKey("2"), "reports/v1/unknown.json"),
        source(retired, sourceKey("3"), "reports/v1/retired.json", "genuine", {
          state: "withdrawn",
        }),
        source(
          fixtureReport,
          "fixture:state-matrix",
          "reports/fixtures/state-matrix.json",
          "fixture",
        ),
      ],
    });
    assert.equal(catalog.claims.length, 7);
    assert.deepEqual(
      [...new Set(catalog.claims.map((entry) => entry.claim.claim))].sort(),
      [
        "mixed",
        "observed-failure",
        "observed-success",
        "reproduced-success",
        "unknown",
      ],
    );
    assert.equal(catalog.fixtures.length, 1);
    assert.equal(catalog.reports.length, 9);
    assert.equal(serializeCatalog(catalog).includes(retired.report_id), false);
    assert.equal(
      serializeCatalog(catalog).includes("RETIRED_SITE_CANARY"),
      false,
    );

    await mkdir(temporarySite, { recursive: true });
    await symlink(
      join(siteRoot, "node_modules"),
      join(temporarySite, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await Promise.all([
      cp(join(siteRoot, "src"), join(temporarySite, "src"), {
        recursive: true,
      }),
      cp(join(siteRoot, "public"), join(temporarySite, "public"), {
        recursive: true,
      }),
    ]);
    await writeFile(
      join(temporarySite, "src/generated/catalog.json"),
      serializeCatalog(catalog),
    );
    await run(
      "pnpm",
      [
        "exec",
        "astro",
        "--root",
        temporarySite,
        "--config",
        relative(temporarySite, join(siteRoot, "astro.config.mjs")),
        "build",
        "--silent",
      ],
      {
        cwd: siteRoot,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      },
    );

    const [index, fixtureIndex] = await Promise.all([
      readFile(join(temporarySite, "dist/index.html"), "utf8"),
      readFile(join(temporarySite, "dist/fixtures/index.html"), "utf8"),
    ]);
    for (const label of [
      "Observed success",
      "Reproduced success",
      "Mixed evidence",
      "Observed failure",
      "Unknown",
      "Fallback",
      "Inconclusive",
    ]) {
      assert.match(index, new RegExp(label));
    }
    for (const heading of [
      "Derived requested-device claim",
      "Aggregate observation",
      "Report observations",
      "Actual-device evidence",
      "Reports",
      "Trusted sources",
    ]) {
      assert.match(index, new RegExp(heading));
    }
    for (const state of [
      "observed-success",
      "reproduced-success",
      "mixed",
      "observed-failure",
      "unknown",
    ]) {
      assert.match(index, new RegExp(`<code>${state}</code>`));
    }
    assert.match(index, /aria-labelledby="genuine-catalog-card-/);
    assert.match(
      index,
      /aria-label="Derived requested-device claim: Observed success"/,
    );
    assert.match(index, /2 reviewed reports/);
    assert.match(index, /2 trusted sources/);
    assert.match(
      index,
      /requested-device claim remains unknown; actual-device evidence is shown separately/,
    );
    assert.match(index, /both success and failure evidence/);
    assert.match(
      index,
      /Evidence is insufficient to establish success or failure/,
    );
    assert.match(index, /default-src 'self'; script-src 'self'/);
    const fallbackStart = index.indexOf(
      'data-hardware="Fallback state CPU · M3 Pro Integrated"',
    );
    assert.notEqual(fallbackStart, -1);
    const fallbackCard = index.slice(
      fallbackStart,
      index.indexOf("</li>", fallbackStart),
    );
    assert.match(fallbackCard, /data-claim-state="unknown"/);
    assert.match(fallbackCard, /data-outcome="fallback"/);
    assert.match(fallbackCard, /<dt>Requested device<\/dt>\s*<dd>gpu<\/dd>/);
    assert.match(
      fallbackCard,
      /<dt>Directly observed device<\/dt>\s*<dd>cpu<\/dd>/,
    );
    assert.match(fallbackCard, /badge-inconclusive">\s*Inconclusive/);
    assert.match(fallbackCard, /badge-fallback">\s*Fallback/);
    assert.match(fallbackCard, /Actual-device evidence/);
    assert.match(fallbackCard, /badge-observed-success">\s*Observed success/);
    const failedFallbackStart = index.indexOf(
      'data-hardware="Failed fallback state CPU · M3 Pro Integrated"',
    );
    assert.notEqual(failedFallbackStart, -1);
    const failedFallbackCard = index.slice(
      failedFallbackStart,
      index.indexOf("</li>", failedFallbackStart),
    );
    assert.match(failedFallbackCard, /data-claim-state="unknown"/);
    assert.match(failedFallbackCard, /data-outcome="failure"/);
    assert.match(
      failedFallbackCard,
      /<dt>Requested device<\/dt>\s*<dd>gpu<\/dd>/,
    );
    assert.match(
      failedFallbackCard,
      /<dt>Directly observed device<\/dt>\s*<dd>cpu<\/dd>/,
    );
    assert.match(failedFallbackCard, /badge-failure">\s*Failure/);
    assert.doesNotMatch(failedFallbackCard, /Observed failure/);
    const markupOutsideQuotedAttributes = index.replace(/="[^"]*"/g, '=""');
    assert.doesNotMatch(
      markupOutsideQuotedAttributes,
      /<script data-atlas-state-canary>/,
    );
    assert.match(index, /&lt;script data-atlas-state-canary&gt;/);
    assert.doesNotMatch(index, /(?:src|href)="https?:\/\//i);
    assert.doesNotMatch(markupOutsideQuotedAttributes, /<script(?![^>]+src=)/i);
    assert.doesNotMatch(index, /RETIRED_SITE_CANARY/);
    await assert.rejects(
      readFile(
        join(
          temporarySite,
          `dist/reports/${retired.report_id.slice(7)}/index.html`,
        ),
        "utf8",
      ),
      { code: "ENOENT" },
    );

    assert.match(fixtureIndex, /Not a compatibility claim/);
    assert.match(fixtureIndex, /not-a-claim/);
    assert.match(fixtureIndex, /1 synthetic report/);
    assert.match(fixtureIndex, /Excluded from aggregate claims/);
    assert.match(fixtureIndex, /Synthetic fixture data is excluded/);
    assert.match(fixtureIndex, /default-src 'self'; script-src 'self'/);
    assert.doesNotMatch(fixtureIndex, /(?:src|href)="https?:\/\//i);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("hostile report markup stays inert through file catalog generation and static rendering", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qvac-atlas-hostile-"));
  const temporarySite = join(temporaryRoot, "apps/site");
  const hostileMarkup =
    '\"></option><script data-atlas-hostile>atlasPwned=true</script><img src=x onerror=atlasPwned=true>';

  try {
    const fixture = JSON.parse(
      await readFile(
        join(repositoryRoot, "packages/schema/fixtures/success.json"),
        "utf8",
      ),
    );
    fixture.platform.cpu.model = hostileMarkup;
    fixture.provenance.fixture_id = "hostile-markup";
    const report = withReportId(fixture);
    const sourcePath = "reports/fixtures/hostile-markup.json";
    const registry = {
      version: 2,
      productionProfiles: [],
      fixtureProfiles: [
        {
          ...report.profile,
          test_only: true,
        },
      ],
      sources: [
        {
          kind: "fixture",
          path: sourcePath,
          sourceKey: "fixture:hostile-markup",
        },
      ],
    };

    await Promise.all([
      mkdir(join(temporaryRoot, dirname(sourcePath)), { recursive: true }),
      mkdir(join(temporaryRoot, "registry"), { recursive: true }),
      mkdir(temporarySite, { recursive: true }),
    ]);
    await symlink(
      join(siteRoot, "node_modules"),
      join(temporarySite, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await Promise.all([
      writeFile(
        join(temporaryRoot, sourcePath),
        `${JSON.stringify(report, null, 2)}\n`,
      ),
      writeFile(
        join(temporaryRoot, "registry/catalog.json"),
        `${JSON.stringify(registry, null, 2)}\n`,
      ),
      cp(join(siteRoot, "src"), join(temporarySite, "src"), {
        recursive: true,
      }),
      cp(join(siteRoot, "public"), join(temporarySite, "public"), {
        recursive: true,
      }),
    ]);

    const catalog = await buildCatalogFromFiles({ root: temporaryRoot });
    assert.equal(catalog.reports.length, 0);
    assert.equal(catalog.claims.length, 0);
    assert.equal(catalog.fixtures.length, 1);
    await writeFile(
      join(temporarySite, "src/generated/catalog.json"),
      serializeCatalog(catalog),
    );

    await run(
      "pnpm",
      [
        "exec",
        "astro",
        "--root",
        temporarySite,
        "--config",
        relative(temporarySite, join(siteRoot, "astro.config.mjs")),
        "build",
        "--silent",
      ],
      {
        cwd: siteRoot,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      },
    );

    const fixtureIndex = await readFile(
      join(temporarySite, "dist/fixtures/index.html"),
      "utf8",
    );
    const reportDetail = await readFile(
      join(
        temporarySite,
        `dist/reports/${catalog.fixtures[0].slug}/index.html`,
      ),
      "utf8",
    );
    for (const html of [fixtureIndex, reportDetail]) {
      // Astro may retain `<` inside a quoted attribute value. Remove complete
      // quoted values before looking for attacker-created markup so that a
      // literal quote which escaped the attribute would still make this fail.
      const markupOutsideQuotedAttributes = html.replace(/="[^"]*"/g, '=""');
      assert.doesNotMatch(
        markupOutsideQuotedAttributes,
        /<script data-atlas-hostile>/,
      );
      assert.doesNotMatch(markupOutsideQuotedAttributes, /<img src=x onerror=/);
      assert.match(html, /&(?:#34|quot);/);
      assert.match(html, /&lt;script data-atlas-hostile&gt;/);
      assert.match(html, /Content-Security-Policy/i);
      assert.match(html, /default-src 'self'; script-src 'self'/);
    }
    assert.match(fixtureIndex, /Every result on this page is synthetic/);
    assert.match(reportDetail, /Not a compatibility claim/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
