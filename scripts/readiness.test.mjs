import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { parse } from "yaml";

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

function assertCompleteOwnershipState(codeowners, placeholders) {
  const owners = codeowners
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => line.split(/\s+/u).slice(1));
  const placeholderPattern = /^@[A-Z][A-Z0-9_]*_HANDLE_REQUIRED$/u;
  const presentPlaceholders = new Set(
    owners.filter((owner) => placeholderPattern.test(owner)),
  );
  const concreteOwners = owners.filter(
    (owner) => !placeholderPattern.test(owner),
  );
  assert.ok(
    (presentPlaceholders.size === 0 && concreteOwners.length > 0) ||
      (concreteOwners.length === 0 &&
        presentPlaceholders.size === placeholders.size &&
        [...placeholders].every((value) => presentPlaceholders.has(value))),
    "CODEOWNERS must use either all-placeholder owners or concrete owners, never a mixture",
  );
}

function workflowUses(source, label) {
  const values = [];
  const visited = new WeakSet();
  function visit(value) {
    if (value === null || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "uses") {
        assert.equal(typeof child, "string", `${label}: non-string uses`);
        values.push(child);
      }
      visit(child);
    }
  }
  visit(parse(source));
  return values;
}

async function localActionSource(action, label) {
  const relative = action.slice(2);
  assert.match(
    relative,
    /^(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u,
    label,
  );
  const candidates = /\.ya?ml$/u.test(relative)
    ? [relative]
    : [`${relative}/action.yml`, `${relative}/action.yaml`];
  for (const candidate of candidates) {
    try {
      return [candidate, await text(candidate)];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  assert.fail(`${label}: local action has no action.yml or action.yaml`);
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
  assert.match(admission, /Initial public-host trust bootstrap/u);
  assert.match(admission, /`before` value is all zero/u);
  assert.match(admission, /exact already-reviewed repository commit/u);
});

test("release controls pin every workflow and refuse unsupported real platforms", async () => {
  const [workflowNames, decisions, checklist] = await Promise.all([
    readdir(new URL(".github/workflows/", root)),
    text("docs/DECISIONS.md"),
    text("docs/RELEASE-CHECKLIST.md"),
  ]);
  const workflows = await Promise.all(
    workflowNames
      .filter((name) => /\.ya?ml$/u.test(name))
      .sort()
      .map(async (name) => [
        name,
        await text(`.github/workflows/${name}`),
        true,
      ]),
  );
  assert.deepEqual(
    workflowUses(
      'jobs: { hidden: { uses: "owner/action@0123456789abcdef0123456789abcdef01234567" } }',
      "flow-mapping-canary",
    ),
    ["owner/action@0123456789abcdef0123456789abcdef01234567"],
  );
  let actionCount = 0;
  const pending = [...workflows];
  const inspected = new Set();
  while (pending.length > 0) {
    const [name, workflow, isWorkflow] = pending.shift();
    if (inspected.has(name)) continue;
    inspected.add(name);
    if (isWorkflow) assert.match(workflow, /runs-on: ubuntu-24\.04/u, name);
    const actions = workflowUses(workflow, name);
    for (const action of actions) {
      if (action.startsWith("./")) {
        pending.push([
          ...(await localActionSource(action, `${name}: ${action}`)),
          false,
        ]);
        continue;
      }
      actionCount += 1;
      assert.match(action, /^[^@\s]+@[a-f0-9]{40}$/u, `${name}: ${action}`);
    }
  }
  assert.ok(actionCount > 0);
  const ci = workflows.find(([name]) => name === "ci.yml")?.[1] ?? "";
  assert.match(ci, /^  workflow_dispatch:/mu);
  assert.match(ci, /reviewed_commit:/u);
  assert.match(ci, /test "\$REVIEWED_COMMIT" = "\$GITHUB_SHA"/u);
  assert.match(ci, /test "\$GITHUB_REF" = 'refs\/heads\/main'/u);
  assert.match(ci, /node scripts\/validate-initial-baseline\.mjs/u);
  assert.match(ci, /BASE_SHA" == "0000000000000000000000000000000000000000"/u);
  assert.match(decisions, /V1 real execution is macOS arm64 only/u);
  assert.match(decisions, /before project canonicalization or resolution/u);
  assert.match(checklist, /first-production-report ceremony/u);
  assert.match(checklist, /still performs no\s+upload/iu);
});

test("repository ownership supports only complete preparation or launch states", async () => {
  const [codeowners, security, release, bootstrap, protection] =
    await Promise.all([
      text(".github/CODEOWNERS"),
      text("SECURITY.md"),
      text("docs/RELEASE-PROCESS.md"),
      text("docs/operations/public-host-bootstrap.md"),
      json(".github/branch-protection.json"),
    ]);
  const rows = new Map(
    codeowners
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const [pattern, ...owners] = line.split(/\s+/u);
        return [pattern, owners];
      }),
  );
  const requiredCoverage = new Map([
    ["*", 1],
    ["/.github/CODEOWNERS", 1],
    ["/.github/workflows/", 1],
    ["/registry/catalog.json", 1],
    ["/profiles/", 1],
    ["/reports/v1/", 1],
    ["/packages/catalog/", 1],
    ["/packages/schema/", 1],
    ["/scripts/validate-contribution.mjs", 1],
    ["/scripts/validate-site-release-catalog.mjs", 1],
    ["/scripts/validate-initial-baseline.mjs", 1],
  ]);
  const placeholders = new Set([
    "@PRIMARY_CODE_OWNER_HANDLE_REQUIRED",
    "@EVIDENCE_CODE_OWNER_HANDLE_REQUIRED",
    "@SECURITY_CODE_OWNER_HANDLE_REQUIRED",
  ]);
  for (const [pattern, minimumOwners] of requiredCoverage) {
    const owners = rows.get(pattern) ?? [];
    assert.ok(owners.length >= minimumOwners, pattern);
    for (const owner of owners) {
      assert.ok(
        placeholders.has(owner) ||
          /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))?$/u.test(
            owner,
          ),
        `${pattern}: ${owner}`,
      );
    }
  }
  assertCompleteOwnershipState(codeowners, placeholders);
  assertCompleteOwnershipState(
    "* @primary-owner\n/reports/v1/ @evidence-owner\n/SECURITY.md @security-owner\n",
    placeholders,
  );
  assert.throws(
    () =>
      assertCompleteOwnershipState(
        "* @PRIMARY_CODE_OWNER_HANDLE_REQUIRED\n/reports/v1/ @evidence-owner\n/SECURITY.md @SECURITY_CODE_OWNER_HANDLE_REQUIRED\n",
        placeholders,
      ),
    /all-placeholder owners or concrete owners/u,
  );
  assert.throws(
    () =>
      assertCompleteOwnershipState(
        `
* @PRIMARY_CODE_OWNER_HANDLE_REQUIRED
/.github/ @PRIMARY_CODE_OWNER_HANDLE_REQUIRED @SECURITY_CODE_OWNER_HANDLE_REQUIRED
/reports/v1/ @real-primary @EVIDENCE_CODE_OWNER_HANDLE_REQUIRED
`,
        placeholders,
      ),
    /all-placeholder owners or concrete owners/u,
  );
  assert.match(security, /`@localhost41` is the repository security owner/u);
  assert.match(release, /still only preparation until GitHub reports/u);
  assert.match(bootstrap, /performs authenticated `GET` requests only/u);
  assert.match(bootstrap, /Ordinary\s+`pnpm ready:local` never runs it/iu);
  assert.deepEqual(protection.required_status_checks, {
    strict: true,
    checks: [
      {
        context: "Validate workspace and contribution data",
        app_id: 15368,
      },
    ],
  });
  assert.equal(
    protection.required_pull_request_reviews?.require_code_owner_reviews,
    true,
  );
  assert.equal(
    protection.required_pull_request_reviews?.require_last_push_approval,
    true,
  );
  assert.equal(
    protection.required_pull_request_reviews?.dismiss_stale_reviews,
    true,
  );
  assert.deepEqual(
    protection.required_pull_request_reviews?.bypass_pull_request_allowances,
    { users: [], teams: [], apps: [] },
  );
  assert.equal(protection.enforce_admins, true);
  assert.equal(protection.required_conversation_resolution, true);
  assert.equal(protection.allow_force_pushes, false);
  assert.equal(protection.allow_deletions, false);
});

