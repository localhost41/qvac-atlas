import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assembleFixtureReport,
  StructuredRunnerAdapter,
  validateLocalReport,
} from "@qvac-atlas/probe";
import { resolveProjectLocalSdk } from "@qvac-atlas/qvac-resolver";

import {
  createSyntheticExecutorForTest,
  issueSyntheticModelGrantForTest,
} from "../dist/internal.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const matrixRunner = path.join(
  packageRoot,
  "test",
  "fixtures",
  "protocol-matrix-runner.mjs",
);
const PRIVATE_CANARY = "/Users/private/qvac-secret-token";
const TEST_SETTLE_MS = 1_500;

const exactSdkManifest = {
  name: "@qvac/sdk",
  version: "0.16.0",
  type: "module",
  main: "./dist/index.js",
  exports: {
    ".": { import: "./dist/index.js", require: "./dist/index.js" },
    "./package": "./package.json",
  },
  license: "Apache-2.0",
};

const phase = (sequence, phaseName, state) => ({
  type: "phase",
  sequence,
  phase: phaseName,
  state,
});
const backend = (sequence, value = "gpu") => ({
  type: "backend",
  sequence,
  backend: value,
});

function completedLifecycle() {
  return [
    phase(0, "qvac-import", "started"),
    phase(1, "qvac-import", "succeeded"),
    phase(2, "worker-start", "started"),
    phase(3, "worker-start", "succeeded"),
    phase(4, "model-load", "started"),
    phase(5, "model-load", "succeeded"),
    phase(6, "inference", "started"),
    backend(7),
    phase(8, "inference", "succeeded"),
    phase(9, "clean-shutdown", "started"),
    phase(10, "clean-shutdown", "succeeded"),
  ];
}

const lifecyclePhases = [
  "qvac-import",
  "worker-start",
  "model-load",
  "inference",
  "clean-shutdown",
];

function messagesBeforePhase(target, includeStarted) {
  const messages = [];
  let sequence = 0;
  for (const phaseName of lifecyclePhases) {
    if (phaseName === target) {
      if (includeStarted)
        messages.push(phase(sequence++, phaseName, "started"));
      break;
    }
    messages.push(
      phase(sequence++, phaseName, "started"),
      phase(sequence++, phaseName, "succeeded"),
    );
  }
  return messages;
}

function fastLimits(overrides = {}) {
  const { phaseMs = {}, ...rest } = overrides;
  return {
    overallMs: 400,
    phaseMs: {
      "qvac-import": 120,
      "worker-start": 120,
      "model-load": 120,
      inference: 120,
      "clean-shutdown": 120,
      ...phaseMs,
    },
    termGraceMs: 40,
    killSettleMs: 500,
    postExitSweepMs: 5,
    maxEvents: 16,
    maxEventBytes: 4 * 1024,
    maxAggregateEventBytes: 16 * 1024,
    maxOutputBytes: 4 * 1024,
    ...rest,
  };
}

async function makeProject() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "qvac-executor-matrix-project-"),
  );
  const sdkRoot = path.join(root, "node_modules", "@qvac", "sdk");
  await mkdir(path.join(sdkRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ private: true, dependencies: { "@qvac/sdk": "0.16.0" } }),
  );
  await writeFile(
    path.join(sdkRoot, "package.json"),
    JSON.stringify(exactSdkManifest),
  );
  await writeFile(
    path.join(sdkRoot, "dist", "index.js"),
    "export const fixture = true\n",
  );
  const resolved = await resolveProjectLocalSdk(root);
  assert.equal(resolved.status, "resolved");
  return { root, handle: resolved.handle };
}

async function assembleAndValidate(events) {
  const runner = await new StructuredRunnerAdapter({
    execute: async () => events,
  }).run();
  const report = assembleFixtureReport({
    fixtureId: "worker-crash",
    createdAt: "2026-07-31T00:00:00.000Z",
    publication: false,
    platform: {
      os: { family: "macos", version: "24.5.0", build: null },
      architecture: "arm64",
      cpu: {
        vendor: "Apple",
        model: "Apple M3 Pro",
        family: null,
        feature_flags: [],
      },
      memory_bucket: "16-31-gib",
      gpus: [],
    },
    nodeVersion: "22.17.0",
    qvac: {
      discovery: { status: "passed", reason: "completed", duration_ms: 1 },
      sdk_version: "0.16.0",
      packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
    },
    doctor: { status: "passed", reason: "completed", duration_ms: 1 },
    runner,
  });
  validateLocalReport(report);
  return runner;
}

