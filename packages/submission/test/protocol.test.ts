import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize, withReportId } from "@qvac-atlas/schema";

import {
  admitExactSubmission,
  isSubmissionEligibleReport,
  parseReceipt,
  serializeReceipt,
  SubmissionProtocolError,
} from "../src/index.js";
import { eligibleJson, eligibleReport } from "./helpers.js";

test("one exact eligible genuine report is admitted", async () => {
  const exactJson = await eligibleJson();
  const admitted = admitExactSubmission(exactJson);
  assert.equal(admitted.exactJson, exactJson);
  assert.equal(admitted.reportId, admitted.report.report_id);
  assert.equal(admitted.digest.length, 64);
  assert.equal(isSubmissionEligibleReport(admitted.report), true);
});

test("admission fails closed across transport, privacy, and trust boundaries", async () => {
  const report = await eligibleReport();
  const cases: Array<[string, () => string]> = [
    ["empty", () => ""],
    ["BOM", () => `\ufeff${canonicalize(report)}\n`],
    ["missing terminal newline", () => canonicalize(report)],
    ["insignificant whitespace", () => `${JSON.stringify(report, null, 2)}\n`],
    ["duplicate key", () => '{"schema_version":"1","schema_version":"2"}\n'],
    [
      "fixture",
      () => {
        const changed = structuredClone(report);
        changed.provenance = { fixture_id: "hostile", kind: "fixture" };
        return `${canonicalize(withReportId(changed))}\n`;
      },
    ],
    [
      "publication false",
      () => {
        const changed = structuredClone(report);
        changed.consent.publication = false;
        return `${canonicalize(withReportId(changed))}\n`;
      },
    ],
    [
      "unknown profile",
      () => {
        const changed = structuredClone(report);
        changed.profile.id = "unknown-profile";
        return `${canonicalize(withReportId(changed))}\n`;
      },
    ],
    ["unknown field", () => `${canonicalize({ ...report, unknown: true })}\n`],
    [
      "identifier mismatch",
      () =>
        `${canonicalize({ ...report, report_id: `sha256:${"0".repeat(64)}` })}\n`,
    ],
    [
      "privacy canary",
      () => {
        const changed = structuredClone(report);
        changed.platform.cpu.model = "user@example.com";
        return `${canonicalize(withReportId(changed))}\n`;
      },
    ],
  ];
  for (const [name, exactJson] of cases) {
    assert.throws(
      () => admitExactSubmission(exactJson()),
      SubmissionProtocolError,
      name,
    );
  }
  assert.throws(() => admitExactSubmission(" ".repeat(65_537)), /body-size/);
});

test("receipt grammar is exact and bound to the report ID", async () => {
  const { reportId } = admitExactSubmission(await eligibleJson());
  const exact = serializeReceipt({ status: "queued", submissionId: reportId });
  assert.deepEqual(parseReceipt(JSON.parse(exact), reportId), {
    status: "queued",
    submissionId: reportId,
  });
  assert.throws(
    () =>
      parseReceipt(
        { status: "queued", submission_id: reportId, extra: true },
        reportId,
      ),
    /receipt-invalid/,
  );
});
