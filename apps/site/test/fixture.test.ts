import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
