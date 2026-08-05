import assert from "node:assert/strict";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { AtlasReport, RunnerEvidence } from "@qvac-atlas/probe";
import type { RealCoordinatorBoundary } from "@qvac-atlas/probe/real";

import {
  deriveReportClaim,
  evaluateV1ClaimEvidence,
  scanPrivacy,
  validateReport,
  verifyReportId,
} from "../../schema/src/index.js";
import { dispatchCli } from "../src/internal-dispatcher.js";
import { runEnabledRealCli } from "../src/real-cli.js";

const SUCCESSFUL_RUNNER: RunnerEvidence = {
  phases: [
    { name: "qvac-import", status: "passed", duration_ms: 1 },
    { name: "worker-start", status: "passed", duration_ms: 2 },
    { name: "model-load", status: "passed", duration_ms: 3 },
    { name: "inference", status: "passed", duration_ms: 4 },
    { name: "clean-shutdown", status: "passed", duration_ms: 5 },
  ],
  backend_observation: {
    status: "observed",
    backend: "gpu",
    method: "runner-event",
  },
  termination: {
    kind: "clean-exit",
    exit_code: 0,
    signal: null,
    last_completed_phase: "clean-shutdown",
  },
  result: {
    workload_status: "passed",
    completion_observed: true,
    failure: {
      category: "none",
      phase: null,
      code: null,
      sanitized_excerpt: null,
    },
  },
};

function previewBytes(value: string, kind: "draft" | "final"): string {
  const prefix = `--- ${kind} exact JSON ---\n`;
  const suffix = `--- end ${kind} exact JSON ---\n`;
  assert.equal(value.startsWith(prefix), true);
  assert.equal(value.endsWith(suffix), true);
  return value.slice(prefix.length, -suffix.length);
}

