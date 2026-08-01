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
  buildCatalogFromFiles,
  serializeCatalog,
} from "../../../packages/catalog/src/index.js";
import { withReportId } from "../../../packages/schema/src/index.js";

const run = promisify(execFile);
const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

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
      version: 1,
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
