import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { resolveProjectLocalSdk } from "../dist/index.js";
import {
  createSanitizedChildEnvironment,
  launchResolvedSdkChild,
  SdkChildLaunchError,
} from "../dist/internal.js";
import {
  createProject,
  makeTemporaryDirectory,
  removeTemporaryDirectory,
  writeJson,
} from "./helpers.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "bootstrap-runner.mjs",
);

function childMessage(child) {
  return new Promise((resolve, reject) => {
    child.once("message", resolve);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== null && code !== 0)
        reject(new Error(`child exited: ${code}/${signal}`));
    });
  });
}

async function isMissing(filePath) {
  try {
    await access(filePath);
    return false;
  } catch {
    return true;
  }
}

test("sanitizes inherited environment with an explicit allowlist", () => {
  const sanitized = createSanitizedChildEnvironment({
    HOME: "/allowed",
    LANG: "en_US.UTF-8",
    NODE_OPTIONS: "--inspect",
    NODE_PATH: "/forbidden",
    QVAC_CONFIG_PATH: "/forbidden/config.mjs",
    QVAC_WORKER_PATH: "/forbidden/worker.mjs",
    SECRET_VALUE: "must-not-cross",
  });
  assert.deepEqual({ ...sanitized }, { HOME: "/allowed", LANG: "en_US.UTF-8" });
});

test("launches from a clean cwd and bootstraps the exact SDK only over IPC", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-clean-cwd-");
  const hostileRoot = await makeTemporaryDirectory("qvac-resolver-hostile-");
  const loaderMarker = path.join(hostileRoot, "loader-ran");
  const configMarker = path.join(hostileRoot, "config-ran");
  const workerMarker = path.join(hostileRoot, "worker-ran");
  const hostileLoader = path.join(hostileRoot, "loader.mjs");
  const hostileConfig = path.join(fixture.root, "qvac.config.mjs");
  const hostileWorker = path.join(fixture.root, "qvac", "worker.entry.mjs");
  await writeFile(
    hostileLoader,
    `await import('node:fs/promises').then(fs => fs.writeFile(${JSON.stringify(loaderMarker)}, 'x'))\n`,
    "utf8",
  );
  await writeFile(
    hostileConfig,
    `await import('node:fs/promises').then(fs => fs.writeFile(${JSON.stringify(configMarker)}, 'x'))\n`,
    "utf8",
  );
  await mkdir(path.dirname(hostileWorker), { recursive: true });
  await writeFile(
    hostileWorker,
    `await import('node:fs/promises').then(fs => fs.writeFile(${JSON.stringify(workerMarker)}, 'x'))\n`,
    "utf8",
  );
  t.after(() =>
    Promise.all(
      [fixture.root, tempCwd, hostileRoot].map(removeTemporaryDirectory),
    ),
  );

  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");
  const child = await launchResolvedSdkChild({
    handle: resolution.handle,
    runnerPath,
    tempCwd,
    sourceEnv: {
      ...process.env,
      NODE_OPTIONS: `--import=${hostileLoader}`,
      NODE_PATH: path.join(fixture.root, "node_modules"),
      QVAC_CONFIG_PATH: hostileConfig,
      QVAC_WORKER_PATH: hostileWorker,
    },
  });

  const spawnSurface = JSON.stringify({
    argv: child.spawnargs,
    env: child.spawnfile,
  });
  assert.equal(spawnSurface.includes(fixture.sdkRoot), false);
  assert.equal(spawnSurface.includes("@qvac/sdk"), false);

  const message = await childMessage(child);
  assert.deepEqual(message, {
    type: "fixture-result",
    fixtureValue: "accepted-exact-sdk",
    cwd: await realpath(tempCwd),
    execArgv: [],
    forbiddenEnvironment: {},
  });
  assert.equal(await isMissing(loaderMarker), true);
  assert.equal(await isMissing(configMarker), true);
  assert.equal(await isMissing(workerMarker), true);
});

test("accepts a clean cwd reached through a canonicalized parent alias", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-canonical-cwd-");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");

  const child = await launchResolvedSdkChild({
    handle: resolution.handle,
    runnerPath,
    tempCwd,
  });
  const message = await childMessage(child);
  assert.equal(message.type, "fixture-result");
  assert.equal(message.cwd, await realpath(tempCwd));
});

test("rejects a cwd with project/config discovery surfaces using path-free errors", async (t) => {
  const fixture = await createProject();
  const unsafeCwd = await makeTemporaryDirectory("qvac-resolver-unsafe-cwd-");
  await writeJson(path.join(unsafeCwd, "package.json"), { private: true });
  t.after(() =>
    Promise.all([fixture.root, unsafeCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");

  await assert.rejects(
    () =>
      launchResolvedSdkChild({
        handle: resolution.handle,
        runnerPath,
        tempCwd: unsafeCwd,
      }),
    (error) => {
      assert.ok(error instanceof SdkChildLaunchError);
      assert.equal(error.code, "qvac-child-cwd-unsafe");
      assert.equal(error.message, "qvac-child-cwd-unsafe");
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "qvac-child-cwd-unsafe",
      });
      assert.equal(JSON.stringify(error).includes(unsafeCwd), false);
      return true;
    },
  );
});

test("maps runner filesystem failures to a stable path-free error", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-runner-error-");
  const missingRunner = path.join(tempCwd, "secret-runner-path.mjs");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");

  await assert.rejects(
    () =>
      launchResolvedSdkChild({
        handle: resolution.handle,
        runnerPath: missingRunner,
        tempCwd,
      }),
    (error) => {
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "qvac-child-runner-invalid",
      });
      assert.equal(error.message.includes(missingRunner), false);
      assert.equal(JSON.stringify(error).includes(missingRunner), false);
      return true;
    },
  );
});

test("child bootstrap rejects unaudited file URLs without leaking them", async (t) => {
  const tempCwd = await makeTemporaryDirectory(
    "qvac-resolver-invalid-bootstrap-",
  );
  const secretRoot = path.join(tempCwd, "secret-sdk-location");
  const secretEntry = path.join(secretRoot, "dist", "index.js");
  t.after(() => removeTemporaryDirectory(tempCwd));

  const child = fork(runnerPath, [], {
    cwd: await realpath(tempCwd),
    env: createSanitizedChildEnvironment(process.env),
    execArgv: [],
    serialization: "json",
    silent: true,
  });
  child.send({
    type: "qvac-atlas-sdk-bootstrap-v1",
    sdkRootFileUrl: pathToFileURL(secretRoot).href,
    entryFileUrl: pathToFileURL(secretEntry).href,
    sdkVersion: "0.16.0",
  });

  const message = await childMessage(child);
  assert.deepEqual(message, {
    type: "fixture-error",
    error: { code: "qvac-bootstrap-invalid" },
  });
  assert.equal(JSON.stringify(message).includes(secretRoot), false);
  assert.equal(JSON.stringify(message).includes(secretEntry), false);
});
