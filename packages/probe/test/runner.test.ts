import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeRunnerExecutor,
  StructuredRunnerAdapter,
  type RunnerExecutor,
} from "../src/runner.js";

for (const scenario of [
  "success",
  "missing-qvac",
  "worker-crash",
  "timeout",
] as const) {
  test(`strict runner accepts the ${scenario} fixture`, async () => {
    const evidence = await new StructuredRunnerAdapter(
      new FakeRunnerExecutor(scenario),
    ).run();
    assert.notEqual(evidence.result.failure.code, "RUNNER_EVENT_REJECTED");
  });
}

test("worker crash before inference records backend as not reached", async () => {
  const evidence = await new StructuredRunnerAdapter(
    new FakeRunnerExecutor("worker-crash"),
  ).run();
  assert.equal(evidence.backend_observation.status, "not-reached");
});

test("model-load timeout cannot claim a backend before inference", async () => {
  const evidence = await new StructuredRunnerAdapter(
    new FakeRunnerExecutor("timeout"),
  ).run();
  assert.equal(evidence.backend_observation.status, "not-reached");
});

test("hostile extra fields and private paths are replaced with fixed unknown evidence", async () => {
  const executors: RunnerExecutor[] = [
    {
      execute: async () => [
        {
          type: "phase",
          name: "qvac-import",
          status: "unknown",
          duration_ms: null,
          path: "/Users/private/sdk.js",
        },
      ],
    },
    {
      execute: async () => [
        {
          type: "result",
          workload_status: "unknown",
          completion_observed: false,
          failure: {
            category: "unknown",
            phase: null,
            code: null,
            sanitized_excerpt: "/home/private/model",
          },
        },
      ],
    },
    {
      execute: async () => [
        {
          type: "result",
          workload_status: "unknown",
          completion_observed: false,
          failure: {
            category: "unknown",
            phase: null,
            code: null,
            sanitized_excerpt: "normalized but still contributor-controlled",
          },
        },
      ],
    },
    {
      execute: async () => {
        throw new Error("/Users/private/sdk.js");
      },
    },
    { execute: async () => ({ not: "an array" }) as never },
  ];
  for (const executor of executors) {
    const evidence = await new StructuredRunnerAdapter(executor).run();
    assert.equal(evidence.result.failure.code, "RUNNER_EVENT_REJECTED");
    assert.equal(JSON.stringify(evidence).includes("private"), false);
  }
});

test("a backend event before inference is rejected", async () => {
  const evidence = await new StructuredRunnerAdapter({
    execute: async () => [
      { type: "phase", name: "qvac-import", status: "passed", duration_ms: 1 },
      { type: "backend", backend: "gpu" },
      { type: "phase", name: "worker-start", status: "passed", duration_ms: 1 },
      { type: "phase", name: "model-load", status: "passed", duration_ms: 1 },
      { type: "phase", name: "inference", status: "passed", duration_ms: 1 },
      {
        type: "phase",
        name: "clean-shutdown",
        status: "passed",
        duration_ms: 1,
      },
      {
        type: "termination",
        kind: "clean-exit",
        exit_code: 0,
        signal: null,
        last_completed_phase: "clean-shutdown",
      },
      {
        type: "result",
        workload_status: "passed",
        completion_observed: true,
        failure: {
          category: "none",
          phase: null,
          code: null,
          sanitized_excerpt: null,
        },
      },
    ],
  }).run();
  assert.equal(evidence.result.failure.code, "RUNNER_EVENT_REJECTED");
});