async function runMatrixCase(project, scenario, limitOverrides = {}) {
  const caseRoot = await mkdtemp(
    path.join(os.tmpdir(), "qvac-executor-protocol-case-"),
  );
  try {
    await writeFile(
      path.join(caseRoot, "protocol-matrix-case.json"),
      JSON.stringify(scenario),
    );
    const executor = createSyntheticExecutorForTest({
      sdkHandle: project.handle,
      modelGrant: issueSyntheticModelGrantForTest(),
      internal: {
        runnerPath: matrixRunner,
        tempParent: caseRoot,
        sourceEnv: { ...process.env, TMPDIR: caseRoot },
        limits: fastLimits(limitOverrides),
      },
    });
    const startedAt = performance.now();
    let settleTimer;
    const events = await Promise.race([
      executor.execute(),
      new Promise((_, reject) => {
        settleTimer = setTimeout(
          () => reject(new Error("matrix-parent-did-not-settle")),
          TEST_SETTLE_MS,
        );
      }),
    ]).finally(() => clearTimeout(settleTimer));
    assert.ok(performance.now() - startedAt < TEST_SETTLE_MS);
    assert.ok(events.length <= 8);
    const serialized = JSON.stringify(events);
    for (const forbidden of [PRIVATE_CANARY, project.root, caseRoot]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    const runner = await assembleAndValidate(events);
    assert.notEqual(runner.result.failure.code, "RUNNER_EVENT_REJECTED");
    const { type: resultType, ...executorResult } = events.at(-1);
    assert.equal(resultType, "result");
    assert.deepEqual(runner.result, executorResult);
    return { events, runner };
  } finally {
    await rm(caseRoot, { recursive: true, force: true });
  }
}

function assertFixedOutcome({ events, runner }, expected) {
  const termination = events.at(-2);
  const result = events.at(-1);
  assert.equal(termination.type, "termination");
  assert.equal(result.type, "result");
  assert.equal(result.failure.sanitized_excerpt, null);
  const { type: _resultType, ...executorResult } = result;
  assert.deepEqual(runner.result, executorResult);
  if ("terminationKind" in expected)
    assert.equal(termination.kind, expected.terminationKind);
  if ("exitCode" in expected)
    assert.equal(termination.exit_code, expected.exitCode);
  if ("signal" in expected) assert.equal(termination.signal, expected.signal);
  if ("lastCompletedPhase" in expected)
    assert.equal(termination.last_completed_phase, expected.lastCompletedPhase);
  if ("workloadStatus" in expected)
    assert.equal(result.workload_status, expected.workloadStatus);
  if ("category" in expected)
    assert.equal(result.failure.category, expected.category);
  if ("phase" in expected) assert.equal(result.failure.phase, expected.phase);
  if ("code" in expected) assert.equal(result.failure.code, expected.code);
}

function eventsForPhase(events, phaseName) {
  return events.find(
    (event) => event.type === "phase" && event.name === phaseName,
  );
}

const protocolInvalid = (phaseName) => ({
  terminationKind: "unknown",
  workloadStatus: "unknown",
  category: "unknown",
  phase: phaseName,
  code: "RUNNER_PROTOCOL_INVALID",
});

test("malformed primitive and object messages fail closed", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const cases = [
    ["null", null],
    ["boolean", true],
    ["number", 42],
    ["string with path canary", PRIVATE_CANARY],
    ["array", ["phase", PRIVATE_CANARY]],
    ["empty object", {}],
    ["unknown type", { type: "private", sequence: 0 }],
    [
      "missing phase state",
      { type: "phase", sequence: 0, phase: "qvac-import" },
    ],
    [
      "extra path key",
      {
        ...phase(0, "qvac-import", "started"),
        path: PRIVATE_CANARY,
      },
    ],
    ["unsafe phase value", phase(0, PRIVATE_CANARY, "started")],
    ["invalid phase state", phase(0, "qvac-import", "private")],
    [
      "string sequence",
      { ...phase(0, "qvac-import", "started"), sequence: "0" },
    ],
    ["negative sequence", phase(-1, "qvac-import", "started")],
    ["fractional sequence", phase(0.5, "qvac-import", "started")],
    [
      "unsafe integer sequence",
      phase(Number.MAX_SAFE_INTEGER + 1, "qvac-import", "started"),
    ],
    ["invalid backend", backend(0, "cuda")],
  ];
  for (const [name, message] of cases) {
    await t.test(name, async () => {
      const outcome = await runMatrixCase(project, { messages: [message] });
      assertFixedOutcome(outcome, protocolInvalid("qvac-import"));
    });
  }
});

