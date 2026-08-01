import assert from "node:assert/strict";
import { userInfo } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtifactError,
  createPinnedArtifactDisclosure,
} from "@qvac-atlas/model-artifact";

import {
  ProductionRealCoordinator,
  type RealCoordinatorPorts,
} from "../src/real-coordinator.js";

const root = path.resolve("/synthetic/project");
const privateCanary = "/Users/private/sdk/dist/index.js";

function successfulEvents(): readonly unknown[] {
  return [
    { type: "phase", name: "qvac-import", status: "passed", duration_ms: 1 },
    { type: "phase", name: "worker-start", status: "passed", duration_ms: 1 },
    { type: "phase", name: "model-load", status: "passed", duration_ms: 1 },
    { type: "phase", name: "inference", status: "passed", duration_ms: 1 },
    { type: "backend", backend: "gpu" },
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
  ];
}

function harness(overrides: Partial<RealCoordinatorPorts> = {}) {
  const calls: string[] = [];
  const handle = { privateCanary } as never;
  const capability = { privateCanary } as never;
  const grant = { privateCanary } as never;
  let clock = 10;
  const ports: RealCoordinatorPorts = {
    platform: "darwin",
    canonicalizeRoot: async () => {
      calls.push("canonicalize");
      return root;
    },
    resolveSdk: async () => {
      calls.push("resolve");
      return {
        status: "resolved",
        code: "qvac-sdk-resolved",
        sdkVersion: "0.16.0",
        handle,
      };
    },
    getSdkBinding: () => {
      calls.push("binding");
      return { projectRoot: root, sdkVersion: "0.16.0" };
    },
    runDoctor: async () => {
      calls.push("doctor");
      return { status: "passed", reason: "completed", duration_ms: 2 };
    },
    acquire: async ({ decide }) => {
      calls.push("acquire");
      const disclosure = createPinnedArtifactDisclosure(
        path.join(userInfo().homedir, ".qvac-atlas-models"),
      );
      assert.equal(decide(disclosure), true);
      return capability;
    },
    createGrant: (received) => {
      calls.push("grant");
      assert.equal(received, capability);
      return grant;
    },
    createExecutor: (receivedHandle, receivedGrant) => {
      calls.push("executor:create");
      assert.equal(receivedHandle, handle);
      assert.equal(receivedGrant, grant);
      return {
        execute: async () => {
          calls.push("executor:execute");
          return successfulEvents();
        },
      };
    },
    verifyContainedDisclosure: () => {
      calls.push("verify-disclosure");
      return true;
    },
    now: () => clock++,
    ...overrides,
  };
  return { calls, ports };
}

test("coordinator preserves one continuous private authority chain", async () => {
  const state = harness();
  const coordinator = new ProductionRealCoordinator(root, state.ports);
  const signal = new AbortController().signal;
  const resolution = await coordinator.resolve(signal);
  assert.equal(resolution.status, "resolved");
  const doctor = await coordinator.runDoctor(signal);
  assert.equal(doctor.status, "completed");
  const workload = await coordinator.runWorkload(signal);
  assert.equal(workload.status, "executed");
  assert.deepEqual(state.calls, [
    "canonicalize",
    "resolve",
    "binding",
    "doctor",
    "acquire",
    "verify-disclosure",
    "grant",
    "executor:create",
    "executor:execute",
  ]);
  assert.equal(
    JSON.stringify([resolution, doctor, workload]).includes(privateCanary),
    false,
  );
  assert.deepEqual(await coordinator.resolve(signal), { status: "failed" });
  assert.deepEqual(await coordinator.runDoctor(signal), {
    status: "preflight-failed",
  });
  assert.deepEqual(await coordinator.runWorkload(signal), {
    status: "preflight-failed",
  });
});

