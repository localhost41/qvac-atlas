import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { assertAppendOnlyReports } from "../src/append-only.js";

const execFileAsync = promisify(execFile);
const REPORT_A = `reports/v1/sha256-${"a".repeat(64)}.json`;
const REPORT_B = `reports/v1/sha256-${"b".repeat(64)}.json`;

async function git(root, ...args) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  return stdout.trim();
}

async function commit(root, message) {
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

async function write(root, path, contents) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

async function repository(t, { withReport = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "qvac-atlas-append-only-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, "init", "--quiet");
  await git(root, "config", "user.name", "Atlas Test");
  await git(root, "config", "user.email", "atlas@example.invalid");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "config", "core.hooksPath", ".git/hooks-disabled");
  await write(root, "reports/v1/.gitkeep", "");
  await commit(root, "initialize reports");
  if (withReport) {
    await write(root, REPORT_A, '{"report":"a"}\n');
    await commit(root, "add first report");
  }
  return root;
}

async function rejectsWithoutPath(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.match(error.message, pattern);
    assert.doesNotMatch(error.message, /sha256-|reports\/v1/);
    return true;
  });
}

test("an exact checked-out target may add a new canonical report", async (t) => {
  const root = await repository(t);
  const baseRevision = await git(root, "rev-parse", "HEAD");
  await write(root, REPORT_B, '{"report":"b"}\n');
  const targetRevision = await commit(root, "add second report");

  assert.deepEqual(
    await assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    { additions: 1, preserved: 1 },
  );
});

test("modifying a pre-existing genuine report is rejected", async (t) => {
  const root = await repository(t);
  const baseRevision = await git(root, "rev-parse", "HEAD");
  await write(root, REPORT_A, '{"report":"changed"}\n');
  const targetRevision = await commit(root, "modify report");

  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /pre-existing genuine report has a non-additive change/,
  );
});

test("deleting a pre-existing genuine report is rejected", async (t) => {
  const root = await repository(t);
  const baseRevision = await git(root, "rev-parse", "HEAD");
  await unlink(join(root, REPORT_A));
  const targetRevision = await commit(root, "delete report");

  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /pre-existing genuine report has a non-additive change/,
  );
});

test("renaming a pre-existing genuine report is rejected", async (t) => {
  const root = await repository(t);
  const baseRevision = await git(root, "rev-parse", "HEAD");
  await rename(join(root, REPORT_A), join(root, REPORT_B));
  const targetRevision = await commit(root, "rename report");

  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /pre-existing genuine report has a non-additive change/,
  );
});

test(
  "changing a genuine report mode is rejected",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await repository(t);
    const baseRevision = await git(root, "rev-parse", "HEAD");
    await chmod(join(root, REPORT_A), 0o755);
    const targetRevision = await commit(root, "change report mode");

    await rejectsWithoutPath(
      assertAppendOnlyReports({ root, baseRevision, targetRevision }),
      /genuine report is not a non-executable regular file/,
    );
  },
);

test(
  "changing a genuine report into a symlink is rejected",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await repository(t);
    const baseRevision = await git(root, "rev-parse", "HEAD");
    await unlink(join(root, REPORT_A));
    await symlink("elsewhere.json", join(root, REPORT_A));
    const targetRevision = await commit(root, "change report type");

    await rejectsWithoutPath(
      assertAppendOnlyReports({ root, baseRevision, targetRevision }),
      /genuine report is not a non-executable regular file/,
    );
  },
);

test("a noncanonical report path is rejected", async (t) => {
  const root = await repository(t, { withReport: false });
  const baseRevision = await git(root, "rev-parse", "HEAD");
  await write(root, `reports/v1/nested/sha256-${"c".repeat(64)}.json`, "{}\n");
  const targetRevision = await commit(root, "add nested report");

  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /outside the canonical path boundary/,
  );
});

test("zero, malformed, and unavailable revisions fail closed", async (t) => {
  const root = await repository(t);
  const targetRevision = await git(root, "rev-parse", "HEAD");
  for (const baseRevision of ["0".repeat(40), "not-a-commit", "f".repeat(40)]) {
    await rejectsWithoutPath(
      assertAppendOnlyReports({ root, baseRevision, targetRevision }),
      /explicit nonzero 40-hex commit IDs|requested Git history is unavailable/,
    );
  }
});

test("the explicit target must be checked out with a clean report tree", async (t) => {
  const root = await repository(t);
  const targetRevision = await git(root, "rev-parse", "HEAD");
  const baseRevision = await git(root, "rev-parse", "HEAD^");

  await git(root, "checkout", "--quiet", baseRevision);
  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /target commit is not the checked-out HEAD/,
  );

  await git(root, "checkout", "--quiet", targetRevision);
  await write(root, REPORT_A, '{"report":"dirty"}\n');
  await rejectsWithoutPath(
    assertAppendOnlyReports({ root, baseRevision, targetRevision }),
    /report directory differs from the target commit/,
  );
});

test("an unrelated base is rejected instead of being guessed", async (t) => {
  const root = await repository(t);
  const targetRevision = await git(root, "rev-parse", "HEAD");
  await git(root, "checkout", "--quiet", "--orphan", "unrelated");
  await git(root, "rm", "--quiet", "-rf", ".");
  await write(root, "reports/v1/.gitkeep", "");
  const unrelated = await commit(root, "unrelated root");
  await git(root, "checkout", "--quiet", targetRevision);

  await rejectsWithoutPath(
    assertAppendOnlyReports({
      root,
      baseRevision: unrelated,
      targetRevision,
    }),
    /trusted base is not an ancestor of the target/,
  );
});
