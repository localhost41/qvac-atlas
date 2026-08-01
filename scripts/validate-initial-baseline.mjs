#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function reject(code) {
  throw new Error(`Initial release baseline rejected: ${code}`);
}

export function validateInitialBaseline(registry, catalog) {
  if (
    registry === null ||
    typeof registry !== "object" ||
    Array.isArray(registry) ||
    !Array.isArray(registry.productionProfiles) ||
    !Array.isArray(registry.sources)
  ) {
    reject("registry-shape");
  }
  if (
    catalog === null ||
    typeof catalog !== "object" ||
    Array.isArray(catalog) ||
    !Array.isArray(catalog.reports) ||
    !Array.isArray(catalog.claims)
  ) {
    reject("catalog-shape");
  }
  if (registry.productionProfiles.length !== 0)
    reject("production-profiles-present");
  if (registry.sources.some((source) => source?.kind === "genuine"))
    reject("genuine-source-present");
  if (catalog.reports.length !== 0) reject("genuine-reports-present");
  if (catalog.claims.length !== 0) reject("production-claims-present");
  return Object.freeze({ fixtureOnly: true });
}

async function main() {
  const [registry, catalog] = await Promise.all([
    readFile(resolve(root, "registry/catalog.json"), "utf8").then(JSON.parse),
    readFile(
      resolve(root, "apps/site/src/generated/catalog.json"),
      "utf8",
    ).then(JSON.parse),
  ]);
  validateInitialBaseline(registry, catalog);
  process.stdout.write(
    "Initial release baseline is fixture-only: no production profiles, genuine sources/reports, or claims.\n",
  );
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedUrl) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Initial release baseline failed safely"}\n`,
    );
    process.exitCode = 1;
  }
}