test("duplicate, skipped, reordered, and noncontiguous phases fail closed", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const cases = [
    {
      name: "duplicate phase start",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "started"),
      ],
      phase: "qvac-import",
    },
    {
      name: "completion without start",
      messages: [phase(0, "qvac-import", "succeeded")],
      phase: "qvac-import",
    },
    {
      name: "skipped worker-start",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "succeeded"),
        phase(2, "model-load", "started"),
      ],
      phase: "worker-start",
    },
    {
      name: "reordered first phase",
      messages: [phase(0, "worker-start", "started")],
      phase: "qvac-import",
    },
    {
      name: "wrong phase completion",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "worker-start", "succeeded"),
      ],
      phase: "qvac-import",
    },
    {
      name: "duplicate completed phase",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "succeeded"),
        phase(2, "qvac-import", "started"),
      ],
      phase: "worker-start",
    },
    {
      name: "normal phase after failure instead of cleanup",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "failed"),
        phase(2, "model-load", "started"),
      ],
      phase: "clean-shutdown",
    },
    {
      name: "skipped sequence number",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(2, "qvac-import", "succeeded"),
      ],
      phase: "qvac-import",
    },
    {
      name: "duplicate sequence number",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(0, "qvac-import", "succeeded"),
      ],
      phase: "qvac-import",
    },
    {
      name: "sequence starts at one",
      messages: [phase(1, "qvac-import", "started")],
      phase: "qvac-import",
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const outcome = await runMatrixCase(project, {
        messages: scenario.messages,
      });
      assertFixedOutcome(outcome, protocolInvalid(scenario.phase));
    });
  }
});

test("early, duplicate, late, and post-terminal backend events fail closed", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const inferenceStarted = messagesBeforePhase("inference", true);
  const cases = [
    {
      name: "backend before first phase",
      messages: [backend(0)],
      phase: "qvac-import",
    },
    {
      name: "backend during model-load",
      messages: [...messagesBeforePhase("model-load", true), backend(5)],
      phase: "model-load",
    },
    {
      name: "duplicate backend during inference",
      messages: [...inferenceStarted, backend(7), backend(8, "cpu")],
      phase: "inference",
    },
    {
      name: "invalid backend during inference",
      messages: [...inferenceStarted, backend(7, "cuda")],
      phase: "inference",
    },
    {
      name: "backend after inference completion",
      messages: [
        ...inferenceStarted,
        backend(7),
        phase(8, "inference", "succeeded"),
        backend(9),
      ],
      phase: "clean-shutdown",
    },
    {
      name: "backend after terminal phase",
      messages: [...completedLifecycle(), backend(11)],
      phase: "clean-shutdown",
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const outcome = await runMatrixCase(project, {
        messages: scenario.messages,
      });
      assertFixedOutcome(outcome, protocolInvalid(scenario.phase));
    });
  }
});

test("every message after terminal lifecycle completion fails closed", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const cases = [
    [
      "duplicate clean-shutdown",
      [
        phase(11, "clean-shutdown", "started"),
        phase(12, "clean-shutdown", "succeeded"),
      ],
    ],
    ["restarted qvac-import", [phase(11, "qvac-import", "started")]],
    ["post-terminal primitive", [PRIVATE_CANARY]],
  ];
  for (const [name, tail] of cases) {
    await t.test(name, async () => {
      const outcome = await runMatrixCase(project, {
        messages: [...completedLifecycle(), ...tail],
        termination: { kind: "exit", code: 0 },
      });
      assertFixedOutcome(outcome, protocolInvalid("clean-shutdown"));
    });
  }
});

