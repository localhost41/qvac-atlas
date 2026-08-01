import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const exactSdkManifest = {
  name: "@qvac/sdk",
  version: "0.16.0",
  type: "module",
  main: "./dist/index.js",
  exports: {
    ".": {
      import: "./dist/index.js",
      require: "./dist/index.js",
    },
    "./package": "./package.json",
  },
  license: "Apache-2.0",
};

export async function makeTemporaryDirectory(prefix = "qvac-resolver-test-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function createProject(options = {}) {
  const root = options.root ?? (await makeTemporaryDirectory());
  const declared = options.declared ?? true;
  const projectManifest = {
    name: "fixture-project",
    private: true,
    ...(declared ? { dependencies: { "@qvac/sdk": "0.16.0" } } : {}),
    ...options.projectManifest,
  };
  await writeJson(path.join(root, "package.json"), projectManifest);

  if (options.install === false) return { root, sdkRoot: undefined };

  let sdkRoot;
  if (options.layout === "pnpm") {
    sdkRoot = path.join(
      root,
      "node_modules",
      ".pnpm",
      "@qvac+sdk@0.16.0",
      "node_modules",
      "@qvac",
      "sdk",
    );
  } else {
    sdkRoot = path.join(root, "node_modules", "@qvac", "sdk");
  }

  await mkdir(path.join(sdkRoot, "dist"), { recursive: true });
  await writeJson(path.join(sdkRoot, "package.json"), {
    ...exactSdkManifest,
    ...options.sdkManifest,
  });
  await writeFile(
    path.join(sdkRoot, "dist", "index.js"),
    options.entrySource ?? "export const fixtureValue = 'accepted-exact-sdk'\n",
    "utf8",
  );

  if (options.layout === "pnpm") {
    const logicalParent = path.join(root, "node_modules", "@qvac");
    const logicalRoot = path.join(logicalParent, "sdk");
    await mkdir(logicalParent, { recursive: true });
    await symlink(path.relative(logicalParent, sdkRoot), logicalRoot, "dir");
  }

  return { root, sdkRoot };
}

export async function removeTemporaryDirectory(directory) {
  await rm(directory, { recursive: true, force: true });
}
