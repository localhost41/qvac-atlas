import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const EXACT_COMMIT = /^[a-f0-9]{40}$/;
const ALL_ZERO_COMMIT = /^0{40}$/;
const REPORT_PATH = /^reports\/v1\/sha256-[a-f0-9]{64}\.json$/;
const KEEP_PATH = "reports/v1/.gitkeep";
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

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

/**
 * Proves that one checked-out target commit only adds canonical genuine reports
 * relative to an explicit trusted base. Existing report blobs and modes must be
 * byte-for-byte identical; no ref, merge base, or working tree is guessed.
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

  return Object.freeze({
    additions: [...targetReports.keys()].filter(
      (path) => !baseReports.has(path),
    ).length,
    preserved: baseReports.size,
  });
}
