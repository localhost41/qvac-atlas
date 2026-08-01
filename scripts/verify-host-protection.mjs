#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_CONTEXT = "Validate workspace and contribution data";
const PLACEHOLDER = /@[A-Z][A-Z0-9_]*_HANDLE_REQUIRED\b/gu;

export function parseHostArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      !["--repository", "--branch", "--expected-head"].includes(option ?? "") ||
      value === undefined
    ) {
      throw new Error(
        "Usage: verify-host-protection.mjs --repository OWNER/REPO --branch main --expected-head <40 lowercase hex>",
      );
    }
    if (values.has(option)) throw new Error(`Duplicate option: ${option}`);
    values.set(option, value);
  }

  const repository = values.get("--repository") ?? "";
  const branch = values.get("--branch") ?? "";
  const expectedHead = values.get("--expected-head") ?? "";
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/u.test(
      repository,
    )
  )
    throw new Error(
      "Repository must be an explicit GitHub OWNER/REPO identifier.",
    );
  if (branch !== "main")
    throw new Error("The V1 protected release branch must be exactly main.");
  if (!/^[a-f0-9]{40}$/u.test(expectedHead))
    throw new Error(
      "Expected head must be exactly 40 lowercase hexadecimal characters.",
    );
  return { repository, branch, expectedHead };
}

export function unresolvedCodeOwnerPlaceholders(codeowners) {
  return [...new Set(codeowners.match(PLACEHOLDER) ?? [])].sort();
}

function isEnabled(value) {
  return value === true || value?.enabled === true;
}

function isDisabled(value) {
  return value === false || value?.enabled === false;
}

function allowanceCount(allowances) {
  if (allowances === undefined || allowances === null) return 0;
  return ["users", "teams", "apps"].reduce((count, key) => {
    const value = allowances[key];
    return count + (Array.isArray(value) ? value.length : 1);
  }, 0);
}

export function repositoryProtectionFailures({
  repository,
  branch,
  protection,
  codeowners,
  vulnerabilityReporting,
  expectedBranch,
  expectedHead,
  requiredContext = REQUIRED_CONTEXT,
}) {
  const failures = [];
  if (repository?.visibility !== "public" || repository?.private !== false)
    failures.push("repository is not public");
  if (repository?.default_branch !== expectedBranch)
    failures.push("default branch does not match the protected release branch");
  if (branch?.commit?.sha !== expectedHead)
    failures.push("release branch head does not match the reviewed commit");
  if (branch?.protected !== true)
    failures.push("release branch is not marked protected");

  const codeownerErrors = codeowners?.errors;
  if (!Array.isArray(codeownerErrors) || codeownerErrors.length !== 0)
    failures.push(
      "GitHub reports CODEOWNERS errors or returned no error result",
    );
  if (!isEnabled(vulnerabilityReporting))
    failures.push("private vulnerability reporting is not enabled");

  const statusChecks = protection?.required_status_checks;
  if (statusChecks?.strict !== true)
    failures.push("required status checks do not require an up-to-date branch");
  const contexts = new Set([
    ...(Array.isArray(statusChecks?.contexts) ? statusChecks.contexts : []),
    ...(Array.isArray(statusChecks?.checks)
      ? statusChecks.checks.map((check) => check?.context)
      : []),
  ]);
  if (!contexts.has(requiredContext))
    failures.push("required workspace status check is missing");

  const reviews = protection?.required_pull_request_reviews;
  if (reviews === null || reviews === undefined)
    failures.push("pull requests and review are not required");
  else {
    if (reviews.dismiss_stale_reviews !== true)
      failures.push("stale approvals are not dismissed after changes");
    if (reviews.require_code_owner_reviews !== true)
      failures.push("code-owner approval is not required");
    if (reviews.require_last_push_approval !== true)
      failures.push("approval after the latest push is not required");
    if (
      !Number.isInteger(reviews.required_approving_review_count) ||
      reviews.required_approving_review_count < 1
    )
      failures.push("at least one approving review is not required");
    if (allowanceCount(reviews.bypass_pull_request_allowances) !== 0)
      failures.push("pull-request bypass actors are configured");
  }

  if (!isEnabled(protection?.enforce_admins))
    failures.push("branch protection does not include administrators");
  if (!isEnabled(protection?.required_linear_history))
    failures.push("linear history is not required");
  if (!isEnabled(protection?.required_conversation_resolution))
    failures.push("conversation resolution is not required");
  if (!isEnabled(protection?.block_creations))
    failures.push("matching branch creation is not blocked");
  if (!isDisabled(protection?.allow_force_pushes))
    failures.push("force pushes are not explicitly disabled");
  if (!isDisabled(protection?.allow_deletions))
    failures.push("branch deletion is not explicitly disabled");

  return failures;
}

async function githubGet(endpoint) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        endpoint,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ));
  } catch {
    throw new Error(`GitHub read-only verification failed for ${endpoint}.`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`GitHub returned invalid JSON for ${endpoint}.`);
  }
}

export async function verifyHostProtection({
  repository,
  branch,
  expectedHead,
}) {
  const codeownersText = await readFile(
    resolve(root, ".github/CODEOWNERS"),
    "utf8",
  );
  const placeholders = unresolvedCodeOwnerPlaceholders(codeownersText);
  if (placeholders.length > 0) {
    throw new Error(
      `Host verification blocked: replace ${String(placeholders.length)} CODEOWNERS placeholder(s) first.`,
    );
  }

  const encodedRepository = repository
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedBranch = encodeURIComponent(branch);
  const encodedHead = encodeURIComponent(expectedHead);
  const [repositoryState, branchState, protection, codeowners, vulnerability] =
    await Promise.all([
      githubGet(`repos/${encodedRepository}`),
      githubGet(`repos/${encodedRepository}/branches/${encodedBranch}`),
      githubGet(
        `repos/${encodedRepository}/branches/${encodedBranch}/protection`,
      ),
      githubGet(
        `repos/${encodedRepository}/codeowners/errors?ref=${encodedHead}`,
      ),
      githubGet(`repos/${encodedRepository}/private-vulnerability-reporting`),
    ]);

  const failures = repositoryProtectionFailures({
    repository: repositoryState,
    branch: branchState,
    protection,
    codeowners,
    vulnerabilityReporting: vulnerability,
    expectedBranch: branch,
    expectedHead,
  });
  if (failures.length > 0) {
    throw new Error(
      `Public-host trust verification failed:\n- ${failures.join("\n- ")}`,
    );
  }
  return { repository, branch, expectedHead };
}

async function main() {
  const options = parseHostArguments(process.argv.slice(2));
  const result = await verifyHostProtection(options);
  process.stdout.write(
    `Public-host trust verified read-only for ${result.repository} ${result.branch} at ${result.expectedHead}.\n`,
  );
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedUrl) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Public-host trust verification failed safely."}\n`,
    );
    process.exitCode = 1;
  }
}
