import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { buildCatalogFromFiles, readRegistryConfig } from "./filesystem.js";
import { serializeCatalog } from "./catalog.js";

const REPORT_DIRECTORY = "reports/v1";
const REPORT_NAME = /^sha256-[a-f0-9]{64}\.json$/;
const MAX_REPORT_BYTES = 256 * 1024;
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;

function fail(message) {
  throw new Error(`Contribution audit failed: ${message}`);
}

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

async function checkedDirectory(root, path) {
  const lexical = resolve(root, path);
  const [rootPath, info] = await Promise.all([realpath(root), lstat(lexical)]);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail("reports/v1 must be a regular directory");
  const resolved = await realpath(lexical);
  if (!contained(rootPath, resolved)) fail("reports/v1 escapes the repository");
  return resolved;
}

async function checkedFile(rootPath, path, maxBytes, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    fail(`${label} must be a regular file`);
  if (info.size > maxBytes) fail(`${label} exceeds its size limit`);
  const resolved = await realpath(path);
  if (!contained(rootPath, resolved)) fail(`${label} escapes the repository`);
  return readFile(resolved, "utf8");
}

async function versionedReports(root) {
  const rootPath = await realpath(root);
  const directory = await checkedDirectory(root, REPORT_DIRECTORY);
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".gitkeep" && entry.isFile()) continue;
    if (!REPORT_NAME.test(entry.name))
      fail("reports/v1 contains a path outside the report naming contract");
    const reportPath = `${REPORT_DIRECTORY}/${entry.name}`;
    await checkedFile(
      rootPath,
      resolve(directory, entry.name),
      MAX_REPORT_BYTES,
      reportPath,
    );
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
  const rootPath = await realpath(root);
  const generated = await checkedFile(
    rootPath,
    resolve(root, generatedPath),
    MAX_CATALOG_BYTES,
    "generated catalog",
  );
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
