import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  BUNDLED_RUNTIME_PACKAGES,
  BUNDLE_FILENAMES,
  PACKAGE_FILES,
  PACKAGE_FILENAME,
  PACKAGE_BUGS,
  PACKAGE_HOMEPAGE,
  PACKAGE_KEYWORDS,
  PACKAGE_NAME,
  PACKAGE_REPOSITORY,
  PACKAGE_VERSION,
  SCHEMA_FILENAMES,
} from "../packages/cli/scripts/package-policy.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const expectedEntries = [
  "package/LICENSE",
  "package/NOTICE",
  "package/README.md",
  ...BUNDLE_FILENAMES.map((filename) => `package/bundle/${filename}`),
  "package/package.json",
  ...SCHEMA_FILENAMES.map((filename) => `package/schemas/${filename}`),
].sort();

function fail(message) {
  throw new Error(`Package audit failed: ${message}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function extractedFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    const information = await lstat(path.join(root, child));
    if (information.isSymbolicLink())
      fail(`symbolic link in artifact: ${child}`);
    if (information.isDirectory()) {
      files.push(...(await extractedFiles(root, child)));
      continue;
    }
    if (!information.isFile()) fail(`non-regular artifact entry: ${child}`);
    files.push(child.replaceAll(path.sep, "/"));
  }
  return files;
}

export async function auditPackage(tarball, options = {}) {
  const absoluteTarball = path.resolve(tarball);
  if (path.basename(absoluteTarball) !== PACKAGE_FILENAME) {
    fail(`unexpected artifact filename: ${path.basename(absoluteTarball)}`);
  }
  const tarballInfo = await stat(absoluteTarball);
  if (!tarballInfo.isFile() || tarballInfo.size === 0) {
    fail("artifact is not a nonempty regular file");
  }
  if (tarballInfo.size > 8 * 1024 * 1024) {
    fail("artifact exceeds the 8 MiB distribution cap");
  }

  const { stdout: listing } = await execFileAsync(
    "tar",
    ["-tzf", absoluteTarball],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  const listed = listing
    .split("\n")
    .filter((entry) => entry.length > 0 && !entry.endsWith("/"))
    .sort();
  if (!sameJson(listed, expectedEntries)) {
    fail(`content allowlist drifted: ${JSON.stringify(listed)}`);
  }

  const extractionRoot = await mkdtemp(
    path.join(tmpdir(), "qvac-atlas-package-audit-"),
  );
  try {
    await execFileAsync(
      "tar",
      ["-xzf", absoluteTarball, "-C", extractionRoot],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    const files = (await extractedFiles(extractionRoot)).sort();
    if (!sameJson(files, expectedEntries)) {
      fail(`extracted content drifted: ${JSON.stringify(files)}`);
    }

    const packageRoot = path.join(extractionRoot, "package");
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    );
    if (
      manifest.name !== PACKAGE_NAME ||
      manifest.version !== PACKAGE_VERSION
    ) {
      fail("name or version drifted");
    }
    if (manifest.private !== undefined || manifest.license !== "Apache-2.0") {
      fail("publication license metadata drifted");
    }
    if (
      manifest.homepage !== PACKAGE_HOMEPAGE ||
      !sameJson(manifest.repository, PACKAGE_REPOSITORY) ||
      !sameJson(manifest.bugs, PACKAGE_BUGS) ||
      !sameJson(manifest.keywords, PACKAGE_KEYWORDS) ||
      !sameJson(manifest.bin, { "qvac-atlas": "./bundle/bin.js" }) ||
      !sameJson(manifest.files, PACKAGE_FILES) ||
      !sameJson(manifest.engines, { node: ">=22 <23" })
    ) {
      fail("repository, bin, files, or Node contract drifted");
    }
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "bundledDependencies",
      "bundleDependencies",
      "devDependencies",
      "scripts",
    ]) {
      if (manifest[field] !== undefined)
        fail(`forbidden manifest field: ${field}`);
    }

    const notice = await readFile(path.join(packageRoot, "NOTICE"), "utf8");
    for (const [name, version] of BUNDLED_RUNTIME_PACKAGES) {
      if (!notice.includes(`${name}@${version}`)) {
        fail(`NOTICE omits bundled dependency ${name}@${version}`);
      }
    }
    for (const requiredLicense of [
      "Copyright (c) 2015-2021 Evgeny Poberezkin",
      "Copyright (c) 2020 Evgeny Poberezkin",
      "Copyright (c) 2017 Evgeny Poberezkin",
      "Copyright (c) 2011-2021, Gary Court",
      "Copyright (c) 2021-present The Fastify team",
    ]) {
      if (!notice.includes(requiredLicense)) {
        fail(`NOTICE omits required license notice: ${requiredLicense}`);
      }
    }

    const sourceLocations = [repositoryRoot, homedir()].filter(
      (value, index, values) =>
        value.length > 1 && values.indexOf(value) === index,
    );
    for (const entry of expectedEntries) {
      const value = await readFile(path.join(extractionRoot, entry), "utf8");
      for (const forbidden of [
        "workspace:",
        "link:../",
        ...sourceLocations,
        ...(options.forbiddenValues ?? []),
      ]) {
        if (value.includes(forbidden)) {
          fail(
            `artifact embeds a workspace or local source location in ${entry}`,
          );
        }
      }
      if (
        entry.startsWith("package/bundle/") &&
        /(?:from|import\()\s*["']@qvac-atlas\//u.test(value)
      ) {
        fail(`bundle retains an internal workspace import in ${entry}`);
      }
    }

    const binPath = path.join(packageRoot, "bundle", "bin.js");
    const bin = await readFile(binPath, "utf8");
    if (!bin.startsWith("#!/usr/bin/env node\n")) {
      fail("CLI bundle lost its Node shebang");
    }
    const binMode = (await stat(binPath)).mode & 0o777;
    if ((binMode & 0o111) === 0 || (binMode & 0o022) !== 0) {
      fail(`CLI mode is not executable and non-writable-by-others: ${binMode}`);
    }
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }

  const sha256 = createHash("sha256")
    .update(await readFile(absoluteTarball))
    .digest("hex");
  return Object.freeze({
    filename: PACKAGE_FILENAME,
    byteLength: tarballInfo.size,
    sha256,
  });
}
