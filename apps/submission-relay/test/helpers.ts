import { readFile } from "node:fs/promises";

import { canonicalize, withReportId } from "@qvac-atlas/schema";
import {
  admitExactSubmission,
  SUBMISSION_PROFILE,
  type AdmittedSubmission,
} from "@qvac-atlas/submission";

export async function eligibleJson(
  createdAt = "2026-08-04T00:00:00.000Z",
): Promise<string> {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        "../../../packages/schema/fixtures/success.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  fixture.consent.publication = true;
  fixture.created_at = createdAt;
  fixture.profile = { ...SUBMISSION_PROFILE };
  fixture.provenance = { fixture_id: null, kind: "probe" };
  return `${canonicalize(withReportId(fixture))}\n`;
}

export async function eligibleSubmission(
  createdAt?: string,
): Promise<AdmittedSubmission> {
  return admitExactSubmission(await eligibleJson(createdAt));
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
