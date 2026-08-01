import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
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
const fastRunnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "fast-bootstrap-runner.mjs",
);
const sendFailureRunnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "send-failure-runner.mjs",
);
const stubbornSendFailureRunnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "stubborn-send-failure-runner.mjs",
);
const rootExitSendFailureRunnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "root-exit-send-failure-runner.mjs",
);
const afterBootstrapRootExitRunnerPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "after-bootstrap-root-exit-runner.mjs",
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
  let receivedMessage;
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
    beforeBootstrap(spawnedChild) {
      receivedMessage = childMessage(spawnedChild);
    },
  });

  const spawnSurface = JSON.stringify({
    argv: child.spawnargs,
    env: child.spawnfile,
  });
  assert.equal(spawnSurface.includes(fixture.sdkRoot), false);
  assert.equal(spawnSurface.includes("@qvac/sdk"), false);

  const message = await receivedMessage;
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

test(
  "after-SDK bootstrap failure reaps a fast root and its surviving descendant",
  { skip: process.platform === "win32" },
  async (t) => {
    const fixture = await createProject();
    const tempCwd = await makeTemporaryDirectory(
      "qvac-resolver-after-bootstrap-failure-",
    );
    t.after(() =>
      Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
    );
    const resolution = await resolveProjectLocalSdk(fixture.root);
    assert.equal(resolution.status, "resolved");
    let rootPid;
    let afterHookRan = false;

    await assert.rejects(
      () =>
        launchResolvedSdkChild({
          handle: resolution.handle,
          runnerPath: afterBootstrapRootExitRunnerPath,
          tempCwd,
          beforeBootstrap(child) {
            rootPid = child.pid;
          },
          async afterSdkBootstrapSent(child) {
            afterHookRan = true;
            assert.deepEqual(await childMessage(child), {
              type: "root-ready-to-exit",
            });
            if (child.connected) {
              await new Promise((resolve) => child.once("disconnect", resolve));
            }
            await new Promise((resolve, reject) => {
              child.send({ type: "private-second-bootstrap" }, (error) => {
                if (error) reject(error);
                else resolve();
              });
            });
          },
        }),
      (error) => {
        assert.ok(error instanceof SdkChildLaunchError);
        assert.equal(error.code, "qvac-child-launch-failed");
        assert.equal(JSON.stringify(error).includes("private"), false);
        return true;
      },
    );

    assert.equal(afterHookRan, true);
    const grandchildPid = Number(
      await readFile(path.join(tempCwd, "grandchild.pid"), "utf8"),
    );
    assert.equal(Number.isSafeInteger(rootPid), true);
    assert.throws(() => process.kill(rootPid, 0));
    assert.throws(() => process.kill(grandchildPid, 0));
  },
);

test("accepts a clean cwd reached through a canonicalized parent alias", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-canonical-cwd-");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");

  let receivedMessage;
  await launchResolvedSdkChild({
    handle: resolution.handle,
    runnerPath,
    tempCwd,
    beforeBootstrap(spawnedChild) {
      receivedMessage = childMessage(spawnedChild);
    },
  });
  const message = await receivedMessage;
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
        beforeBootstrap() {},
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
        beforeBootstrap() {},
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

test("registers supervision before a fast child can answer bootstrap", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-fast-bootstrap-");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");

  let receivedMessage;
  let responseArrivedBeforeLaunchReturned = false;
  await launchResolvedSdkChild({
    handle: resolution.handle,
    runnerPath: fastRunnerPath,
    tempCwd,
    beforeBootstrap(spawnedChild) {
      receivedMessage = childMessage(spawnedChild).then((message) => {
        responseArrivedBeforeLaunchReturned = true;
        return message;
      });
      const originalSend = spawnedChild.send.bind(spawnedChild);
      spawnedChild.send = (message, callback) =>
        originalSend(message, (error) => setTimeout(() => callback(error), 75));
    },
  });

  assert.equal(responseArrivedBeforeLaunchReturned, true);
  assert.deepEqual(await receivedMessage, { type: "fast-bootstrap-received" });
});

