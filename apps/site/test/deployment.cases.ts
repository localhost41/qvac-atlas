import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

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
      const [index, fixtures, report] = await Promise.all([
        readFile(join(output, "index.html"), "utf8"),
        readFile(join(output, "fixtures/index.html"), "utf8"),
        readFile(
          join(
            output,
            "reports/7f8a961442079a43a4837221a2f3d948bfa606957d0f2b409b8c0d7580a7cd6b/index.html",
          ),
          "utf8",
        ),
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

  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/mu);
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
  assert.match(workflow, /catalog\.claims\.length !== 0/u);
  assert.match(workflow, /catalog\.reports\.length !== 0/u);
  assert.match(workflow, /catalog\.fixtures\.length === 0/u);
  assert.doesNotMatch(ordinaryCi, /site-release|deploy-pages/u);
});

test("walkthrough and launch kit remain executable, unsent, and fixture-only", async () => {
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
    /npm install --offline --ignore-scripts --no-audit --no-fund/u,
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
  assert.match(notes, /not published, deployed, or announced/iu);
  assert.match(notes, /synthetic fixtures only/u);
  assert.match(announcements, /UNSENT DRAFTS — DO NOT POST/u);
  assert.match(announcements, /current registry is fixture-only/u);
  assert.match(announcements, /protected maintainer admission/u);
  assert.doesNotMatch(
    `${walkthrough}\n${beta}\n${reviewer}\n${rollback}\n${notes}\n${announcements}`,
    /(?:https?:\/\/)(?!github\.com\/actions\/)/u,
  );
});
