import { readFile } from "node:fs/promises";

import { canonicalize, withReportId } from "@qvac-atlas/schema";

import { SUBMISSION_PROFILE } from "../src/index.js";

export async function eligibleReport(): Promise<Record<string, any>> {
  const fixture = JSON.parse(
    await readFile(
      new URL("../../schema/fixtures/success.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.consent.publication = true;
  fixture.created_at = "2026-08-04T00:00:00.000Z";
  fixture.profile = { ...SUBMISSION_PROFILE };
  fixture.provenance = { fixture_id: null, kind: "probe" };
  return withReportId(fixture);
}

export async function eligibleJson(): Promise<string> {
  return `${canonicalize(await eligibleReport())}\n`;
}
