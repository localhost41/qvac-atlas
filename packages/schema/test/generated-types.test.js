import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertReportTypesCurrent,
  generateReportTypes,
} from "../scripts/generate-report-types.mjs";

const schemaUrl = new URL("../schemas/report.schema.json", import.meta.url);
const declarationUrl = new URL("../src/generated/report.d.ts", import.meta.url);

async function inputs() {
  return {
    schema: JSON.parse(await readFile(schemaUrl, "utf8")),
    checkedIn: await readFile(declarationUrl, "utf8"),
  };
}

test("checked-in report declaration is a deterministic schema projection", async () => {
  const { schema, checkedIn } = await inputs();
  assert.equal(await generateReportTypes(schema), checkedIn);
  await assert.doesNotReject(assertReportTypesCurrent(schema, checkedIn));
});

test("a report schema change fails the type drift gate", async () => {
  const { schema, checkedIn } = await inputs();
  schema.$defs.runtime.properties.node_version = { const: "99.0.0" };
  await assert.rejects(
    assertReportTypesCurrent(schema, checkedIn),
    /generated report type drift/,
  );
});

test("a runtime-only conditional schema change also fails the drift gate", async () => {
  const { schema, checkedIn } = await inputs();
  schema.$defs.provenance.allOf[0].then.properties.fixture_id.maxLength = 32;
  await assert.rejects(
    assertReportTypesCurrent(schema, checkedIn),
    /generated report type drift/,
  );
});
