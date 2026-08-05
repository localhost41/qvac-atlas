import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../../", import.meta.url);

async function repositoryText(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

function prose(text) {
  return text.replace(/^>\s?/gmu, "").replace(/\s+/gu, " ");
}

const guidancePath = "docs/contributing/privacy-removal-incidents.md";

test("contributor entry points state the accountless deployment gates", async () => {
  const [readme, contributing, registry, shippedMain, relayPolicy] =
    await Promise.all([
      repositoryText("README.md"),
      repositoryText("CONTRIBUTING.md"),
      repositoryText("registry/catalog.json").then(JSON.parse),
      repositoryText("packages/cli/src/bin.ts"),
      repositoryText("packages/cli/src/submission-policy.ts"),
    ]);

  assert.match(readme, /^## Accountless report submission$/m);
  assert.match(
    contributing,
    /^> \*\*Accountless submission is implemented but deployment-gated\.\*\*/m,
  );
  for (const entryPoint of [readme, contributing]) {
    const content = prose(entryPoint);
    assert.match(content, /production profile allowlist is empty/i);
    assert.match(content, /real mode (?:is )?disabled/i);
    assert.match(
      content,
      /Code, documentation, and fixture-only test contributions remain open\./,
    );
    assert.match(entryPoint, new RegExp(`\\(${guidancePath}\\)`));
  }
  assert.equal(registry.version, 2);
  assert.deepEqual(registry.productionProfiles, []);
  assert.match(shippedMain, /\n\s*false,\n\s*\);/u);
  assert.match(
    relayPolicy,
    /REVIEWED_ANONYMOUS_RELAY_ORIGIN: string \| null = null/u,
  );
});

test("safety guide contains required decisions, cleanup, and incident controls", async () => {
  const [guidance, reportGuide, maintainerGuide] = await Promise.all([
    repositoryText(guidancePath),
    repositoryText("docs/contributing/report-submissions.md"),
    repositoryText("docs/contributing/maintainer-admission.md"),
  ]);

  for (const heading of [
    "Installation and verification prerequisites",
    "Decide whether to keep or publish a fingerprint",
    "Remove a never-submitted local report",
    "Remove the cached candidate artifact",
    "Request public report withdrawal or supersession",
    "Maintainer credential or privacy incident response",
    "Human usability review remains external",
  ]) {
    assert.match(guidance, new RegExp(`^## ${heading}$`, "m"));
  }

  const content = prose(guidance);
  assert.match(content, /separate.*default-no confirmation/i);
  assert.match(
    content,
    /Declining it leaves the report local and makes no request/i,
  );
  assert.match(content, /accountless, not network-anonymous/i);
  assert.match(content, /Move to Trash.*Move to Recycle Bin/);
  assert.match(
    content,
    /~\/\.qvac-atlas-models\/smollm2-360m-instruct-q8_0\.gguf/,
  );
  assert.match(
    content,
    /Neither action proves erasure from Git object history/i,
  );
  assert.match(content, /mark the old trusted metadata `superseded`/);
  assert.match(content, /mark the entry `withdrawn`/);
  assert.match(
    content,
    /remove it from current report pages, counts, and claims/,
  );
  assert.match(content, /not an ordinary withdrawal/);
  assert.match(content, /Exact-history CI is intentionally expected to reject/);
  assert.match(
    content,
    /Do not add or use a CI, metadata, environment, or command-line bypass/,
  );
  assert.match(content, /Treat the value as disclosed/);
  assert.match(content, /Rotate or revoke affected credentials/);
  assert.match(content, /minimal sanitized incident record/);
  assert.match(
    content,
    /Re-run schema, privacy, contribution, catalog, site, and Git-diff audits/,
  );
  assert.match(
    content,
    /remains unchecked until a human completes that review/,
  );

  assert.match(reportGuide, /\]\(privacy-removal-incidents\.md\)/);
  assert.match(maintainerGuide, /\]\(privacy-removal-incidents\.md\)/);
  assert.match(maintainerGuide, /source:<32 lowercase hex>/);
  assert.match(maintainerGuide, /source:anonymous-relay/);
  assert.match(maintainerGuide, /unverified-anonymous/);
  assert.match(
    maintainerGuide,
    /must not be\s+derived from or contain a person's name/,
  );
  assert.match(maintainerGuide, /only active genuine evidence/);
});

test("contributor guidance contains no broad destructive command examples", async () => {
  const documentation = (
    await Promise.all([
      repositoryText("README.md"),
      repositoryText("CONTRIBUTING.md"),
      repositoryText(guidancePath),
      repositoryText("docs/contributing/report-submissions.md"),
      repositoryText("docs/contributing/maintainer-admission.md"),
    ])
  ).join("\n");

  const dangerousCommands = [
    /\brm\b[^\n]*(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\b)/iu,
    /\bRemove-Item\b[^\n]*(?:-Recurse|-Force)/iu,
    /\brmdir\s+\/s\b/iu,
    /\bdel\s+\/[a-z]*s\b/iu,
    /\bfind\b[^\n]*-delete\b/iu,
    /\bgit\s+clean\s+-[^\n]*d/iu,
  ];
  for (const pattern of dangerousCommands) {
    assert.doesNotMatch(documentation, pattern);
  }
});