test("per-message, aggregate-byte, and event-count boundaries are exact", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const messages = [
    phase(0, "qvac-import", "started"),
    phase(1, "qvac-import", "succeeded"),
  ];
  const sizes = messages.map((message) =>
    Buffer.byteLength(JSON.stringify(message)),
  );
  const maxMessageBytes = Math.max(...sizes);
  const aggregateBytes = sizes.reduce((total, size) => total + size, 0);
  const accepted = {
    terminationKind: "clean-exit",
    workloadStatus: "unknown",
    category: "unknown",
    phase: "worker-start",
    code: "RUNNER_EXIT_UNEXPECTED",
  };
  const cases = [
    {
      name: "per-message exact limit",
      limits: { maxEventBytes: maxMessageBytes },
      expected: accepted,
    },
    {
      name: "per-message one-byte overflow",
      limits: { maxEventBytes: maxMessageBytes - 1 },
      expected: protocolInvalid("qvac-import"),
    },
    {
      name: "aggregate exact limit",
      limits: { maxAggregateEventBytes: aggregateBytes },
      expected: accepted,
    },
    {
      name: "aggregate one-byte overflow",
      limits: { maxAggregateEventBytes: aggregateBytes - 1 },
      expected: protocolInvalid("qvac-import"),
    },
    {
      name: "event-count exact limit",
      limits: { maxEvents: messages.length },
      expected: accepted,
    },
    {
      name: "event-count one-event overflow",
      limits: { maxEvents: messages.length - 1 },
      expected: protocolInvalid("qvac-import"),
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const outcome = await runMatrixCase(
        project,
        { messages, termination: { kind: "exit", code: 0 } },
        scenario.limits,
      );
      assertFixedOutcome(outcome, scenario.expected);
    });
  }
});

test("hangs before and during every lifecycle phase settle at that phase deadline", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  for (const phaseName of lifecyclePhases) {
    for (const position of ["before", "during"]) {
      await t.test(`${position} ${phaseName}`, async () => {
        const outcome = await runMatrixCase(
          project,
          {
            messages: messagesBeforePhase(phaseName, position === "during"),
          },
          {
            overallMs: 500,
            phaseMs: { [phaseName]: 60 },
          },
        );
        assertFixedOutcome(outcome, {
          terminationKind: "timeout",
          workloadStatus: "failed",
          category: "timeout",
          phase: phaseName,
          code: `${phaseName.replaceAll("-", "_").toUpperCase()}_TIMEOUT`,
        });
      });
    }
  }
});

test("overall deadline after terminal phases is fixed inconclusive evidence", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const outcome = await runMatrixCase(
    project,
    { messages: completedLifecycle() },
    {
      overallMs: 70,
      phaseMs: Object.fromEntries(
        lifecyclePhases.map((phaseName) => [phaseName, 500]),
      ),
    },
  );
  assertFixedOutcome(outcome, {
    terminationKind: "timeout",
    lastCompletedPhase: "clean-shutdown",
    workloadStatus: "unknown",
    category: "unknown",
    phase: "clean-shutdown",
    code: "TIMEOUT_AFTER_LIFECYCLE",
  });
});

test("root exit, code, and signal combinations remain bounded at every stage", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const stages = [
    {
      name: "before lifecycle",
      messages: [],
      clean: {
        workloadStatus: "unknown",
        category: "unknown",
        phase: "qvac-import",
        code: "RUNNER_EXIT_UNEXPECTED",
      },
      nonzero: {
        workloadStatus: "failed",
        category: "native-runtime",
        phase: "qvac-import",
        code: "QVAC_IMPORT_FAILED",
      },
      signal: {
        workloadStatus: "failed",
        category: "worker-crash",
        phase: "qvac-import",
        code: "WORKER_SIGNAL",
      },
    },
    {
      name: "during worker-start",
      messages: messagesBeforePhase("worker-start", true),
      clean: {
        workloadStatus: "unknown",
        category: "unknown",
        phase: "worker-start",
        code: "RUNNER_EXIT_UNEXPECTED",
      },
      nonzero: {
        workloadStatus: "failed",
        category: "workload-failed",
        phase: "worker-start",
        code: "WORKER_START_FAILED",
      },
      signal: {
        workloadStatus: "failed",
        category: "worker-crash",
        phase: "worker-start",
        code: "WORKER_SIGNAL",
      },
    },
    {
      name: "after terminal phases",
      messages: completedLifecycle(),
      clean: {
        workloadStatus: "passed",
        category: "none",
        phase: null,
        code: null,
      },
      nonzero: {
        workloadStatus: "unknown",
        category: "unknown",
        phase: "clean-shutdown",
        code: "RUNNER_EXIT_UNEXPECTED",
      },
      signal: {
        workloadStatus: "unknown",
        category: "unknown",
        phase: "clean-shutdown",
        code: "SIGNAL_AFTER_LIFECYCLE",
      },
    },
  ];
  for (const stage of stages) {
    await t.test(`${stage.name}: clean exit`, async () => {
      const outcome = await runMatrixCase(project, {
        messages: stage.messages,
        termination: { kind: "exit", code: 0 },
      });
      assertFixedOutcome(outcome, {
        terminationKind: "clean-exit",
        exitCode: 0,
        ...stage.clean,
      });
      if (stage.name !== "after terminal phases") {
        const { type: phaseType, ...reportedPhase } = eventsForPhase(
          outcome.events,
          stage.clean.phase,
        );
        assert.equal(phaseType, "phase");
        assert.deepEqual(reportedPhase, {
          name: stage.clean.phase,
          status: "unknown",
          duration_ms: null,
        });
      }
    });
    await t.test(`${stage.name}: nonzero exit`, async () => {
      const outcome = await runMatrixCase(project, {
        messages: stage.messages,
        termination: { kind: "exit", code: 7 },
      });
      assertFixedOutcome(outcome, {
        terminationKind: "exit-code",
        exitCode: 7,
        ...stage.nonzero,
      });
    });
    await t.test(`${stage.name}: signal`, async () => {
      const outcome = await runMatrixCase(project, {
        messages: stage.messages,
        termination: { kind: "signal", signal: "SIGTERM" },
      });
      assertFixedOutcome(outcome, {
        terminationKind: "signal",
        signal: "SIGTERM",
        ...stage.signal,
      });
    });
  }
});

