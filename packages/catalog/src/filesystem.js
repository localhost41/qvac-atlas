import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { buildCatalog } from "./catalog.js";

const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_REPORT_BYTES = 256 * 1024;

function safePath(root, candidate) {
  if (typeof candidate !== "string" || isAbsolute(candidate)) {
    throw new Error(
      "Catalog admission failed: report path must be repository-relative",
    );
  }
  const resolved = resolve(root, candidate);
  const fromRoot = relative(root, resolved);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(
      "Catalog admission failed: report path escapes repository root",
    );
  }
  return resolved;
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

async function readJson(root, path, label, maxBytes) {
  try {
    const lexicalPath = safePath(root, path);
    const [rootPath, fileInfo] = await Promise.all([
      realpath(root),
      lstat(lexicalPath),
    ]);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink())
      throw new Error("not a regular file");
    if (fileInfo.size > maxBytes) throw new Error("file exceeds size limit");
    const resolvedPath = await realpath(lexicalPath);
    if (!contained(rootPath, resolvedPath))
      throw new Error("real path escapes repository root");
    return JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch {
    throw new Error(
      `Catalog admission failed: ${label} is not a bounded regular JSON file`,
    );
  }
}

export async function readRegistryConfig({
  root,
  configPath = "registry/catalog.json",
}) {
  const config = await readJson(
    root,
    configPath,
    "registry configuration",
    MAX_CONFIG_BYTES,
  );
  if (config?.version !== 1 || !Array.isArray(config.sources)) {
    throw new Error(
      "Catalog admission failed: registry configuration is unsupported",
    );
  }
  const configKeys = Object.keys(config).sort();
  const expectedConfigKeys = [
    "fixtureProfiles",
    "productionProfiles",
    "sources",
    "version",
  ];
  if (JSON.stringify(configKeys) !== JSON.stringify(expectedConfigKeys)) {
    throw new Error(
      "Catalog admission failed: registry configuration has an unsupported field",
    );
  }
  return config;
}

function validateConfiguredPath(kind, path) {
  const fixturePath =
    path.startsWith("packages/schema/fixtures/") ||
    path.startsWith("reports/fixtures/");
  const genuinePath = /^reports\/v1\/sha256-[a-f0-9]{64}\.json$/.test(path);
  if (
    (kind === "fixture" && !fixturePath) ||
    (kind === "genuine" && !genuinePath)
  ) {
    throw new Error(
      "Catalog admission failed: report path is outside its trusted source area",
    );
  }
}

export async function buildCatalogFromFiles({ root, configPath }) {
  const config = await readRegistryConfig({
    root,
    configPath,
  });

  const sources = [];
  for (const metadata of [...config.sources].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const metadataKeys = Object.keys(metadata).sort();
    if (
      JSON.stringify(metadataKeys) !==
      JSON.stringify(["kind", "path", "sourceKey"])
    ) {
      throw new Error(
        "Catalog admission failed: source metadata has an unsupported field",
      );
    }
    validateConfiguredPath(metadata.kind, metadata.path);
    const report = await readJson(
      root,
      metadata.path,
      "report",
      MAX_REPORT_BYTES,
    );
    if (metadata.kind === "genuine") {
      const expectedPath = `reports/v1/${report.report_id?.replace(":", "-")}.json`;
      if (metadata.path !== expectedPath) {
        throw new Error(
          "Catalog admission failed: genuine report filename does not match report ID",
        );
      }
    }
    sources.push({
      kind: metadata.kind,
      path: metadata.path,
      report,
      sourceKey: metadata.sourceKey,
    });
  }

  return buildCatalog({
    fixtureProfiles: config.fixtureProfiles ?? [],
    productionProfiles: config.productionProfiles ?? [],
    sources,
  });
}
