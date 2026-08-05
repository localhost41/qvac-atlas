import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalize, withReportId } from "../packages/schema/src/index.js";
import { SUBMISSION_PROFILE } from "../packages/submission/dist/index.js";
import { reviewAnonymousSubmission } from "./review-anonymous-submission.mjs";

async function eligibleJson() {
  const report = JSON.parse(
    await readFile("packages/schema/fixtures/success.json", "utf8"),
  );
  report.consent.publication = true;
  report.created_at = "2026-08-04T00:00:00.000Z";
  report.profile = { ...SUBMISSION_PROFILE };
  report.provenance = { fixture_id: null, kind: "probe" };
  return `${canonicalize(withReportId(report))}\n`;
}

test("review emits only the canonical anonymous promotion metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-anonymous-review-"));
  const report = join(root, "report.json");
  try {
    await writeFile(report, await eligibleJson(), { mode: 0o600 });
    const result = await reviewAnonymousSubmission(report);
    assert.match(result.reportId, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(
      result.targetPath,
      `reports/v1/${result.reportId.replace(":", "-")}.json`,
    );
    assert.deepEqual(result.sourceMetadata, {
      independence: "unverified-anonymous",
      kind: "genuine",
      lifecycle: { state: "active" },
      path: result.targetPath,
      sourceKey: "source:anonymous-relay",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review rejects noncanonical files and symlinks without path reflection", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-anonymous-hostile-"));
  const canary = join(root, "private-canary.json");
  const linked = join(root, "linked.json");
  try {
    await writeFile(canary, "{}\n", { mode: 0o600 });
    await symlink(canary, linked);
    for (const path of [canary, linked]) {
      await assert.rejects(
        reviewAnonymousSubmission(path),
        (error) =>
          error instanceof Error &&
          error.message === "Anonymous submission review failed safely." &&
          !error.message.includes(root),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
