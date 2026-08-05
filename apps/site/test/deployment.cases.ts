import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { validateSiteReleaseCatalog } from "../../../scripts/validate-site-release-catalog.mjs";
import type { CatalogData } from "../src/types/catalog.js";

const run = promisify(execFile);
const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function catalogWithIsolatedGenuineEvidence(catalog: CatalogData): CatalogData {
  const digest = "b".repeat(64);
  const reportId = `sha256:${digest}`;
  const report = structuredClone(catalog.fixtures[0]);
  report.reportId = reportId;
  report.slug = digest;
  report.sourceKey = `source:${"a".repeat(32)}`;
  report.sourceIndependence = "independent";
  report.sourcePath = `reports/v1/sha256-${digest}.json`;
  report.report.report_id = reportId;
  report.report.provenance = { kind: "probe", fixture_id: null };
  report.claim = {
    actual_backend_claim: "observed-success",
    claim: "observed-success",
    observation: "success",
    reasons: ["requested-backend-observed", "workload-completed"],
  };
  const claim = {
    claim: structuredClone(report.claim),
    claimId: `claim-${"c".repeat(64)}`,
    compatibilityKey: "isolated-genuine-test-key",
    facets: structuredClone(report.facets),
    reportIds: [reportId],
    sourceCount: 1,
    unverifiedAnonymous: false,
  };
  return { ...structuredClone(catalog), claims: [claim], reports: [report] };
}

async function buildAtBase(base: string): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qvac-atlas-site-base-"));
  const output = join(temporaryRoot, "dist");
  try {
    await run(
      "pnpm",
      ["exec", "astro", "build", "--outDir", output, "--silent"],
      {
        cwd: siteRoot,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          ATLAS_SITE_BASE: base,
        },
      },
    );
    return temporaryRoot;
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function htmlFiles(output: string): Promise<string[]> {
  return (await readdir(output, { recursive: true }))
    .filter((path) => path.endsWith(".html"))
    .sort();
}

function targetPath(output: string, base: string, target: string): string {
  assert.equal(target.startsWith(base), true, `${target} escaped ${base}`);
  const withoutBase = target.slice(base.length).split(/[?#]/u, 1)[0] ?? "";
  if (withoutBase === "" || withoutBase.endsWith("/")) {
    return join(output, withoutBase, "index.html");
  }
  return extname(withoutBase) === ""
    ? join(output, withoutBase, "index.html")
    : join(output, withoutBase);
}

async function assertInternalTargetsResolve(output: string, base: string) {
  for (const relativeHtml of await htmlFiles(output)) {
    const html = await readFile(join(output, relativeHtml), "utf8");
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/gu)) {
      const target = match[1] ?? "";
      if (!target.startsWith("/")) continue;
      await stat(targetPath(output, base, target));
    }
  }
}