test("clean root exits between phases identify the next expected phase", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const cases = [
    ["worker-start", "qvac-import"],
    ["model-load", "worker-start"],
    ["inference", "model-load"],
    ["clean-shutdown", "inference"],
  ];
  for (const [expectedPhase, lastCompletedPhase] of cases) {
    await t.test(`after ${lastCompletedPhase}`, async () => {
      const outcome = await runMatrixCase(project, {
        messages: messagesBeforePhase(expectedPhase, false),
        termination: { kind: "exit", code: 0 },
      });
      assert.deepEqual(eventsForPhase(outcome.events, expectedPhase), {
        type: "phase",
        name: expectedPhase,
        status: "unknown",
        duration_ms: null,
      });
      assertFixedOutcome(outcome, {
        terminationKind: "clean-exit",
        exitCode: 0,
        lastCompletedPhase,
        workloadStatus: "unknown",
        category: "unknown",
        phase: expectedPhase,
        code: "RUNNER_EXIT_UNEXPECTED",
      });
    });
  }
});

test("premature clean exit after backend suppresses the uncompleted observation", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const outcome = await runMatrixCase(project, {
    messages: [...messagesBeforePhase("inference", true), backend(7)],
    termination: { kind: "exit", code: 0 },
  });
  assert.equal(
    outcome.events.some((event) => event.type === "backend"),
    false,
  );
  assert.deepEqual(outcome.runner.backend_observation, {
    status: "not-reached",
    backend: null,
    method: "unavailable",
  });
  assert.deepEqual(eventsForPhase(outcome.events, "inference"), {
    type: "phase",
    name: "inference",
    status: "unknown",
    duration_ms: null,
  });
  assertFixedOutcome(outcome, {
    terminationKind: "clean-exit",
    exitCode: 0,
    workloadStatus: "unknown",
    category: "unknown",
    phase: "inference",
    code: "RUNNER_EXIT_UNEXPECTED",
  });
});

test("explicit failed phase plus clean root exit preserves only schema-supported failure", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const cases = [
    {
      name: "qvac-import failure becomes inconclusive",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "failed"),
      ],
      expected: {
        terminationKind: "clean-exit",
        exitCode: 0,
        workloadStatus: "unknown",
        category: "unknown",
        phase: "qvac-import",
        code: "RUNNER_EXIT_UNEXPECTED",
      },
    },
    {
      name: "qvac-import failure with completed cleanup becomes inconclusive",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "failed"),
        phase(2, "clean-shutdown", "started"),
        phase(3, "clean-shutdown", "succeeded"),
      ],
      expected: {
        terminationKind: "clean-exit",
        exitCode: 0,
        workloadStatus: "unknown",
        category: "unknown",
        phase: "qvac-import",
        code: "RUNNER_EXIT_UNEXPECTED",
      },
    },
    {
      name: "worker-start failure remains defined",
      messages: [
        phase(0, "qvac-import", "started"),
        phase(1, "qvac-import", "succeeded"),
        phase(2, "worker-start", "started"),
        phase(3, "worker-start", "failed"),
      ],
      expected: {
        terminationKind: "clean-exit",
        exitCode: 0,
        workloadStatus: "failed",
        category: "workload-failed",
        phase: "worker-start",
        code: "WORKER_START_FAILED",
      },
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const outcome = await runMatrixCase(project, {
        messages: scenario.messages,
        termination: { kind: "exit", code: 0 },
      });
      assertFixedOutcome(outcome, scenario.expected);
    });
  }
});
