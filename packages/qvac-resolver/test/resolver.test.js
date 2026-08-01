import assert from "node:assert/strict";
import { access, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  resolveProjectLocalSdk,
  SUPPORTED_NODE_MAJOR,
  SUPPORTED_SDK_VERSION,
} from "../dist/index.js";
import { internalGetSdkBootstrapMaterial } from "../dist/internal.js";
import {
  createProject,
  exactSdkManifest,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  writeJson,
} from "./helpers.js";

test("pins the supported runtime and SDK contract", () => {
  assert.equal(SUPPORTED_NODE_MAJOR, 22);
  assert.equal(SUPPORTED_SDK_VERSION, "0.16.0");
  assert.equal(Number.parseInt(process.versions.node.split(".")[0], 10), 22);
});

test("resolves an exact physical npm installation", async (t) => {
  const { root, sdkRoot } = await createProject();
  t.after(() => removeTemporaryDirectory(root));

  const resolution = await resolveProjectLocalSdk(root);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.code, "qvac-sdk-resolved");
  assert.equal(resolution.sdkVersion, "0.16.0");
  assert.deepEqual(Object.keys(resolution.handle), []);
  assert.equal(JSON.stringify(resolution.handle), undefined);
  assert.equal(
    JSON.stringify(resolution),
    '{"status":"resolved","code":"qvac-sdk-resolved","sdkVersion":"0.16.0"}',
  );

  const internal = internalGetSdkBootstrapMaterial(resolution.handle);
  assert.equal(internal.sdkRoot, await realpath(sdkRoot));
  assert.equal(
    internal.entryPath,
    await realpath(path.join(sdkRoot, "dist", "index.js")),
  );
});

test("resolves a contained physical pnpm installation", async (t) => {
  const { root, sdkRoot } = await createProject({ layout: "pnpm" });
  t.after(() => removeTemporaryDirectory(root));

  const resolution = await resolveProjectLocalSdk(root);
  assert.equal(resolution.status, "resolved");
  assert.equal(
    internalGetSdkBootstrapMaterial(resolution.handle).sdkRoot,
    await realpath(sdkRoot),
  );
});

test("does not use undeclared, ancestor, NODE_PATH, or PnP-only packages", async (t) => {
  const undeclared = await createProject({ declared: false });
  const ancestor = await createProject();
  const nested = path.join(ancestor.root, "nested");
  await createProject({ root: nested, install: false });
  const nodePathProject = await createProject({ install: false });
  const externalNodePath = await createProject();
  const pnp = await createProject({ install: false });
  await writeFile(
    path.join(pnp.root, ".pnp.cjs"),
    "module.exports = {}\n",
    "utf8",
  );
  t.after(async () => {
    await Promise.all(
      [
        undeclared.root,
        ancestor.root,
        nodePathProject.root,
        externalNodePath.root,
        pnp.root,
      ].map(removeTemporaryDirectory),
    );
  });

  const previousNodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = path.join(externalNodePath.root, "node_modules");
  try {
    assert.equal(
      (await resolveProjectLocalSdk(undeclared.root)).code,
      "qvac-sdk-absent",
    );
    assert.equal(
      (await resolveProjectLocalSdk(nested)).code,
      "qvac-sdk-absent",
    );
    assert.equal(
      (await resolveProjectLocalSdk(nodePathProject.root)).code,
      "qvac-sdk-absent",
    );
    assert.equal(
      (await resolveProjectLocalSdk(pnp.root)).code,
      "qvac-sdk-unsafe-or-invalid",
    );
  } finally {
    if (previousNodePath === undefined) delete process.env.NODE_PATH;
    else process.env.NODE_PATH = previousNodePath;
  }
});

test("fails closed for malformed and oversized project manifests", async (t) => {
  const malformed = await makeTemporaryDirectory();
  const oversized = await makeTemporaryDirectory();
  await writeFile(path.join(malformed, "package.json"), "{not-json", "utf8");
  await writeFile(
    path.join(oversized, "package.json"),
    `{"padding":"${"x".repeat(1024 * 1024)}"}`,
    "utf8",
  );
  t.after(() =>
    Promise.all([malformed, oversized].map(removeTemporaryDirectory)),
  );

  assert.equal(
    (await resolveProjectLocalSdk(malformed)).code,
    "qvac-sdk-unsafe-or-invalid",
  );
  assert.equal(
    (await resolveProjectLocalSdk(oversized)).code,
    "qvac-sdk-unsafe-or-invalid",
  );
});

