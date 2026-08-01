import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BUNDLE_FILENAMES,
  PACKAGE_FILENAME,
  PACKAGE_FILES,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  SCHEMA_FILENAMES,
} from "../packages/cli/scripts/package-policy.mjs";
import { auditPackage } from "./package-audit-lib.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliRoot = path.join(repositoryRoot, "packages", "cli");
const schemaRoot = path.join(repositoryRoot, "packages", "schema", "schemas");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function outputDirectory(args) {
  if (args.length === 0) return path.join(repositoryRoot, ".artifacts");
  if (
    args.length !== 2 ||
    args[0] !== "--output" ||
    args[1].length === 0 ||
    /[\x00-\x1f\x7f-\x9f]/u.test(args[1])
  ) {
    throw new Error("Usage: pnpm package:local -- [--output <directory>]");
  }
  return path.resolve(args[1]);
}

async function copyReleaseFiles(stagingRoot) {
  await mkdir(path.join(stagingRoot, "bundle"), {
    recursive: true,
    mode: 0o755,
  });
  await mkdir(path.join(stagingRoot, "schemas"), {
    recursive: true,
    mode: 0o755,
  });
  for (const filename of BUNDLE_FILENAMES) {
    const destination = path.join(stagingRoot, "bundle", filename);
    await copyFile(path.join(cliRoot, "bundle", filename), destination);
    await chmod(destination, filename === "bin.js" ? 0o755 : 0o644);
  }
  for (const filename of SCHEMA_FILENAMES) {
    const destination = path.join(stagingRoot, "schemas", filename);
    await copyFile(path.join(schemaRoot, filename), destination);
    await chmod(destination, 0o644);
  }
  for (const filename of ["README.md", "NOTICE"]) {
    const destination = path.join(stagingRoot, filename);
    await copyFile(path.join(cliRoot, filename), destination);
    await chmod(destination, 0o644);
  }
}

async function releaseManifest() {
  const source = JSON.parse(
    await readFile(path.join(cliRoot, "package.json"), "utf8"),
  );
  if (
    source.name !== PACKAGE_NAME ||
    source.version !== PACKAGE_VERSION ||
    source.private !== undefined ||
    source.license !== "UNLICENSED" ||
    source.dependencies !== undefined ||
    JSON.stringify(source.bin) !==
      JSON.stringify({ "qvac-atlas": "./bundle/bin.js" }) ||
    JSON.stringify(source.files) !== JSON.stringify(PACKAGE_FILES) ||
    JSON.stringify(source.engines) !== JSON.stringify({ node: ">=22 <23" })
  ) {
    throw new Error(
      "CLI release-candidate manifest does not match package policy",
    );
  }
  return {
    name: source.name,
    version: source.version,
    description: source.description,
    type: source.type,
    license: source.license,
    bin: source.bin,
    files: source.files,
    engines: source.engines,
  };
}

async function existingArtifactBytes(destination) {
  try {
    const information = await lstat(destination);
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new Error(
        "Package destination is occupied by a non-regular artifact",
      );
    }
    return await readFile(destination);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function auditAndPublishPackage(
  source,
  destination,
  audit = auditPackage,
) {
  const result = await audit(source);
  const candidate = await readFile(source);
  const existing = await existingArtifactBytes(destination);
  if (existing !== null) {
    if (!existing.equals(candidate)) {
      throw new Error(
        "Package destination already contains different bytes; preserved it unchanged",
      );
    }
    return { ...result, reused: true };
  }

  const staging = path.join(
    path.dirname(destination),
    `.atlas-package-publish-${randomUUID()}`,
  );
  let handle;
  try {
    handle = await open(staging, "wx", 0o644);
    await handle.writeFile(candidate);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(staging, destination);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        "Package destination became occupied; preserved the existing artifact",
      );
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(staging).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
  return { ...result, reused: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const outputRoot = outputDirectory(args);
  await mkdir(outputRoot, { recursive: true, mode: 0o755 });
  await execFileAsync(pnpm, ["--filter", PACKAGE_NAME, "build:bundle"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const stagingRoot = await mkdtemp(path.join(tmpdir(), "qvac-atlas-package-"));
  try {
    const packageRoot = path.join(stagingRoot, "source");
    const packedRoot = path.join(stagingRoot, "packed");
    await mkdir(packageRoot, { recursive: true, mode: 0o755 });
    await mkdir(packedRoot, { recursive: true, mode: 0o755 });
    await copyReleaseFiles(packageRoot);
    await writeFile(
      path.join(packageRoot, "package.json"),
      `${JSON.stringify(await releaseManifest(), null, 2)}\n`,
      { encoding: "utf8", mode: 0o644 },
    );
    const artifact = path.join(outputRoot, PACKAGE_FILENAME);
    const { stdout } = await execFileAsync(
      pnpm,
      ["pack", "--json", "--pack-destination", packedRoot],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_audit: "false",
          npm_config_fund: "false",
          npm_config_offline: "true",
          npm_config_registry: "http://127.0.0.1:9/",
          npm_config_update_notifier: "false",
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const packed = JSON.parse(stdout);
    if (
      packed?.name !== PACKAGE_NAME ||
      packed?.version !== PACKAGE_VERSION ||
      path.basename(packed?.filename ?? "") !== PACKAGE_FILENAME
    ) {
      throw new Error("pnpm produced unexpected package metadata");
    }
    const result = await auditAndPublishPackage(
      path.join(packedRoot, PACKAGE_FILENAME),
      artifact,
    );
    process.stdout.write(
      `Local package ${result.reused ? "already matched" : "written to"} ${artifact}\nsha256:${result.sha256}\n`,
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedUrl) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Local package construction failed safely"}\n`,
    );
    process.exitCode = 1;
  }
}
