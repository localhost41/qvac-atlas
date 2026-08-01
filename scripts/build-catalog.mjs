import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogFromFiles,
  serializeCatalog,
} from "../packages/catalog/src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "apps/site/src/generated/catalog.json");
const catalog = await buildCatalogFromFiles({
  root,
  configPath: "registry/catalog.json",
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, serializeCatalog(catalog), "utf8");
process.stdout.write(
  `Built deterministic catalog with ${catalog.reports.length} genuine report(s) and ${catalog.fixtures.length} fixture(s).\n`,
);
