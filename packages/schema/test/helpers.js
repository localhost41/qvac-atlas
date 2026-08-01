import { readFile } from "node:fs/promises";
import { withReportId } from "../src/canonicalize.js";

export async function jsonFixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

export async function standardProfiles() {
  const profile = JSON.parse(
    await readFile(new URL("../../../profiles/fixtures/atlas-small-llm-lifecycle-test.json", import.meta.url), "utf8"),
  );
  return [profile];
}

export function asProbe(report) {
  const copy = structuredClone(report);
  copy.provenance = { kind: "probe", fixture_id: null };
  return withReportId(copy);
}
