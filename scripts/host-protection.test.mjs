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
      visibility: "public",
      private: false,
      default_branch: "main",
    },
    branch: { protected: true, commit: { sha: head } },
    protection: {
      required_status_checks: {
        strict: true,
        contexts: ["Validate workspace and contribution data"],
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
    expectedBranch: "main",
    expectedHead: head,
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
    ]),
    {
      repository: "approved-owner/qvac-atlas",
      branch: "main",
      expectedHead: head,
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
      ]),
    /40 lowercase/u,
  );
});

test("placeholder ownership is explicit and launch-blocking", async () => {
  const codeowners = await readFile(
    new URL("../.github/CODEOWNERS", import.meta.url),
    "utf8",
  );
  assert.deepEqual(unresolvedCodeOwnerPlaceholders(codeowners), [
    "@EVIDENCE_CODE_OWNER_HANDLE_REQUIRED",
    "@PRIMARY_CODE_OWNER_HANDLE_REQUIRED",
    "@SECURITY_CODE_OWNER_HANDLE_REQUIRED",
  ]);
});

test("the complete protected host shape passes", () => {
  assert.deepEqual(repositoryProtectionFailures(protectedHost()), []);
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
  assert.equal(failures.length, 19);
  assert.match(failures.join("\n"), /CODEOWNERS/u);
  assert.match(failures.join("\n"), /latest push/u);
  assert.match(failures.join("\n"), /bypass/u);
});

test("host verifier source is read-only and absent from ordinary readiness", async () => {
  const [verifier, readiness] = await Promise.all([
    readFile(new URL("./verify-host-protection.mjs", import.meta.url), "utf8"),
    readFile(new URL("./ready-local.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(verifier, /"--method",\s*"GET"/u);
  assert.doesNotMatch(verifier, /"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.doesNotMatch(readiness, /verify-host-protection/u);
});
