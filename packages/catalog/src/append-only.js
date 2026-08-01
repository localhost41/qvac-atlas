import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const EXACT_COMMIT = /^[a-f0-9]{40}$/;
const ALL_ZERO_COMMIT = /^0{40}$/;
const REPORT_PATH = /^reports\/v1\/sha256-[a-f0-9]{64}\.json$/;
const KEEP_PATH = "reports/v1/.gitkeep";
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_INTRODUCED_COMMITS = 256;
const MAX_COMMIT_PARENTS = 64;

class AppendOnlyAuditError extends Error {}

function reject(reason) {
  throw new AppendOnlyAuditError(`Append-only report audit failed: ${reason}`);
}

async function git(root, args, { encoding = "utf8" } = {}) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
      encoding,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    return stdout;
  } catch {
    reject("the requested Git history is unavailable");
  }
}

async function exactCommit(root, revision) {
  if (
    typeof revision !== "string" ||
    !EXACT_COMMIT.test(revision) ||
    ALL_ZERO_COMMIT.test(revision)
  ) {
    reject("both revisions must be explicit nonzero 40-hex commit IDs");
  }
  const resolved = String(
    await git(root, ["rev-parse", "--verify", `${revision}^{commit}`]),
  ).trim();
  if (resolved !== revision) reject("the requested Git history is unavailable");
  return resolved;
}

function parseTree(output) {
  const reports = new Map();
  for (const record of output.toString("utf8").split("\0")) {
    if (record.length === 0) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) reject("a report tree entry is malformed");
    const metadata = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (metadata.length !== 3) reject("a report tree entry is malformed");
    const [mode, type, object] = metadata;
    if (path === KEEP_PATH) {
      if (mode !== "100644" || type !== "blob")
        reject("the report directory marker is not a regular file");
      continue;
    }
    if (!REPORT_PATH.test(path))
      reject("a report tree entry is outside the canonical path boundary");
    if (mode !== "100644" || type !== "blob")
      reject("a genuine report is not a non-executable regular file");
    reports.set(path, Object.freeze({ mode, object, type }));
  }
  return reports;
}

async function reportTree(root, revision) {
  const output = await git(
    root,
    ["ls-tree", "-rz", "--full-tree", revision, "--", "reports/v1"],
    { encoding: "buffer" },
  );
  return parseTree(output);
}

function parseIntroducedHistory(output, target) {
  const lines = output.trim().length === 0 ? [] : output.trim().split("\n");
  if (lines.length > MAX_INTRODUCED_COMMITS)
    reject("the introduced Git history exceeds the audit bound");

  const edges = [];
  const commits = new Set();
  for (const line of lines) {
    const revisions = line.split(" ");
    const [child, ...parents] = revisions;
    if (
      child === undefined ||
      !EXACT_COMMIT.test(child) ||
      parents.some((parent) => !EXACT_COMMIT.test(parent))
    ) {
      reject("the introduced Git history is malformed");
    }
    if (parents.length > MAX_COMMIT_PARENTS)
      reject("an introduced commit exceeds the parent bound");
    commits.add(child);
    for (const parent of parents) edges.push(Object.freeze({ child, parent }));
  }
  if (target !== undefined && target !== null && target.length > 0) {
    if (lines.length === 0 || !commits.has(target))
      reject("the introduced Git history does not contain the target");
  }
  return edges;
}

async function introducedEdges(root, base, target) {
  if (base === target) return [];
  const output = String(
    await git(root, [
      "rev-list",
      "--parents",
      "--topo-order",
      target,
      `^${base}`,
    ]),
  );
  return parseIntroducedHistory(output, target);
}

function sameEntry(left, right) {
  return (
    left !== undefined &&
    right !== undefined &&
    left.mode === right.mode &&
    left.type === right.type &&
    left.object === right.object
  );
}

async function assertHistoryPreservesBaseReports(
  root,
  baseReports,
  base,
  target,
) {
  const edges = await introducedEdges(root, base, target);
  const trees = new Map([[base, baseReports]]);
  async function tree(revision) {
    if (!trees.has(revision))
      trees.set(revision, await reportTree(root, revision));
    return trees.get(revision);
  }

  for (const { child, parent } of edges) {
    const [parentReports, childReports] = await Promise.all([
      tree(parent),
      tree(child),
    ]);
    for (const [path, trusted] of baseReports) {
      if (
        sameEntry(parentReports.get(path), trusted) &&
        !sameEntry(childReports.get(path), trusted)
      ) {
        reject("a trusted genuine report changed within introduced history");
      }
    }
  }
}

/**
 * Proves that one checked-out target commit only adds canonical genuine reports
 * relative to an explicit trusted base. Existing report blobs and modes must be
 * byte-for-byte identical at every relevant introduced parent-child edge as well
 * as the target; no ref, merge base, or working tree is guessed.
 */
export async function assertAppendOnlyReports({
  root,
  baseRevision,
  targetRevision,
}) {
  const base = await exactCommit(root, baseRevision);
  const target = await exactCommit(root, targetRevision);
  const head = String(
    await git(root, ["rev-parse", "--verify", "HEAD^{commit}"]),
  ).trim();
  if (head !== target)
    reject("the explicit target commit is not the checked-out HEAD");

  try {
    await execFileAsync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", base, target],
      { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
    );
  } catch {
    reject("the trusted base is not an ancestor of the target");
  }

  const reportStatus = await git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    "reports/v1",
  ]);
  if (reportStatus.length !== 0)
    reject("the checked-out report directory differs from the target commit");

  const [baseReports, targetReports] = await Promise.all([
    reportTree(root, base),
    reportTree(root, target),
  ]);
  for (const [path, expected] of baseReports) {
    const observed = targetReports.get(path);
    if (
      observed === undefined ||
      observed.mode !== expected.mode ||
      observed.type !== expected.type ||
      observed.object !== expected.object
    ) {
      reject("a pre-existing genuine report has a non-additive change");
    }
  }
  await assertHistoryPreservesBaseReports(root, baseReports, base, target);

  return Object.freeze({
    additions: [...targetReports.keys()].filter(
      (path) => !baseReports.has(path),
    ).length,
    preserved: baseReports.size,
  });
}
