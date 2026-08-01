import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifests = [
  "package.json",
  "apps/site/package.json",
  "packages/catalog/package.json",
  "packages/cli/package.json",
  "packages/model-artifact/package.json",
  "packages/probe/package.json",
  "packages/qvac-executor/package.json",
  "packages/qvac-resolver/package.json",
  "packages/schema/package.json",
];
const nodeTypeManifests = [
  "apps/site/package.json",
  "packages/cli/package.json",
  "packages/model-artifact/package.json",
  "packages/probe/package.json",
  "packages/qvac-executor/package.json",
  "packages/qvac-resolver/package.json",
];

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

test("workspace advertises and enforces the exact Node 22 major", async () => {
  for (const path of manifests) {
    const manifest = await json(path);
    assert.equal(manifest.engines?.node, ">=22 <23", path);
  }
  for (const path of nodeTypeManifests) {
    const manifest = await json(path);
    assert.match(
      manifest.devDependencies?.["@types/node"] ?? "",
      /^\^22\./u,
      path,
    );
  }
  assert.match(await text("pnpm-workspace.yaml"), /^engineStrict: true$/mu);
});

test("local readiness and release docs preserve external gates", async () => {
  const [manifest, runner, readme, contributing, checklist] = await Promise.all(
    [
      json("package.json"),
      text("scripts/ready-local.mjs"),
      text("README.md"),
      text("CONTRIBUTING.md"),
      text("docs/RELEASE-CHECKLIST.md"),
    ],
  );
  assert.equal(
    manifest.scripts?.["ready:local"],
    "node scripts/ready-local.mjs",
  );
  assert.match(runner, /exact base\/target append-only history/u);
  assert.match(runner, /physical hardware\/privacy/u);
  assert.match(readme, /pnpm ready:local/u);
  assert.match(contributing, /pnpm ready:local/u);
  assert.match(
    checklist,
    /^## Activation and first production evidence gate$/mu,
  );
  assert.match(checklist, /commit-pinned physical\s+verdict/u);
  assert.match(checklist, /distinct activation diff/u);
  assert.match(checklist, /at least one manually submitted genuine report/iu);
  assert.match(checklist, /nonempty genuine registry/u);
});

test("incident and first-admission runbooks retain trust boundaries", async () => {
  const [incident, admission] = await Promise.all([
    text("docs/contributing/privacy-removal-incidents.md"),
    text("docs/contributing/maintainer-admission.md"),
  ]);
  assert.match(
    incident,
    /ordinary append-only CI path intentionally cannot approve/u,
  );
  assert.match(incident, /named host authority/u);
  assert.match(incident, /trusted baseline/u);
  assert.match(incident, /restore.*branch protection/isu);
  assert.match(admission, /maintainer-owned admission branch/u);
  assert.match(admission, /fresh code-owner approval/u);
  assert.match(
    admission,
    /bidirectional report-to-registry checks remain unchanged/u,
  );
});