test("concurrent and failed stages are consumed rather than retried", async () => {
  let release!: () => void;
  const state = harness({
    canonicalizeRoot: () =>
      new Promise((resolve) => {
        release = () => resolve(root);
      }),
  });
  const coordinator = new ProductionRealCoordinator(root, state.ports);
  const signal = new AbortController().signal;
  const pending = coordinator.resolve(signal);
  while (release === undefined) await Promise.resolve();
  assert.deepEqual(await coordinator.resolve(signal), { status: "failed" });
  release();
  assert.equal((await pending).status, "resolved");

  let releaseDoctor!: () => void;
  const doctorState = harness({
    runDoctor: () =>
      new Promise((resolve) => {
        releaseDoctor = () =>
          resolve({ status: "passed", reason: "completed", duration_ms: 1 });
      }),
  });
  const doctorCoordinator = new ProductionRealCoordinator(
    root,
    doctorState.ports,
  );
  await doctorCoordinator.resolve(signal);
  const doctorPending = doctorCoordinator.runDoctor(signal);
  while (releaseDoctor === undefined) await Promise.resolve();
  assert.deepEqual(await doctorCoordinator.runDoctor(signal), {
    status: "preflight-failed",
  });
  releaseDoctor();
  assert.equal((await doctorPending).status, "completed");
});

test("contained approval must be exact, invoked once, and actually honored", async () => {
  for (const acquire of [
    async () => ({ privateCanary }) as never,
    async ({ decide }: Parameters<RealCoordinatorPorts["acquire"]>[0]) => {
      decide({ candidate: { id: "forged" } } as never);
      return { privateCanary } as never;
    },
    async ({ decide }: Parameters<RealCoordinatorPorts["acquire"]>[0]) => {
      const disclosure = createPinnedArtifactDisclosure(
        path.join(userInfo().homedir, ".qvac-atlas-models"),
      );
      decide(disclosure);
      decide(disclosure);
      return { privateCanary } as never;
    },
  ]) {
    const calls: string[] = [];
    const state = harness({
      acquire,
      createGrant: () => {
        calls.push("grant");
        return {} as never;
      },
      verifyContainedDisclosure: (value) => value.candidate.id !== "forged",
    });
    const coordinator = new ProductionRealCoordinator(root, state.ports);
    const signal = new AbortController().signal;
    await coordinator.resolve(signal);
    await coordinator.runDoctor(signal);
    assert.deepEqual(await coordinator.runWorkload(signal), {
      status: "preflight-failed",
    });
    assert.deepEqual(calls, []);
  }
});

test("cleanup failure takes precedence over concurrent abort", async () => {
  const controller = new AbortController();
  const doctorState = harness({
    runDoctor: async () => {
      controller.abort();
      throw new Error("doctor-cleanup-failed");
    },
  });
  const doctor = new ProductionRealCoordinator(root, doctorState.ports);
  await doctor.resolve(new AbortController().signal);
  assert.deepEqual(await doctor.runDoctor(controller.signal), {
    status: "preflight-failed",
  });

  const executorController = new AbortController();
  const executorState = harness({
    createExecutor: () => ({
      execute: async () => {
        executorController.abort();
        throw new Error("executor-cleanup-failed");
      },
    }),
  });
  const executor = new ProductionRealCoordinator(root, executorState.ports);
  await executor.resolve(new AbortController().signal);
  await executor.runDoctor(new AbortController().signal);
  assert.deepEqual(await executor.runWorkload(executorController.signal), {
    status: "preflight-failed",
  });

  const artifactController = new AbortController();
  const downstream: string[] = [];
  const artifactState = harness({
    acquire: async () => {
      artifactController.abort();
      throw new ArtifactError("artifact-cleanup-failed");
    },
    createGrant: () => {
      downstream.push("grant");
      return {} as never;
    },
    createExecutor: () => {
      downstream.push("executor");
      return { execute: async () => [] };
    },
  });
  const artifact = new ProductionRealCoordinator(root, artifactState.ports);
  await artifact.resolve(new AbortController().signal);
  await artifact.runDoctor(new AbortController().signal);
  assert.deepEqual(await artifact.runWorkload(artifactController.signal), {
    status: "preflight-failed",
  });
  assert.deepEqual(downstream, []);
});

test("settled acquisition abort remains an abort", async () => {
  const controller = new AbortController();
  const state = harness({
    acquire: async () => {
      controller.abort();
      throw new ArtifactError("artifact-acquisition-aborted");
    },
  });
  const coordinator = new ProductionRealCoordinator(root, state.ports);
  await coordinator.resolve(new AbortController().signal);
  await coordinator.runDoctor(new AbortController().signal);
  assert.deepEqual(await coordinator.runWorkload(controller.signal), {
    status: "aborted",
  });
});
