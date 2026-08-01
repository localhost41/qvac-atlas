import { readdir } from "node:fs/promises";
import { buildCatalogFromFiles, readRegistryConfig } from "./filesystem.js";
import { serializeCatalog } from "./catalog.js";
import { canonicalDirectory, readBoundedRegularFile } from "./secure-file.js";

const REPORT_DIRECTORY = "reports/v1";
const REPORT_NAME = /^sha256-[a-f0-9]{64}\.json$/;
const MAX_REPORT_BYTES = 256 * 1024;
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(`Contribution audit failed: ${message}`);
}

async function versionedReports(root) {
  const { directoryPath } = await canonicalDirectory({
    root,
    relativePath: REPORT_DIRECTORY,
    label: "reports/v1",
  });
  const paths = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    if (entry.name === ".gitkeep" && entry.isFile()) continue;
    if (!REPORT_NAME.test(entry.name))
      fail("reports/v1 contains a path outside the report naming contract");
    const reportPath = `${REPORT_DIRECTORY}/${entry.name}`;
    await readBoundedRegularFile({
      root,
      relativePath: reportPath,
      allowedDirectory: REPORT_DIRECTORY,
      maxBytes: MAX_REPORT_BYTES,
      label: reportPath,
    });
    paths.push(reportPath);
  }
  return paths.sort();
}

function ensureBidirectionalMapping(reportPaths, sources) {
  const genuinePaths = sources
    .filter(({ kind }) => kind === "genuine")
    .map(({ path }) => path);
  const counts = new Map();
  for (const path of genuinePaths)
    counts.set(path, (counts.get(path) ?? 0) + 1);

  for (const path of reportPaths) {
    const count = counts.get(path) ?? 0;
    if (count === 0)
      fail("a versioned report is not listed in trusted registry metadata");
    if (count !== 1)
      fail(
        "a versioned report is listed more than once in trusted registry metadata",
      );
  }
  const reportSet = new Set(reportPaths);
  for (const path of genuinePaths) {
    if (!reportSet.has(path))
      fail("a genuine registry source has no versioned report file");
  }
}

function ensureTracked(reportPaths, trackedPaths, untrackedPaths) {
  if (trackedPaths !== undefined) {
    for (const path of reportPaths) {
      if (!trackedPaths.has(path))
        fail("reports/v1 contains an untracked genuine report");
    }
  }
  if (
    untrackedPaths !== undefined &&
    untrackedPaths.some((path) => path.startsWith(`${REPORT_DIRECTORY}/`))
  ) {
    fail("reports/v1 contains an untracked path");
  }
}

/**
 * Repository-wide admission gate. It performs set reconciliation before asking
 * the catalog builder to validate and derive every trusted source.
 */
export async function auditContributions({
  root,
  configPath = "registry/catalog.json",
  generatedPath = "apps/site/src/generated/catalog.json",
  trackedPaths,
  untrackedPaths,
}) {
  const [config, reportPaths] = await Promise.all([
    readRegistryConfig({ root, configPath }),
    versionedReports(root),
  ]);
  ensureBidirectionalMapping(reportPaths, config.sources);
  ensureTracked(reportPaths, trackedPaths, untrackedPaths);

  const catalog = await buildCatalogFromFiles({ root, configPath });
  const generated = await readBoundedRegularFile({
    root,
    relativePath: generatedPath,
    allowedDirectory: "apps/site/src/generated",
    maxBytes: MAX_CATALOG_BYTES,
    label: "generated catalog",
  });
  if (generated !== serializeCatalog(catalog))
    fail(
      "deterministic catalog rebuild differs from the checked-in generated catalog",
    );

  return {
    fixtureReports: catalog.fixtures.length,
    genuineReports: reportPaths.length,
    claims: catalog.claims.length,
  };
}
