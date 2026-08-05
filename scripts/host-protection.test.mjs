import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseHostArguments,
  repositoryProtectionFailures,
  unresolvedCodeOwnerPlaceholders,
} from "./verify-host-protection.mjs";

const head = "a".repeat(40);

function protectedHost() {
  return {
    repository: {
      owner: { login: "approved-owner", type: "User" },
      visibility: "public",
      private: false,
      default_branch: "main",
    },
    branch: { protected: true, commit: { sha: head } },
    protection: {
      required_status_checks: {
        strict: true,
        contexts: ["Validate workspace and contribution data"],
        checks: [
          {
            context: "Validate workspace and contribution data",
            app_id: 15368,
          },
        ],
      },
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      },
      enforce_admins: { enabled: true },
      required_linear_history: { enabled: true },
      required_conversation_resolution: { enabled: true },
      block_creations: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    },
    codeowners: { errors: [] },
    vulnerabilityReporting: { enabled: true },
    pages: { build_type: "workflow" },
    pagesEnvironment: {
      can_admins_bypass: false,
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: true,
          reviewers: [
            {
              type: "User",
              reviewer: { login: "independent-reviewer" },
            },
          ],
        },
      ],
      deployment_branch_policy: {
        protected_branches: true,
        custom_branch_policies: false,
      },
    },
    checkRuns: {
      check_runs: [
        {
          id: 100,
          name: "Validate workspace and contribution data",
          head_sha: head,
          status: "completed",
          conclusion: "success",
          app: { id: 15368 },
        },
      ],
    },
    expectedBranch: "main",
    expectedHead: head,
    deploymentReviewer: "independent-reviewer",
  };
}

test("exact host arguments are accepted and ambiguous targets fail closed", () => {
  assert.deepEqual(
    parseHostArguments([
      "--repository",
      "approved-owner/qvac-atlas",
      "--branch",
      "main",
      "--expected-head",
      head,
      "--deployment-reviewer",
      "independent-reviewer",
    ]),
    {
      repository: "approved-owner/qvac-atlas",
      branch: "main",
      expectedHead: head,
      deploymentReviewer: "independent-reviewer",
      independentReviewer: true,
    },
  );
  assert.throws(() => parseHostArguments([]), /explicit GitHub/u);
  assert.throws(
    () =>
      parseHostArguments([
        "--repository",
        "approved-owner/qvac-atlas",
        "--branch",
        "integration",
        "--expected-head",
        head,
        "--deployment-reviewer",
        "independent-reviewer",
      ]),
    /exactly main/u,
  );
  assert.throws(
    () =>
      parseHostArguments([
        "--repository",
        "approved-owner/qvac-atlas",
        "--branch",
        "main",
        "--expected-head",
        "main",
        "--deployment-reviewer",
        "independent-reviewer",
      ]),
    /40 lowercase/u,
  );
  assert.throws(
    () =>
      parseHostArguments([
        "--repository",
        "localhost41/qvac-atlas",
        "--branch",
        "main",
        "--expected-head",
        head,
        "--deployment-reviewer",
        "LocalHost41",
      ]),
    /differ from the repository owner/u,
  );
});

test("owner-operated host mode accepts protected branches without reviewer rules", () => {
  const state = protectedHost();
  state.deploymentReviewer = "";
  state.pagesEnvironment.protection_rules = [];
  state.protection.required_pull_request_reviews = null;
  state.independentReviewer = false;
  assert.deepEqual(repositoryProtectionFailures(state), []);
  assert.deepEqual(
    parseHostArguments([
      "--repository",
      "approved-owner/qvac-atlas",
      "--branch",
      "main",
      "--expected-head",
      head,
      "--no-independent-reviewer",
    ]),
    {
      repository: "approved-owner/qvac-atlas",
      branch: "main",
      expectedHead: head,
      deploymentReviewer: "",
      independentReviewer: false,
    },
  );
});

test("owner-operated personal repositories may lack block-creations support", () => {
  const state = protectedHost();
  state.independentReviewer = false;
  state.deploymentReviewer = "";
  state.pagesEnvironment.protection_rules = [];
  state.protection.required_pull_request_reviews = null;
  state.protection.block_creations.enabled = false;
  assert.deepEqual(repositoryProtectionFailures(state), []);
  state.repository.owner.type = "Organization";
  assert.match(
    repositoryProtectionFailures(state).join("\n"),
    /matching branch creation/u,
  );
});