test("fails closed for malformed, oversized, or fingerprint-mismatched SDK manifests", async (t) => {
  const malformed = await createProject();
  const oversized = await createProject();
  const wrongName = await createProject({
    sdkManifest: { name: "@qvac/not-sdk" },
  });
  const wrongExport = await createProject({
    sdkManifest: {
      exports: {
        ...exactSdkManifest.exports,
        ".": { import: "./other.js", require: "./dist/index.js" },
      },
    },
  });
  await writeFile(path.join(malformed.sdkRoot, "package.json"), "[]", "utf8");
  await writeFile(
    path.join(oversized.sdkRoot, "package.json"),
    `{"padding":"${"x".repeat(1024 * 1024)}"}`,
    "utf8",
  );
  t.after(() =>
    Promise.all(
      [malformed.root, oversized.root, wrongName.root, wrongExport.root].map(
        removeTemporaryDirectory,
      ),
    ),
  );

  for (const fixture of [malformed, oversized, wrongName, wrongExport]) {
    assert.equal(
      (await resolveProjectLocalSdk(fixture.root)).code,
      "qvac-sdk-unsafe-or-invalid",
    );
  }
});

test("reports a stable unsupported result without importing a different SDK version", async (t) => {
  const markerRoot = await makeTemporaryDirectory("qvac-resolver-marker-");
  const marker = path.join(markerRoot, "imported");
  const fixture = await createProject({
    sdkManifest: { version: "0.17.0" },
    entrySource: `await import('node:fs/promises').then(fs => fs.writeFile(${JSON.stringify(marker)}, 'bad'))\n`,
  });
  t.after(() =>
    Promise.all([markerRoot, fixture.root].map(removeTemporaryDirectory)),
  );

  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.deepEqual(resolution, {
    status: "unsupported",
    code: "qvac-sdk-version-unsupported",
    sdkVersion: "0.17.0",
  });
  await assert.rejects(() => access(marker), { code: "ENOENT" });
});

test("rejects external package links and entry-point escapes", async (t) => {
  const externalPackageProject = await createProject({ install: false });
  const externalPackage = await makeTemporaryDirectory(
    "qvac-resolver-external-sdk-",
  );
  await mkdir(path.join(externalPackage, "dist"), { recursive: true });
  await writeJson(path.join(externalPackage, "package.json"), exactSdkManifest);
  await writeFile(
    path.join(externalPackage, "dist", "index.js"),
    "export {}\n",
    "utf8",
  );
  const logicalParent = path.join(
    externalPackageProject.root,
    "node_modules",
    "@qvac",
  );
  await mkdir(logicalParent, { recursive: true });
  await symlink(externalPackage, path.join(logicalParent, "sdk"), "dir");

  const escapingEntry = await createProject();
  const externalEntry = path.join(
    await makeTemporaryDirectory("qvac-resolver-external-entry-"),
    "index.js",
  );
  await writeFile(externalEntry, "export {}\n", "utf8");
  await writeFile(
    path.join(escapingEntry.sdkRoot, "dist", "placeholder"),
    "x",
    "utf8",
  );
  await import("node:fs/promises").then((fs) =>
    fs.rm(path.join(escapingEntry.sdkRoot, "dist", "index.js")),
  );
  await symlink(
    externalEntry,
    path.join(escapingEntry.sdkRoot, "dist", "index.js"),
    "file",
  );

  const externalEntryRoot = path.dirname(externalEntry);
  t.after(() =>
    Promise.all(
      [
        externalPackageProject.root,
        externalPackage,
        escapingEntry.root,
        externalEntryRoot,
      ].map(removeTemporaryDirectory),
    ),
  );

  assert.equal(
    (await resolveProjectLocalSdk(externalPackageProject.root)).code,
    "qvac-sdk-unsafe-or-invalid",
  );
  assert.equal(
    (await resolveProjectLocalSdk(escapingEntry.root)).code,
    "qvac-sdk-unsafe-or-invalid",
  );
});

test("stable public outcomes and errors never serialize filesystem paths", async (t) => {
  const fixture = await createProject({ sdkManifest: { exports: {} } });
  t.after(() => removeTemporaryDirectory(fixture.root));

  const resolution = await resolveProjectLocalSdk(fixture.root);
  const serialized = JSON.stringify(resolution);
  assert.equal(serialized.includes(fixture.root), false);
  assert.equal(serialized.includes("node_modules"), false);
  assert.deepEqual(resolution, {
    status: "unsafe-or-invalid",
    code: "qvac-sdk-unsafe-or-invalid",
  });
});