test("private true seam completes the synthetic real path without enabling production effects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-whole-path-"));
  const expectedOutput = path.join(await realpath(root), "report.json");
  const rawOutput = "nested/../report.json";
  const events: string[] = [];
  const questions: string[] = [];
  const visible: string[] = [];
  const errors: string[] = [];
  const coordinatorSignals: AbortSignal[] = [];
  let forwardedSignal: AbortSignal | undefined;
  let coordinatorRoot: string | undefined;

  const coordinator: RealCoordinatorBoundary = {
    resolve: async (signal) => {
      events.push("coordinator:resolve");
      coordinatorSignals.push(signal);
      return {
        status: "resolved",
        qvac: {
          discovery: {
            status: "passed",
            reason: "completed",
            duration_ms: 7,
          },
          sdk_version: "0.16.0",
          packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
        },
      };
    },
    runDoctor: async (signal) => {
      events.push("coordinator:doctor");
      coordinatorSignals.push(signal);
      return {
        status: "completed",
        doctor: {
          status: "passed",
          reason: "completed",
          duration_ms: 8,
        },
      };
    },
    runWorkload: async (signal) => {
      events.push("coordinator:workload");
      coordinatorSignals.push(signal);
      return { status: "executed", runner: SUCCESSFUL_RUNNER };
    },
  };

  const expectedQuestions = [
    "I understand the fingerprint risk and consent to local collection [y/N] ",
    "Run the audited project-local QVAC Doctor and SDK code [y/N] ",
    "Authorize exactly one pinned cache verify/download and one requested-GPU lifecycle [y/N] ",
    "Mark this local report as intended for later public submission [y/N] ",
    `Write the final exact JSON to ${expectedOutput} [y/N] `,
  ];
  const questionEvents = [
    "ask:fingerprint",
    "ask:project",
    "ask:workload",
    "ask:publication",
    "ask:write",
  ];

  try {
    const exit = await dispatchCli(
      ["probe", "--real", "--output", rawOutput],
      {
        interactive: false,
        platform: () => "darwin",
        architecture: () => "arm64",
        isInteractive: () => {
          events.push("tty");
          return true;
        },
        cwd: () => {
          events.push("cwd");
          return root;
        },
        ask: async () => {
          throw new Error("fixture-prompt-must-not-run");
        },
        askReal: async (question, signal) => {
          assert.equal(signal, forwardedSignal);
          assert.equal(questions.length < expectedQuestions.length, true);
          events.push(questionEvents[questions.length]!);
          questions.push(question);
          await assert.rejects(lstat(expectedOutput), {
            code: "ENOENT",
          });
          return "yes";
        },
        stdout: (value) => {
          visible.push(value);
          if (value.startsWith("QVAC Atlas real probe privacy disclosure"))
            events.push("disclose:privacy");
          else if (value.startsWith("Project-code disclosure:"))
            events.push("disclose:project");
          else if (
            value.startsWith("Authoritative artifact and workload disclosure:")
          )
            events.push("disclose:workload");
          else if (value.startsWith("--- draft exact JSON ---"))
            events.push("preview:draft");
          else if (value.startsWith("Publication warning:"))
            events.push("warning:publication");
          else if (value.startsWith("--- final exact JSON ---"))
            events.push("preview:final");
          else if (value.startsWith("Candidate report written locally to"))
            events.push("complete");
          else if (value.startsWith("Anonymous submission is disabled")) {
            // The source-pinned relay origin intentionally remains inactive.
          } else assert.fail(`unexpected stdout shape: ${value.slice(0, 40)}`);
        },
        stderr: (value) => errors.push(value),
        onCancellationSignal: () => {
          events.push("signal:add");
          return () => events.push("signal:remove");
        },
        loadRealCli: async () => {
          events.push("real:load");
          return {
            runEnabledRealCli: async (request, io) => {
              assert.equal(request.cwd, root);
              assert.equal(request.output, rawOutput);
              forwardedSignal = request.signal;
              return runEnabledRealCli(request, io, {
                createCoordinator: (projectRoot) => {
                  events.push("coordinator:create");
                  coordinatorRoot = projectRoot;
                  return coordinator;
                },
              });
            },
          };
        },
        runProbe: async () => {
          throw new Error("fixture-probe-must-not-run");
        },
      },
      true,
    );

    assert.equal(exit, 0);
    assert.equal(errors.join(""), "");
    assert.deepEqual(questions, expectedQuestions);
    assert.deepEqual(events, [
      "tty",
      "cwd",
      "signal:add",
      "real:load",
      "coordinator:create",
      "disclose:privacy",
      "ask:fingerprint",
      "coordinator:resolve",
      "disclose:project",
      "ask:project",
      "coordinator:doctor",
      "disclose:workload",
      "ask:workload",
      "coordinator:workload",
      "preview:draft",
      "warning:publication",
      "ask:publication",
      "preview:final",
      "ask:write",
      "complete",
      "signal:remove",
    ]);
    assert.equal(coordinatorRoot, path.resolve(root));
    assert.equal(forwardedSignal?.aborted, false);
    assert.deepEqual(coordinatorSignals, [
      forwardedSignal,
      forwardedSignal,
      forwardedSignal,
    ]);

    assert.equal(visible.length, 8);
    assert.match(visible[0]!, /candidate is nonstandard/);
    assert.match(visible[2]!, /"requestedBackend": "gpu"/);
    assert.match(visible[4]!, /claim eligible=false/);
    assert.equal(
      `${visible[6]}${visible[7]}`,
      `Candidate report written locally to ${expectedOutput}.\nAnonymous submission is disabled in this build; the report remains local. Nothing was submitted.\n`,
    );

    const draftBytes = previewBytes(visible[3]!, "draft");
    const finalBytes = previewBytes(visible[5]!, "final");
    assert.equal(await readFile(expectedOutput, "utf8"), finalBytes);
    const draft = JSON.parse(draftBytes) as AtlasReport;
    const report = JSON.parse(finalBytes) as AtlasReport;
    assert.equal(draft.consent.publication, false);
    assert.equal(report.consent.publication, true);
    assert.equal(draft.report_id, report.report_id);
    assert.equal(report.provenance.kind, "probe");
    assert.equal(report.provenance.fixture_id, null);
    assert.equal(report.profile.id, "atlas-smollm2-360m-lifecycle");
    assert.equal(report.profile.version, "1.0.0-candidate.1");
    assert.equal(report.profile.requested_backend, "gpu");
    assert.equal(report.result.workload_status, "passed");
    assert.equal(finalBytes.includes(root), false);
    assert.equal(validateReport(report).valid, true);
    assert.equal(verifyReportId(report), true);
    assert.deepEqual(scanPrivacy(report), []);

    const evidence = evaluateV1ClaimEvidence(report);
    assert.equal(evidence.trustedProfile, false);
    assert.equal(evidence.successEligible, false);
    assert.equal(evidence.failureEligible, false);
    const claim = deriveReportClaim(report);
    assert.equal(claim.claim, "unknown");
    assert.equal(claim.reasons.includes("nonstandard-profile"), true);

    const outputStat = await lstat(expectedOutput);
    assert.equal(outputStat.isFile(), true);
    assert.equal(outputStat.mode & 0o777, 0o600);
    assert.equal(outputStat.nlink, 1);
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
