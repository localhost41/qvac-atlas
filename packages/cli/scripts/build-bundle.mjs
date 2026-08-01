import { chmod, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import {
  BUNDLED_RUNTIME_PACKAGES,
  BUNDLE_FILENAMES,
} from "./package-policy.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(packageRoot, "../..");
const bundleRoot = path.join(packageRoot, "bundle");
const entryPoints = {
  bin: path.join(packageRoot, "src/bin.ts"),
  "child-runner": path.join(
    repositoryRoot,
    "packages/qvac-executor/src/child-runner.ts",
  ),
  "acquisition-child": path.join(
    repositoryRoot,
    "packages/model-artifact/src/acquisition-child.ts",
  ),
  "recovery-child": path.join(
    repositoryRoot,
    "packages/model-artifact/src/recovery-child.ts",
  ),
};

async function runtimePackageFromInput(input) {
  const normalized = input.replaceAll("\\", "/");
  const marker = "node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const packageSegments = normalized
    .slice(markerIndex + marker.length)
    .split("/");
  const name = packageSegments[0]?.startsWith("@")
    ? packageSegments.slice(0, 2).join("/")
    : packageSegments[0];
  if (name === undefined || name.length === 0) return null;
  const packageRoot = normalized.slice(
    0,
    markerIndex + marker.length + name.length,
  );
  const manifest = JSON.parse(
    await readFile(
      path.resolve(repositoryRoot, packageRoot, "package.json"),
      "utf8",
    ),
  );
  if (manifest.name !== name || typeof manifest.version !== "string") {
    throw new Error(`Bundled package manifest is invalid: ${name}`);
  }
  return { name: manifest.name, version: manifest.version };
}

async function verifyRuntimeInventory(metafile) {
  const actual = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const dependency = await runtimePackageFromInput(input);
    if (dependency !== null) actual.set(dependency.name, dependency.version);
  }
  const orderedActual = [...actual].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const orderedExpected = [...BUNDLED_RUNTIME_PACKAGES].sort(
    ([left], [right]) => left.localeCompare(right),
  );
  if (JSON.stringify(orderedActual) !== JSON.stringify(orderedExpected)) {
    throw new Error(
      `Bundled runtime dependency inventory drifted: ${JSON.stringify(orderedActual)}`,
    );
  }
}

async function main() {
  const stagingRoot = await mkdtemp(path.join(packageRoot, ".atlas-bundle-"));
  try {
    await mkdir(stagingRoot, { recursive: true, mode: 0o755 });
    const result = await build({
      absWorkingDir: repositoryRoot,
      bundle: true,
      charset: "utf8",
      entryNames: "[name]",
      entryPoints,
      format: "esm",
      legalComments: "none",
      logLevel: "silent",
      metafile: true,
      outdir: stagingRoot,
      platform: "node",
      sourcemap: false,
      splitting: false,
      target: "node22",
      treeShaking: true,
    });
    await verifyRuntimeInventory(result.metafile);
    for (const output of Object.values(result.metafile.outputs)) {
      for (const imported of output.imports) {
        if (imported.external && !imported.path.startsWith("node:")) {
          throw new Error(`Unbundled runtime import: ${imported.path}`);
        }
      }
    }
    await chmod(path.join(stagingRoot, "bin.js"), 0o755);
    for (const filename of BUNDLE_FILENAMES.filter(
      (filename) => filename !== "bin.js",
    )) {
      await chmod(path.join(stagingRoot, filename), 0o644);
    }
    await rm(bundleRoot, { recursive: true, force: true });
    await rename(stagingRoot, bundleRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(
    "Built four self-contained QVAC Atlas runtime entries with an audited dependency inventory.\n",
  );
}

await main();
