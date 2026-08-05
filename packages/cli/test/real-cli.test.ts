import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalize, withReportId } from "@qvac-atlas/schema";
import {
  SUBMISSION_PROFILE,
  type AnonymousSubmissionClient,
} from "@qvac-atlas/submission";

import { runEnabledRealCli } from "../src/real-cli.js";

async function eligibleExactJson(): Promise<string> {
  const report = JSON.parse(
    await readFile(
      new URL("../../schema/fixtures/success.json", import.meta.url),
      "utf8",
    ),
  );
  report.consent.publication = true;
  report.created_at = "2026-08-04T00:00:00.000Z";
  report.profile = { ...SUBMISSION_PROFILE };
  report.provenance = { fixture_id: null, kind: "probe" };
  return `${canonicalize(withReportId(report))}\n`;
}

function writtenPipeline(exactJson: string) {
  return async (_options: unknown, dependencies: any) => {
    await dependencies.interaction.disclosePrivacy({
      collection: "allowlisted",
    });
    assert.equal(await dependencies.interaction.decideFingerprint(), true);
    await dependencies.interaction.discloseProjectCode({
      package: "@qvac/sdk",
      version: "0.16.0",
      containment: "bounded",
    });
    assert.equal(await dependencies.interaction.decideProjectCode(), true);
    await dependencies.interaction.discloseWorkload({});
    assert.equal(await dependencies.interaction.decideWorkload(), true);
    await dependencies.interaction.preview(exactJson, "draft");
    assert.equal(
      await dependencies.interaction.choosePublication({
        claimEligible: false,
        currentlyAdmissible: false,
      }),
      true,
    );
    await dependencies.interaction.preview(exactJson, "final");
    assert.equal(await dependencies.interaction.confirmLocalWrite(), true);
    await dependencies.output.writeExclusive(exactJson);
    return {
      exactJson,
      history: [],
      report: JSON.parse(exactJson),
      status: "written",
    } as const;
  };
}

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
    assert.match(visible.join(""), /Nothing was submitted/);
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
  const controlled = path.join(root, "project\u009b");
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

test("anonymous submission is offered only after the exact local write", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-submit-"));
  const exactJson = await eligibleExactJson();
  const questions: string[] = [];
  const events: string[] = [];
  const submitted: string[] = [];
  const client: AnonymousSubmissionClient = {
    origin: "https://relay.example",
    submit: async (value) => {
      events.push("submitted");
      submitted.push(value);
      return {
        status: "queued",
        submissionId: JSON.parse(value).report_id,
      };
    },
  };
  try {
    const exit = await runEnabledRealCli(
      {
        cwd: root,
        output: "report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async (question) => {
          questions.push(question);
          return "yes";
        },
        stdout: (value) => {
          if (value.includes("Anonymous submission disclosure"))
            events.push("disclosed");
        },
        stderr: () => {},
      },
      {
        createCoordinator: () => ({}) as never,
        createOutput: () => ({
          preflight: async () => true,
          writeExclusive: async (value: string) => {
            assert.equal(value, exactJson);
            events.push("written");
            return { status: "written" as const };
          },
        }),
        runPipeline: writtenPipeline(exactJson) as never,
        submissionClient: client,
      },
    );
    assert.equal(exit, 0);
    assert.deepEqual(events, ["written", "disclosed", "submitted"]);
    assert.deepEqual(submitted, [exactJson]);
    assert.equal(questions.length, 6);
    assert.match(questions[5] ?? "", /https:\/\/relay\.example/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("decline and prompt EOF after write make zero submission calls", async (t) => {
  const exactJson = await eligibleExactJson();
  for (const mode of ["decline", "eof"] as const) {
    await t.test(mode, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "atlas-real-decline-"));
      let questionCount = 0;
      let calls = 0;
      try {
        const exit = await runEnabledRealCli(
          {
            cwd: root,
            output: "report.json",
            signal: new AbortController().signal,
          },
          {
            ask: async () => {
              questionCount += 1;
              if (questionCount <= 5) return "yes";
              if (mode === "eof") throw new Error("EOF private detail");
              return "no";
            },
            stdout: () => {},
            stderr: () => {},
          },
          {
            createCoordinator: () => ({}) as never,
            createOutput: () => ({
              preflight: async () => true,
              writeExclusive: async () => ({ status: "written" as const }),
            }),
            runPipeline: writtenPipeline(exactJson) as never,
            submissionClient: {
              origin: "https://relay.example",
              submit: async () => {
                calls += 1;
                throw new Error("unreachable");
              },
            },
          },
        );
        assert.equal(exit, 0);
        assert.equal(questionCount, 6);
        assert.equal(calls, 0);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("an ineligible written report never reaches submission consent or transport", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-ineligible-"));
  let questions = 0;
  let calls = 0;
  try {
    const exit = await runEnabledRealCli(
      {
        cwd: root,
        output: "report.json",
        signal: new AbortController().signal,
      },
      {
        ask: async () => {
          questions += 1;
          return "yes";
        },
        stdout: () => {},
        stderr: () => {},
      },
      {
        createCoordinator: () => ({}) as never,
        createOutput: () => ({
          preflight: async () => true,
          writeExclusive: async () => ({ status: "written" as const }),
        }),
        runPipeline: writtenPipeline('{"final":true}\n') as never,
        submissionClient: {
          origin: "https://relay.example",
          submit: async () => {
            calls += 1;
            throw new Error("unreachable");
          },
        },
      },
    );
    assert.equal(exit, 0);
    assert.equal(questions, 5);
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
