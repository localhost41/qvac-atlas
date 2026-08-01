import assert from "node:assert/strict";
import test from "node:test";

import { runCli, type CliDependencies } from "../src/index.js";

test("noninteractive probe refuses before invoking the probe or writing", async () => {
  let invoked = false;
  const errors: string[] = [];
  const dependencies: CliDependencies = {
    interactive: false,
    cwd: () => "/fixture",
    ask: async () => {
      throw new Error("must not prompt");
    },
    stdout: () => {},
    stderr: (value) => errors.push(value),
    runProbe: async () => {
      invoked = true;
      throw new Error("must not run");
    },
  };
  const exit = await runCli(
    ["probe", "--fixture", "success", "--output", "report.json"],
    dependencies,
  );
  assert.equal(exit, 2);
  assert.equal(invoked, false);
  assert.match(errors.join(""), /refuses noninteractive probing/);
});

test("invalid fixture syntax refuses before reading cwd or invoking effects", async () => {
  const errors: string[] = [];
  let readCwd = false;
  const exit = await runCli(["probe", "--output", "report.json"], {
    interactive: true,
    cwd: () => {
      readCwd = true;
      throw new Error("must not read cwd");
    },
    ask: async () => "yes",
    stdout: () => {},
    stderr: (value) => errors.push(value),
    runProbe: async () => {
      throw new Error("must not run");
    },
  });
  assert.equal(exit, 2);
  assert.equal(readCwd, false);
  assert.match(
    errors.join(""),
    /This build accepts synthetic fixture scenarios only/,
  );
  assert.match(errors.join(""), /separate reviewed activation decision/);
});

test("probe failures do not echo raw errors or local paths", async () => {
  const errors: string[] = [];
  const exit = await runCli(
    ["probe", "--fixture", "success", "--output", "report.json"],
    {
      interactive: true,
      cwd: () => "/fixture/private-project",
      ask: async () => "yes",
      stdout: () => {},
      stderr: (value) => errors.push(value),
      runProbe: async () => {
        throw new Error("secret at /Users/private/model.gguf");
      },
    },
  );
  assert.equal(exit, 1);
  assert.equal(errors.join("").includes("/Users/private"), false);
  assert.match(errors.join(""), /stopped safely/);
});
