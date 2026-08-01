import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCatalogFromFiles, serializeCatalog } from "../src/index.js";

const repositoryRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);

async function fixture(name) {
  return readFile(
    new URL(`../../schema/fixtures/${name}`, import.meta.url),
    "utf8",
  );
}

function config(sourcePath = "reports/fixtures/success.json") {
  return {
    version: 1,
    productionProfiles: [],
    fixtureProfiles: [
      {
        id: "atlas-small-llm-lifecycle-test",
        version: "1.0.0",
        artifact_sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        requested_backend: "gpu",
        test_only: true,
      },
    ],
    sources: [
      { kind: "fixture", path: sourcePath, sourceKey: "fixture:success" },
    ],
  };
}

async function temporaryRegistry(sourcePath = "reports/fixtures/success.json") {
  const root = await mkdtemp(join(tmpdir(), "qvac-atlas-catalog-"));
  await mkdir(join(root, "registry"), { recursive: true });
  await mkdir(join(root, "reports", "fixtures"), { recursive: true });
  await writeFile(
    join(root, "registry", "catalog.json"),
    JSON.stringify(config(sourcePath)),
    "utf8",
  );
  return root;
}

test("the checked-in generated catalog is a deterministic rebuild", async () => {
  const rebuilt = await buildCatalogFromFiles({
    root: repositoryRoot,
    configPath: "registry/catalog.json",
  });
  const checkedIn = await readFile(
    join(repositoryRoot, "apps/site/src/generated/catalog.json"),
    "utf8",
  );
  assert.equal(serializeCatalog(rebuilt), checkedIn);
});

test("oversized JSON files fail before parsing", async () => {
  const root = await temporaryRegistry();
  await writeFile(
    join(root, "reports", "fixtures", "success.json"),
    "x".repeat(256 * 1024 + 1),
    "utf8",
  );

  await assert.rejects(
    buildCatalogFromFiles({ root, configPath: "registry/catalog.json" }),
    /report is not a bounded regular JSON file/,
  );
});

test(
  "report symlinks and real paths outside the repository fail admission",
  { skip: process.platform === "win32" },
  async () => {
    const outside = await mkdtemp(join(tmpdir(), "qvac-atlas-outside-"));
    await writeFile(
      join(outside, "success.json"),
      await fixture("success.json"),
      "utf8",
    );

    const directRoot = await temporaryRegistry();
    await symlink(
      join(outside, "success.json"),
      join(directRoot, "reports", "fixtures", "success.json"),
    );
    await assert.rejects(
      buildCatalogFromFiles({
        root: directRoot,
        configPath: "registry/catalog.json",
      }),
      /report is not a bounded regular JSON file/,
    );

    const parentRoot = await temporaryRegistry(
      "reports/fixtures/outside/success.json",
    );
    await symlink(
      outside,
      join(parentRoot, "reports", "fixtures", "outside"),
      "dir",
    );
    await assert.rejects(
      buildCatalogFromFiles({
        root: parentRoot,
        configPath: "registry/catalog.json",
      }),
      /report is not a bounded regular JSON file/,
    );
  },
);

test(
  "a symlinked registry configuration fails admission",
  { skip: process.platform === "win32" },
  async () => {
    const root = await temporaryRegistry();
    const external = join(
      await mkdtemp(join(tmpdir(), "qvac-atlas-config-")),
      "catalog.json",
    );
    await writeFile(external, JSON.stringify(config()), "utf8");
    const linkedConfig = join(root, "registry", "linked.json");
    await symlink(external, linkedConfig);

    await assert.rejects(
      buildCatalogFromFiles({ root, configPath: "registry/linked.json" }),
      /registry configuration is not a bounded regular JSON file/,
    );
  },
);

test("genuine report filenames must map exactly to their report IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "qvac-atlas-filename-"));
  const reportPath =
    "reports/v1/sha256-0000000000000000000000000000000000000000000000000000000000000000.json";
  await mkdir(join(root, "registry"), { recursive: true });
  await mkdir(join(root, "reports", "v1"), { recursive: true });
  await writeFile(
    join(root, reportPath),
    await fixture("success.json"),
    "utf8",
  );
  await writeFile(
    join(root, "registry", "catalog.json"),
    JSON.stringify({
      version: 1,
      productionProfiles: [],
      fixtureProfiles: [],
      sources: [{ kind: "genuine", path: reportPath, sourceKey: "review:one" }],
    }),
    "utf8",
  );

  await assert.rejects(
    buildCatalogFromFiles({ root, configPath: "registry/catalog.json" }),
    /genuine report filename does not match report ID/,
  );
});

test("trusted source paths reject ambiguous segments before filesystem access", async () => {
  const ambiguous = [
    "packages/schema/fixtures/../fixtures/success.json",
    "packages/schema/fixtures//success.json",
    "packages/schema/fixtures/./success.json",
    "packages\\schema\\fixtures\\success.json",
  ];
  for (const sourcePath of ambiguous) {
    const root = await temporaryRegistry(sourcePath);
    await assert.rejects(
      buildCatalogFromFiles({ root, configPath: "registry/catalog.json" }),
      /trusted source path|bounded regular JSON file/,
    );
  }
});

test("an unknown source kind is rejected before its path is read", async () => {
  const root = await temporaryRegistry();
  const invalid = config("private/report.json");
  invalid.sources[0].kind = "unknown";
  await writeFile(
    join(root, "registry", "catalog.json"),
    JSON.stringify(invalid),
    "utf8",
  );

  await assert.rejects(
    buildCatalogFromFiles({ root, configPath: "registry/catalog.json" }),
    /source kind is invalid/,
  );
});

test(
  "the canonical allowed fixture directory cannot itself be a symlink",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "qvac-atlas-area-link-"));
    const outside = await mkdtemp(join(tmpdir(), "qvac-atlas-area-outside-"));
    await mkdir(join(root, "registry"), { recursive: true });
    await mkdir(join(root, "reports"), { recursive: true });
    await writeFile(
      join(outside, "success.json"),
      await fixture("success.json"),
      "utf8",
    );
    await symlink(outside, join(root, "reports", "fixtures"), "dir");
    await writeFile(
      join(root, "registry", "catalog.json"),
      JSON.stringify(config()),
      "utf8",
    );

    await assert.rejects(
      buildCatalogFromFiles({ root, configPath: "registry/catalog.json" }),
      /report is not a bounded regular JSON file/,
    );
  },
);
