import { buildCatalog } from "./catalog.js";
import {
  assertCanonicalRepositoryPath,
  readBoundedRegularFile,
} from "./secure-file.js";

const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_REPORT_BYTES = 256 * 1024;

async function readJson(root, path, label, maxBytes, allowedDirectory) {
  try {
    return JSON.parse(
      await readBoundedRegularFile({
        root,
        relativePath: path,
        allowedDirectory,
        maxBytes,
        label,
      }),
    );
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
    "registry",
  );
  if (config?.version !== 2 || !Array.isArray(config.sources)) {
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
  if (!["fixture", "genuine"].includes(kind)) {
    throw new Error("Catalog admission failed: source kind is invalid");
  }
  assertCanonicalRepositoryPath(path, "trusted source path");
  const fixtureDirectory = [
    "packages/schema/fixtures",
    "reports/fixtures",
  ].find((directory) => path.startsWith(`${directory}/`));
  const fixturePath = fixtureDirectory !== undefined && path.endsWith(".json");
  const genuinePath = /^reports\/v1\/sha256-[a-f0-9]{64}\.json$/.test(path);
  if (
    (kind === "fixture" && !fixturePath) ||
    (kind === "genuine" && !genuinePath)
  ) {
    throw new Error(
      "Catalog admission failed: report path is outside its trusted source area",
    );
  }
  return kind === "genuine" ? "reports/v1" : fixtureDirectory;
}

export async function buildCatalogFromFiles({ root, configPath }) {
  const config = await readRegistryConfig({
    root,
    configPath,
  });

  const sources = [];
  const metadataSources = config.sources.map((metadata) => {
    if (
      metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      throw new Error(
        "Catalog admission failed: source metadata must be an object",
      );
    }
    const metadataKeys = Object.keys(metadata).sort();
    const expectedKeys =
      metadata.kind === "genuine"
        ? ["kind", "lifecycle", "path", "sourceKey"]
        : ["kind", "path", "sourceKey"];
    if (JSON.stringify(metadataKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(
        "Catalog admission failed: source metadata has an unsupported field",
      );
    }
    const allowedDirectory = validateConfiguredPath(
      metadata.kind,
      metadata.path,
    );
    return { ...metadata, allowedDirectory };
  });
  for (const metadata of metadataSources.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    const report = await readJson(
      root,
      metadata.path,
      "report",
      MAX_REPORT_BYTES,
      metadata.allowedDirectory,
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
      ...(metadata.kind === "genuine" ? { lifecycle: metadata.lifecycle } : {}),
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