test("security, support, release, and dependency policies preserve human gates", async () => {
  const [security, support, release, dependencies] = await Promise.all([
    text("SECURITY.md"),
    text("SUPPORT.md"),
    text("docs/RELEASE-PROCESS.md"),
    text("docs/contributing/dependency-updates.md"),
  ]);
  assert.match(security, /private vulnerability\s+reporting/u);
  assert.match(security, /no invented email address/u);
  assert.match(
    support,
    /does not currently offer public hardware\s+compatibility support/u,
  );
  assert.match(support, /never installs QVAC/u);
  assert.match(release, /Legal\/license approver/u);
  assert.match(release, /explicit owner authorization for all five steps/u);
  assert.match(release, /literal `false`/u);
  assert.match(dependencies, /full\s+40-character commit SHA/iu);
  assert.match(dependencies, /must not auto-merge/u);
  assert.match(
    dependencies,
    /must not declare, install, download, or\s+resolve QVAC/u,
  );
});

test("release metadata and package-content contract cannot drift", async () => {
  const cli = await json("packages/cli/package.json");
  const policy = await import(
    new URL("../packages/cli/scripts/package-policy.mjs", import.meta.url)
  );
  const [builder, packer] = await Promise.all([
    text("packages/cli/scripts/build-bundle.mjs"),
    text("scripts/package-local.mjs"),
  ]);
  assert.equal(cli.name, "qvac-atlas");
  assert.equal(cli.version, "0.1.0");
  assert.equal(Object.hasOwn(cli, "private"), false);
  assert.equal(Object.hasOwn(cli, "dependencies"), false);
  assert.deepEqual(cli.bin, { "qvac-atlas": "./bundle/bin.js" });
  assert.equal(cli.license, "Apache-2.0");
  assert.equal(
    cli.homepage,
    "https://github.com/localhost41/qvac-atlas#readme",
  );
  assert.deepEqual(cli.repository, {
    type: "git",
    url: "git+https://github.com/localhost41/qvac-atlas.git",
  });
  assert.deepEqual(cli.bugs, {
    url: "https://github.com/localhost41/qvac-atlas/issues",
  });
  assert.deepEqual(cli.files, [
    "bundle",
    "schemas",
    "README.md",
    "LICENSE",
    "NOTICE",
  ]);
  assert.equal(cli.engines?.node, ">=22 <23");
  for (const hook of ["preinstall", "install", "postinstall"]) {
    assert.equal(Object.hasOwn(cli.scripts ?? {}, hook), false, hook);
  }

  for (const path of manifests.filter(
    (path) =>
      path.startsWith("packages/") && path !== "packages/cli/package.json",
  )) {
    const manifest = await json(path);
    assert.equal(manifest.version, "0.1.0", path);
    assert.equal(manifest.private, true, path);
  }
  assert.deepEqual(policy.BUNDLE_FILENAMES, [
    "bin.js",
    "child-runner.js",
    "acquisition-child.js",
    "recovery-child.js",
  ]);
  assert.deepEqual(policy.SCHEMA_FILENAMES, [
    "report.schema.json",
    "claim.schema.json",
  ]);
  for (const source of [
    "src/bin.ts",
    "packages/qvac-executor/src/child-runner.ts",
    "packages/model-artifact/src/acquisition-child.ts",
    "packages/model-artifact/src/recovery-child.ts",
  ]) {
    assert.match(builder, new RegExp(source.replaceAll("/", "\\/"), "u"));
  }
  assert.match(packer, /packages["'], ["']schema["'], ["']schemas/u);
  assert.match(packer, /auditAndPublishPackage/u);
  assert.doesNotMatch(packer, /await rm\(artifact/u);
});

test("launch preparation cannot activate production evidence or real execution", async () => {
  const [main, registry, candidate] = await Promise.all([
    text("packages/cli/src/bin.ts"),
    json("registry/catalog.json"),
    json("profiles/candidates/smollm2-360m-instruct-q8.json"),
  ]);
  assert.match(main, /dispatchCli\([\s\S]*,\s*false,\s*\);/u);
  assert.doesNotMatch(main, /QVAC_ATLAS_(?:REAL|ENABLE)/u);
  assert.deepEqual(registry.productionProfiles, []);
  assert.equal(
    registry.sources.some((source) => source.kind === "genuine"),
    false,
  );
  assert.equal(candidate.claim_eligible, false);
  assert.match(candidate.profile_version, /-candidate\./u);
});