test("a failing supervision hook is terminated and reaped with a path-free error", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-setup-failure-");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");
  let exitObserved = false;

  await assert.rejects(
    () =>
      launchResolvedSdkChild({
        handle: resolution.handle,
        runnerPath: sendFailureRunnerPath,
        tempCwd,
        beforeBootstrap(child) {
          child.once("error", () => {});
          child.once("exit", () => {
            exitObserved = true;
          });
          throw new Error(`private setup failure at ${fixture.root}`);
        },
      }),
    (error) => {
      assert.ok(error instanceof SdkChildLaunchError);
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "qvac-child-launch-failed",
      });
      assert.equal(error.message.includes(fixture.root), false);
      assert.equal(JSON.stringify(error).includes(fixture.root), false);
      return true;
    },
  );
  assert.equal(exitObserved, true);
});

async function expectFailedBootstrapCleanup({
  fixture,
  tempCwd,
  failureRunnerPath,
  expectedSignal,
}) {
  const resolution = await resolveProjectLocalSdk(fixture.root);
  assert.equal(resolution.status, "resolved");
  let supervisedChild;
  let exitObserved;
  let childExited = false;

  await assert.rejects(
    () =>
      launchResolvedSdkChild({
        handle: resolution.handle,
        runnerPath: failureRunnerPath,
        tempCwd,
        async beforeBootstrap(child) {
          supervisedChild = child;
          const ready = childMessage(child);
          assert.deepEqual(await ready, { type: "ready-to-disconnect" });
          exitObserved = new Promise((resolve) =>
            child.once("exit", (...event) => {
              childExited = true;
              resolve(event);
            }),
          );
          child.disconnect();
        },
      }),
    (error) => {
      assert.ok(error instanceof SdkChildLaunchError);
      assert.equal(error.code, "qvac-child-launch-failed");
      assert.deepEqual(JSON.parse(JSON.stringify(error)), {
        code: "qvac-child-launch-failed",
      });
      assert.equal(JSON.stringify(error).includes(tempCwd), false);
      assert.equal(JSON.stringify(error).includes(fixture.root), false);
      return true;
    },
  );

  assert.equal(childExited, true);
  await exitObserved;
  assert.equal(supervisedChild.signalCode, expectedSignal);
  assert.equal(supervisedChild.exitCode, null);
}

test("bootstrap send failure is terminated and reaped before rejection", async (t) => {
  const fixture = await createProject();
  const tempCwd = await makeTemporaryDirectory("qvac-resolver-send-failure-");
  t.after(() =>
    Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
  );

  await expectFailedBootstrapCleanup({
    fixture,
    tempCwd,
    failureRunnerPath: sendFailureRunnerPath,
    expectedSignal: "SIGTERM",
  });
});

test(
  "a stubborn bootstrap child escalates from SIGTERM to SIGKILL and is reaped",
  { skip: process.platform === "win32" },
  async (t) => {
    const fixture = await createProject();
    const tempCwd = await makeTemporaryDirectory(
      "qvac-resolver-stubborn-send-",
    );
    t.after(() =>
      Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
    );

    await expectFailedBootstrapCleanup({
      fixture,
      tempCwd,
      failureRunnerPath: stubbornSendFailureRunnerPath,
      expectedSignal: "SIGKILL",
    });
  },
);

test(
  "bootstrap cleanup sweeps descendants after the detached root exits",
  { skip: process.platform === "win32" },
  async (t) => {
    const fixture = await createProject();
    const tempCwd = await makeTemporaryDirectory("qvac-resolver-root-exit-");
    t.after(() =>
      Promise.all([fixture.root, tempCwd].map(removeTemporaryDirectory)),
    );
    const resolution = await resolveProjectLocalSdk(fixture.root);
    assert.equal(resolution.status, "resolved");

    await assert.rejects(
      () =>
        launchResolvedSdkChild({
          handle: resolution.handle,
          runnerPath: rootExitSendFailureRunnerPath,
          tempCwd,
          async beforeBootstrap(child) {
            assert.deepEqual(await childMessage(child), {
              type: "root-ready-to-exit",
            });
            await new Promise((resolve) => child.once("exit", resolve));
          },
        }),
      (error) => {
        assert.ok(error instanceof SdkChildLaunchError);
        assert.equal(error.code, "qvac-child-launch-failed");
        return true;
      },
    );
    const pid = Number(
      await readFile(path.join(tempCwd, "grandchild.pid"), "utf8"),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.throws(() => process.kill(pid, 0));
  },
);