test("placeholder ownership is explicit and launch-blocking", async () => {
  const placeholders = `
* @PRIMARY_CODE_OWNER_HANDLE_REQUIRED
/reports/v1/ @EVIDENCE_CODE_OWNER_HANDLE_REQUIRED
/SECURITY.md @SECURITY_CODE_OWNER_HANDLE_REQUIRED
`;
  assert.deepEqual(unresolvedCodeOwnerPlaceholders(placeholders), [
    "@EVIDENCE_CODE_OWNER_HANDLE_REQUIRED",
    "@PRIMARY_CODE_OWNER_HANDLE_REQUIRED",
    "@SECURITY_CODE_OWNER_HANDLE_REQUIRED",
  ]);
  assert.deepEqual(
    unresolvedCodeOwnerPlaceholders(
      "* @accepted-owner\n/SECURITY.md @security-owner\n",
    ),
    [],
  );
});

test("the complete protected host shape passes", () => {
  assert.deepEqual(repositoryProtectionFailures(protectedHost()), []);
});

test("the Pages reviewer must differ from the repository owner case-insensitively", () => {
  const state = protectedHost();
  state.deploymentReviewer = "APPROVED-OWNER";
  state.pagesEnvironment.protection_rules[0].reviewers[0].reviewer.login =
    "approved-owner";
  assert.match(
    repositoryProtectionFailures(state).join("\n"),
    /not independent from the repository owner/u,
  );
});

test("weak or stale host controls fail every release boundary", () => {
  const state = protectedHost();
  state.repository.visibility = "private";
  state.repository.private = true;
  state.repository.default_branch = "integration";
  state.branch.protected = false;
  state.branch.commit.sha = "b".repeat(40);
  state.codeowners.errors.push({ path: ".github/CODEOWNERS", line: 1 });
  state.vulnerabilityReporting.enabled = false;
  state.protection.required_status_checks.strict = false;
  state.protection.required_status_checks.contexts = [];
  state.protection.required_status_checks.checks[0].app_id = 1;
  state.checkRuns.check_runs[0].conclusion = "failure";
  state.pages.build_type = "legacy";
  state.pagesEnvironment.can_admins_bypass = true;
  state.pagesEnvironment.protection_rules[0].prevent_self_review = false;
  state.pagesEnvironment.protection_rules[0].reviewers = [];
  state.pagesEnvironment.deployment_branch_policy.protected_branches = false;
  state.pagesEnvironment.deployment_branch_policy.custom_branch_policies = true;
  state.protection.required_pull_request_reviews.dismiss_stale_reviews = false;
  state.protection.required_pull_request_reviews.require_code_owner_reviews = false;
  state.protection.required_pull_request_reviews.require_last_push_approval = false;
  state.protection.required_pull_request_reviews.required_approving_review_count = 0;
  state.protection.required_pull_request_reviews.bypass_pull_request_allowances.users.push(
    { login: "bypass" },
  );
  state.protection.enforce_admins.enabled = false;
  state.protection.required_linear_history.enabled = false;
  state.protection.required_conversation_resolution.enabled = false;
  state.protection.block_creations.enabled = false;
  state.protection.allow_force_pushes.enabled = true;
  state.protection.allow_deletions.enabled = true;

  const failures = repositoryProtectionFailures(state);
  assert.ok(failures.length >= 20);
  assert.match(failures.join("\n"), /CODEOWNERS/u);
  assert.match(failures.join("\n"), /latest push/u);
  assert.match(failures.join("\n"), /bypass/u);
  assert.match(failures.join("\n"), /GitHub Actions app/u);
  assert.match(failures.join("\n"), /Pages deployment reviewer/u);
  assert.match(failures.join("\n"), /newest reviewed-commit GitHub Actions/u);
  assert.match(failures.join("\n"), /administrators can bypass/u);
});

test("a newer failed rerun cannot be masked by an older success", () => {
  const state = protectedHost();
  state.checkRuns.check_runs = [
    {
      id: 900,
      name: "Validate workspace and contribution data",
      head_sha: head,
      status: "completed",
      conclusion: "success",
      app: { id: 15368 },
    },
    {
      id: 901,
      name: "Validate workspace and contribution data",
      head_sha: head,
      status: "completed",
      conclusion: "failure",
      app: { id: 15368 },
    },
  ];
  assert.match(
    repositoryProtectionFailures(state).join("\n"),
    /newest reviewed-commit GitHub Actions/u,
  );
});

test("host verifier source is read-only and absent from ordinary readiness", async () => {
  const [verifier, readiness] = await Promise.all([
    readFile(new URL("./verify-host-protection.mjs", import.meta.url), "utf8"),
    readFile(new URL("./ready-local.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(verifier, /"--method",\s*"GET"/u);
  assert.doesNotMatch(verifier, /"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.match(verifier, /environments\/github-pages/u);
  assert.match(
    verifier,
    /commits\/\$\{encodedHead\}\/check-runs\?check_name=/u,
  );
  assert.match(verifier, /repos\/\$\{encodedRepository\}\/pages/u);
  assert.doesNotMatch(readiness, /verify-host-protection/u);
});
