import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
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

function runtimePackageFromInput(input) {
  const normalized = input.replaceAll("\\", "/");
  const pnpmMatch = normalized.match(
    /\/node_modules\/\.pnpm\/((?:@[^/+]+\+)?[^/@]+)@([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//u,
  );
  if (pnpmMatch !== null) {
    return { name: pnpmMatch[3], version: pnpmMatch[2].split("_")[0] };
  }
  const ordinaryMatch = normalized.match(
    /\/node_modules\/((?:@[^/]+\/)?[^/]+)\//u,
  );
  if (ordinaryMatch === null) return null;
  const expected = BUNDLED_RUNTIME_PACKAGES.get(ordinaryMatch[1]);
  return expected === undefined
    ? { name: ordinaryMatch[1], version: "unknown" }
    : { name: ordinaryMatch[1], version: expected };
}

function verifyRuntimeInventory(metafile) {
  const actual = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const dependency = runtimePackageFromInput(input);
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
    verifyRuntimeInventory(result.metafile);
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