test("one static source builds at root and an owner-independent subpath", async () => {
  for (const base of ["/", "/atlas-subpath/"]) {
    const temporaryRoot = await buildAtBase(base);
    try {
      const output = join(temporaryRoot, "dist");
      await assertInternalTargetsResolve(output, base);
      const [index, fixtures, report, contribute] = await Promise.all([
        readFile(join(output, "index.html"), "utf8"),
        readFile(join(output, "fixtures/index.html"), "utf8"),
        readFile(
          join(
            output,
            "reports/7f8a961442079a43a4837221a2f3d948bfa606957d0f2b409b8c0d7580a7cd6b/index.html",
          ),
          "utf8",
        ),
        readFile(join(output, "contribute/index.html"), "utf8"),
      ]);
      assert.match(index, new RegExp(`href="${base.replaceAll("/", "\\/")}"`));
      assert.match(fixtures, /Every result on this page is synthetic/u);
      assert.match(report, /Evidence limitations/u);
      assert.match(report, /Not a compatibility claim/u);
      assert.match(report, /aria-labelledby="fixture-warning-title"/u);
      assert.match(index, /<html lang="en">/u);
      assert.match(index, /width=device-width, initial-scale=1/u);
      assert.match(index, /href="#main-content">Skip to content/u);
      assert.match(index, /<nav aria-label="Primary navigation">/u);
      assert.match(index, /aria-live="polite"/u);
      assert.match(index, /Browse compatibility results/u);
      assert.match(index, /Contribute your hardware result/u);
      assert.match(contribute, /npx --yes qvac-atlas@0\.3\.0 contribute/u);
      assert.match(contribute, /Submit anonymous report?/u);
      if (base !== "/") {
        assert.doesNotMatch(index, /(?:href|src)="\/(?!atlas-subpath\/)/u);
        assert.match(index, /src="\/atlas-subpath\/catalog-filter\.js"/u);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("launch build remains fixture-only and exposes limitations without synthesizing claims", async () => {
  const [catalog, registry, index, fixtures, styles] = await Promise.all([
    readFile(
      new URL("../src/generated/catalog.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(join(repositoryRoot, "registry/catalog.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/fixtures/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/global.css", import.meta.url), "utf8"),
  ]);

  assert.equal(catalog.claims.length, 0);
  assert.equal(catalog.reports.length, 0);
  assert.equal(catalog.fixtures.length, 2);
  assert.deepEqual(registry.productionProfiles, []);
  assert.equal(
    registry.sources.some(({ kind }: { kind: string }) => kind === "genuine"),
    false,
  );
  for (const fixture of catalog.fixtures) {
    assert.equal(index.includes(fixture.reportId), false);
    assert.equal(fixtures.includes(fixture.reportId), true);
    assert.equal(fixture.claim.claim, "unknown");
    assert.equal(fixture.claim.reasons.includes("fixture-evidence"), true);
  }
  assert.match(index, /The genuine registry is not open yet/u);
  assert.match(index, /does not\s+predict compatibility/u);
  assert.match(fixtures, /not real\s+device observations/u);
  assert.match(fixtures, /cannot establish\s+QVAC compatibility/u);
  assert.match(styles, /@media \(max-width: 40rem\)/u);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(styles, /:focus-visible/u);
  assert.match(styles, /min-height: 2\.75rem/u);
});

test("site release workflow is pinned, least-privilege, main-only, and manual-default-off", async () => {
  const [workflow, ordinaryCi] = await Promise.all([
    readFile(
      join(repositoryRoot, ".github/workflows/site-release.yml"),
      "utf8",
    ),
    readFile(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8"),
  ]);

  assert.match(
    workflow,
    /^on:\n  push:\n    branches:\n      - main\n  workflow_dispatch:/mu,
  );
  assert.doesNotMatch(workflow, /^  (?:pull_request|schedule):/mu);
  assert.match(
    workflow,
    /deploy:[\s\S]*?type: boolean\n        default: false/u,
  );
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(
    workflow,
    /if: inputs\.deploy == true && github\.ref == 'refs\/heads\/main'/u,
  );
  assert.match(workflow, /environment:\n      name: github-pages/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(workflow, /pages: write\n      id-token: write/u);
  assert.match(
    workflow,
    /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/u,
  );
  assert.match(
    workflow,
    /pnpm\/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1/u,
  );
  assert.match(
    workflow,
    /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u,
  );
  assert.match(
    workflow,
    /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u,
  );
  assert.match(
    workflow,
    /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/u,
  );
  assert.doesNotMatch(workflow, /uses:\s+[^\s@]+@v\d/u);
  assert.match(
    workflow,
    /node scripts\/validate-site-release-catalog\.mjs apps\/site\/src\/generated\/catalog\.json/u,
  );
  assert.doesNotMatch(workflow, /catalog\.(?:claims|reports)\.length !== 0/u);
  assert.doesNotMatch(ordinaryCi, /site-release|deploy-pages/u);
});

test("site release catalog gate permits genuine evidence but rejects fixture crossover", async () => {
  const current = JSON.parse(
    await readFile(
      new URL("../src/generated/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(validateSiteReleaseCatalog(current), {
    claims: 0,
    fixtures: 2,
    reports: 0,
  });

  const genuine = catalogWithIsolatedGenuineEvidence(current);
  assert.deepEqual(validateSiteReleaseCatalog(genuine), {
    claims: 1,
    fixtures: 2,
    reports: 1,
  });

  const fixtureInReports = structuredClone(genuine);
  fixtureInReports.reports[0].report.provenance = {
    kind: "fixture",
    fixture_id: "crossed-boundary",
  };
  assert.throws(
    () => validateSiteReleaseCatalog(fixtureInReports),
    /genuine-report-boundary/u,
  );

  const fixtureInClaims = structuredClone(genuine);
  fixtureInClaims.claims[0].reportIds = [current.fixtures[0].reportId];
  assert.throws(
    () => validateSiteReleaseCatalog(fixtureInClaims),
    /claim-references-non-genuine-report/u,
  );
});

test("walkthrough and launch kit remain executable, release-bound, and fixture-only", async () => {
  const [walkthrough, beta, reviewer, rollback, notes, announcements] =
    await Promise.all(
      [
        "docs/contributing/five-minute-fixture-walkthrough.md",
        "docs/launch/private-beta.md",
        "docs/launch/reviewer-checklist.md",
        "docs/launch/rollback.md",
        "docs/launch/release-notes-0.1.0.md",
        "docs/launch/announcement-drafts.md",
      ].map((path) => readFile(join(repositoryRoot, path), "utf8")),
    );

  assert.match(walkthrough, /pnpm package:local/u);
  assert.match(walkthrough, /\.artifacts\/qvac-atlas-0\.1\.0\.tgz/u);
  assert.match(
    walkthrough,
    /npm install --ignore-scripts --no-audit --no-fund/u,
  );
  assert.match(walkthrough, /--fixture success/u);
  assert.match(
    walkthrough,
    /Intended for later public submission: \*\*No\*\*/u,
  );
  assert.match(walkthrough, /There is deliberately no submission command/u);
  assert.match(walkthrough, /does not install QVAC/u);

  assert.match(beta, /prepared, not authorized or started/iu);
  assert.match(beta, /Collect bounded usability feedback, not report content/u);
  assert.match(beta, /real mode proceeding past the fixed disabled message/u);
  assert.match(
    reviewer,
    /External deployment\/publication authority: NOT GRANTED/u,
  );
  assert.match(
    reviewer,
    /zero production profiles, zero genuine reports, zero claims/u,
  );
  assert.match(rollback, /gh workflow disable site-release\.yml/u);
  assert.match(rollback, /gh api --method DELETE/u);
  assert.match(rollback, /does not authorize any external\s+mutation/u);
  assert.match(notes, /fixture-only developer preview/iu);
  assert.match(notes, /Apache-2\.0/u);
  assert.match(notes, /synthetic fixtures only/u);
  assert.match(announcements, /UNSENT RELEASE-APPROVED DRAFTS/u);
  assert.match(announcements, /current\s+registry remains fixture-only/u);
  assert.match(announcements, /protected maintainer admission/u);
  assert.doesNotMatch(announcements, /\[(?:reviewed|authorized)[^\]]*URL\]/u);
});
