import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { canonicalize } from "../src/canonicalize.js";

const schemaUrl = new URL("../schemas/report.schema.json", import.meta.url);
const declarationUrl = new URL("../src/generated/report.d.ts", import.meta.url);

function schemaDigest(schema) {
  return createHash("sha256")
    .update(canonicalize(schema), "utf8")
    .digest("hex");
}

function bannerComment(schema) {
  return `/**
 * Generated from schemas/report.schema.json. Do not edit by hand.
 * Normative schema SHA-256: ${schemaDigest(schema)}
 * JSON Schema validation remains the runtime authority.
 */`;
}

function typeProjection(schema) {
  const projected = structuredClone(schema);
  projected.title = "AtlasReport";

  // json-schema-to-typescript renders conditional allOf branches as open index
  // signatures. The base properties remain derived here; the conditionals are
  // enforced by the unchanged runtime schema and semantic validator.
  delete projected.$defs.provenance.allOf;
  delete projected.$defs.backendObservation.allOf;
  return projected;
}

export async function generateReportTypes(schema) {
  return compile(typeProjection(schema), "AtlasReport", {
    bannerComment: bannerComment(schema),
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    ignoreMinAndMaxItems: true,
    unknownAny: false,
    unreachableDefinitions: false,
    style: {
      printWidth: 100,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "all",
    },
  });
}

export async function assertReportTypesCurrent(schema, checkedIn) {
  const generated = await generateReportTypes(schema);
  if (generated !== checkedIn) {
    throw new Error(
      "generated report type drift; run pnpm --filter @qvac-atlas/schema generate:types",
    );
  }
}

async function main(argument) {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const generated = await generateReportTypes(schema);
  if (argument === "--write") {
    await writeFile(declarationUrl, generated, "utf8");
    return;
  }
  if (argument === "--check") {
    const checkedIn = await readFile(declarationUrl, "utf8");
    await assertReportTypesCurrent(schema, checkedIn);
    return;
  }
  throw new Error("expected --write or --check");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv[2]);
}
