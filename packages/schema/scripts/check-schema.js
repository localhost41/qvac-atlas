import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
for (const name of ["report", "claim"]) {
  const schema = JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"));
  ajv.compile(schema);
}
console.log("Atlas schemas compile under strict JSON Schema 2020-12 validation.");
