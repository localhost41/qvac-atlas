import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { installParentDisconnectFailSafe } from "../dist/parent-disconnect.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = (name) => path.join(packageRoot, "test", "fixtures", name);

function killIfPresent(pid) {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The containment path has already removed it.
  }
}

async function waitForAbsent(pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`process ${pid} survived parent IPC loss`);
}

test("normal lifecycle disarms the disconnect fail-safe before closing IPC", () => {
  const emitter = new EventEmitter();
  const kills = [];
  const host = {
    pid: 123,
    platform: "darwin",
    connected: true,
    once: (event, listener) => emitter.once(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    kill: (pid, signal) => {
      kills.push([pid, signal]);
      return true;
    },
    exit: () => {
      throw new Error("must-not-exit");
    },
  };

  const disarm = installParentDisconnectFailSafe(host);
  disarm();
  disarm();
  emitter.emit("disconnect");
  assert.deepEqual(kills, []);
});

test(
  "forced parent death makes the post-bootstrap child kill its POSIX group",
  { skip: process.platform === "win32" },
  async (t) => {
    const launcher = fork(fixture("parent-death-launcher.mjs"), [], {
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let tree;
    t.after(async () => {
      killIfPresent(launcher.pid);
      if (tree !== undefined) {
        killIfPresent(-tree.root);
        killIfPresent(tree.descendant);
      }
    });

    tree = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("parent-disconnect-fixture-timeout")),
        2_000,
      );
      launcher.once("error", reject);
      launcher.once("message", (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    assert.deepEqual(Object.keys(tree).sort(), ["descendant", "root", "type"]);
    assert.equal(tree.type, "parent-disconnect-tree-ready");
    assert.equal(Number.isSafeInteger(tree.root), true);
    assert.equal(Number.isSafeInteger(tree.descendant), true);

    const launcherExit = new Promise((resolve) =>
      launcher.once("exit", resolve),
    );
    process.kill(launcher.pid, "SIGKILL");
    await launcherExit;
    await Promise.all([
      waitForAbsent(tree.root),
      waitForAbsent(tree.descendant),
    ]);
    tree = undefined;
  },
);
