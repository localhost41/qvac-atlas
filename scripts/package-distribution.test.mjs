import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  BUNDLED_RUNTIME_PACKAGES,
  PACKAGE_FILENAME,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from "../packages/cli/scripts/package-policy.mjs";
import { auditPackage } from "./package-audit-lib.mjs";
import { auditAndPublishPackage } from "./package-local.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

async function absent(target) {
  try {
    await access(target);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

test("bundled runtime dependencies have exact lockfile-backed notices", async () => {
  const [lockfile, notice, schemaManifest] = await Promise.all([
    readFile(path.join(repositoryRoot, "pnpm-lock.yaml"), "utf8"),
    readFile(path.join(repositoryRoot, "packages/cli/NOTICE"), "utf8"),
    readFile(
      path.join(repositoryRoot, "packages/schema/package.json"),
      "utf8",
    ).then(JSON.parse),
  ]);
  const noticeInventory = [
    ...notice.matchAll(/^- ([^@\s]+)@([^\s]+) \(/gmu),
  ].map((match) => [match[1], match[2]]);
  assert.deepEqual(noticeInventory, [...BUNDLED_RUNTIME_PACKAGES]);
  for (const [name, version] of BUNDLED_RUNTIME_PACKAGES) {
    assert.match(
      lockfile,
      new RegExp(
        `^  ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:$`,
        "mu",
      ),
      `${name}@${version}`,
    );
  }
  assert.equal(schemaManifest.dependencies.ajv, "8.18.0");
  assert.equal(schemaManifest.dependencies["ajv-formats"], "3.0.1");
});

test("package publication preserves trusted destinations and rejects failed audits", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "qvac-atlas-publication-"));
  try {
    const source = path.join(root, "candidate.tgz");
    const destination = path.join(root, PACKAGE_FILENAME);
    const trusted = Buffer.from("trusted-artifact", "utf8");
    await writeFile(source, "candidate-artifact");
    await writeFile(destination, trusted);

    await assert.rejects(
      auditAndPublishPackage(source, destination, async () => {
        throw new Error("audit rejected candidate");
      }),
      /audit rejected candidate/u,
    );
    assert.deepEqual(await readFile(destination), trusted);

    const accepted = async () => ({
      filename: PACKAGE_FILENAME,
      byteLength: 18,
      sha256: "a".repeat(64),
    });
    await assert.rejects(
      auditAndPublishPackage(source, destination, accepted),
      /different bytes/u,
    );
    assert.deepEqual(await readFile(destination), trusted);

    await rm(destination);
    assert.equal(
      (await auditAndPublishPackage(source, destination, accepted)).reused,
      false,
    );
    assert.equal(
      (await auditAndPublishPackage(source, destination, accepted)).reused,
      true,
    );
    assert.equal(
      (await readdir(root)).some((name) =>
        name.startsWith(".atlas-package-publish-"),
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "local artifact is deterministic and installs offline outside the workspace",
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "qvac-atlas-distribution-"));
    const buildSecretCanary =
      "atlas_package_secret_canary_4fcd0898c1a74373b635f416";
    try {
      const firstOutput = path.join(root, "first");
      const secondOutput = path.join(root, "second");
      for (const output of [firstOutput, secondOutput]) {
        await execFileAsync(
          process.execPath,
          [
            path.join(repositoryRoot, "scripts/package-local.mjs"),
            "--output",
            output,
          ],
          {
            cwd: repositoryRoot,
            encoding: "utf8",
            env: {
              ...process.env,
              QVAC_ATLAS_PACKAGE_SECRET_CANARY: buildSecretCanary,
            },
            maxBuffer: 10 * 1024 * 1024,
          },
        );
      }
      const firstArtifact = path.join(firstOutput, PACKAGE_FILENAME);
      const secondArtifact = path.join(secondOutput, PACKAGE_FILENAME);
      assert.deepEqual(
        await readFile(firstArtifact),
        await readFile(secondArtifact),
      );
      const audit = await auditPackage(firstArtifact, {
        forbiddenValues: [buildSecretCanary],
      });
      assert.equal(audit.filename, PACKAGE_FILENAME);
      assert.match(audit.sha256, /^[0-9a-f]{64}$/u);

      const installRoot = path.join(root, "fresh-project");
      const npmCache = path.join(root, "npm-cache");
      const globalModules = path.join(root, "global", "node_modules");
      const marker = path.join(root, "global-qvac-was-loaded");
      await mkdir(installRoot, { recursive: true });
      await mkdir(npmCache, { recursive: true });
      for (const packageName of ["sdk", "cli"]) {
        const packageRoot = path.join(globalModules, "@qvac", packageName);
        await mkdir(packageRoot, { recursive: true });
        await writeFile(
          path.join(packageRoot, "package.json"),
          `${JSON.stringify({
            name: `@qvac/${packageName}`,
            version: packageName === "sdk" ? "0.16.0" : "0.9.0",
            type: "module",
            main: "./index.js",
          })}\n`,
        );
        await writeFile(
          path.join(packageRoot, "index.js"),
          `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "loaded"); throw new Error("global-qvac-canary");\n`,
        );
      }
      await writeFile(
        path.join(installRoot, "package.json"),
        `${JSON.stringify({ name: "outside-atlas-workspace", private: true })}\n`,
      );
      await writeFile(
        path.join(installRoot, ".qvac-atlas.json"),
        `${JSON.stringify({ realModeEnabled: true, yes: true })}\n`,
      );

      const install = spawnSync(
        npm,
        [
          "install",
          "--offline",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          firstArtifact,
        ],
        {
          cwd: installRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            npm_config_audit: "false",
            npm_config_cache: npmCache,
            npm_config_fund: "false",
            npm_config_offline: "true",
            npm_config_registry: "http://127.0.0.1:9/",
            npm_config_update_notifier: "false",
          },
        },
      );
      assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

      const installedRoot = path.join(
        installRoot,
        "node_modules",
        PACKAGE_NAME,
      );
      const installedManifest = JSON.parse(
        await readFile(path.join(installedRoot, "package.json"), "utf8"),
      );
      assert.equal(installedManifest.name, PACKAGE_NAME);
      assert.equal(installedManifest.version, PACKAGE_VERSION);
      assert.equal(installedManifest.license, "Apache-2.0");
      assert.deepEqual(installedManifest.repository, {
        type: "git",
        url: "git+https://github.com/localhost41/qvac-atlas.git",
      });
      assert.equal(installedManifest.dependencies, undefined);
      assert.equal(installedManifest.devDependencies, undefined);
      assert.equal(
        await absent(path.join(installRoot, "node_modules", "@qvac")),
        true,
      );

      const binary = path.join(
        installRoot,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "qvac-atlas.cmd" : "qvac-atlas",
      );
      const executionEnv = {
        ...process.env,
        NODE_PATH: globalModules,
        QVAC_ATLAS_REAL: "1",
        QVAC_ATLAS_YES: "1",
      };
      const help = spawnSync(binary, ["--help"], {
        cwd: installRoot,
        encoding: "utf8",
        env: executionEnv,
      });
      assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
      assert.match(
        help.stdout,
        /QVAC Atlas creates a local, sanitized report/u,
      );
      assert.match(help.stdout, /synthetic fixture scenarios only/u);
      assert.equal(help.stderr, "");

      const disabled = spawnSync(
        binary,
        ["probe", "--real", "--output", "should-not-exist.json"],
        {
          cwd: installRoot,
          encoding: "utf8",
          env: executionEnv,
          input: "yes\nyes\nyes\nyes\n",
        },
      );
      assert.equal(
        disabled.status,
        2,
        `${disabled.stdout}\n${disabled.stderr}`,
      );
      assert.equal(disabled.stdout, "");
      assert.match(
        disabled.stderr,
        /Real QVAC execution is disabled in this build/u,
      );
      assert.equal(
        await absent(path.join(installRoot, "should-not-exist.json")),
        true,
      );
      assert.equal(await absent(marker), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
