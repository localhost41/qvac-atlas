import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEnabledRealCli } from "../src/real-cli.js";

test("real CLI uses one normalized output for consent and exclusive write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-cli-"));
  const questions: string[] = [];
  const visible: string[] = [];
  let createdPath: string | undefined;
  let written: string | undefined;
  try {
    const exit = await runEnabledRealCli(
      {
        cwd: root,
        output: "nested/../report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async (question) => {
          questions.push(question);
          return "yes";
        },
        stdout: (value) => visible.push(value),
        stderr: (value) => visible.push(value),
      },
      {
        createCoordinator: () => ({ kind: "synthetic-coordinator" }) as never,
        createOutput: (outputPath) => {
          createdPath = outputPath;
          return {
            preflight: async () => true,
            writeExclusive: async (exactJson) => {
              written = exactJson;
              return { status: "written" };
            },
          };
        },
        runPipeline: async (_options, dependencies) => {
          await dependencies.interaction.disclosePrivacy({
            collection: "allowlisted",
          } as never);
          assert.equal(
            await dependencies.interaction.decideFingerprint(),
            true,
          );
          await dependencies.interaction.discloseProjectCode({
            package: "@qvac/sdk",
            version: "0.16.0",
            containment: "bounded",
          } as never);
          assert.equal(
            await dependencies.interaction.decideProjectCode(),
            true,
          );
          await dependencies.interaction.discloseWorkload({} as never);
          assert.equal(await dependencies.interaction.decideWorkload(), true);
          await dependencies.interaction.preview('{"draft":true}\n', "draft");
          assert.equal(
            await dependencies.interaction.choosePublication({
              claimEligible: false,
              currentlyAdmissible: false,
            } as never),
            true,
          );
          await dependencies.interaction.preview('{"final":true}\n', "final");
          assert.equal(
            await dependencies.interaction.confirmLocalWrite(),
            true,
          );
          await dependencies.output.writeExclusive('{"final":true}\n');
          return { status: "written" } as never;
        },
      },
    );
    const expected = path.join(await realpath(root), "report.json");
    assert.equal(exit, 0);
    assert.equal(createdPath, expected);
    assert.equal(written, '{"final":true}\n');
    assert.equal(questions.length, 5);
    assert.match(questions[0] ?? "", /fingerprint risk/);
    assert.match(questions[1] ?? "", /project-local QVAC Doctor/);
    assert.match(questions[2] ?? "", /exactly one pinned cache/);
    assert.match(questions[3] ?? "", /later public submission/);
    assert.equal(
      questions[4],
      `Write the final exact JSON to ${expected} [y/N] `,
    );
    assert.match(visible.join(""), /Nothing was uploaded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prompt failure is fixed-text fatal and does not leak private details", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-eof-"));
  const errors: string[] = [];
  try {
    const exit = await runEnabledRealCli(
      {
        cwd: root,
        output: "report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async () => {
          throw new Error(`/private/${root}/secret`);
        },
        stdout: () => {},
        stderr: (value) => errors.push(value),
      },
      {
        createCoordinator: () => ({}) as never,
        createOutput: () => ({}) as never,
        runPipeline: async (_options, dependencies) => {
          await dependencies.interaction.decideFingerprint();
          throw new Error("unreachable");
        },
      },
    );
    assert.equal(exit, 1);
    assert.equal(errors.join("").includes(root), false);
    assert.match(errors.join(""), /could not complete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a control-bearing canonical cwd fails before prompt without path echo", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-control-"));
  const controlled = path.join(root, "project\n\u001b");
  const errors: string[] = [];
  let prompted = false;
  try {
    await mkdir(controlled);
    const exit = await runEnabledRealCli(
      {
        cwd: controlled,
        output: "report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async () => {
          prompted = true;
          return "yes";
        },
        stdout: () => {},
        stderr: (value) => errors.push(value),
      },
    );
    assert.equal(exit, 1);
    assert.equal(prompted, false);
    assert.equal(errors.join("").includes("project"), false);
    assert.match(errors.join(""), /could not complete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup uncertainty uses neutral fixed text without claiming no local write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-uncertain-"));
  const errors: string[] = [];
  try {
    const exit = await runEnabledRealCli(
      {
        cwd: root,
        output: "report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async () => "yes",
        stdout: () => {},
        stderr: (value) => errors.push(value),
      },
      {
        createCoordinator: () => ({}) as never,
        createOutput: () => ({}) as never,
        runPipeline: async () =>
          ({
            status: "cleanup-uncertain",
            stage: "write-consented",
            history: [],
          }) as never,
      },
    );
    assert.equal(exit, 1);
    assert.match(errors.join(""), /could not complete/);
    assert.equal(errors.join("").includes("No report was written"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
