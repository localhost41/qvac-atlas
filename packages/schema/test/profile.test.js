import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { standardProfiles } from "./helpers.js";

test("the test-only workload descriptor follows the normative profile schema", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../../../profiles/profile.schema.json", import.meta.url), "utf8"),
  );
  const ajv = new Ajv2020({ strict: true });
  const validate = ajv.compile(schema);
  const [profile] = await standardProfiles();
  assert.equal(validate(profile), true, JSON.stringify(validate.errors));
  assert.equal(profile.test_only, true);
});
