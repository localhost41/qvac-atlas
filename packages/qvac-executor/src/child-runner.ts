import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";
import {
  validateArtifactExecutionMaterial,
  type ArtifactExecutionMaterial,
} from "@qvac-atlas/model-artifact/executor-bridge";

import { receiveArtifactBootstrap } from "./artifact-bootstrap.js";
import type { ChildEvent, LifecyclePhase } from "./protocol.js";

let sequence = 0;
let activePhase: LifecyclePhase = "qvac-import";

type OutboundChildEvent =
  | Omit<Extract<ChildEvent, { type: "phase" }>, "sequence">
  | Omit<Extract<ChildEvent, { type: "backend" }>, "sequence">;

async function emit(event: OutboundChildEvent): Promise<void> {
  if (typeof process.send !== "function" || !process.connected) return;
  await new Promise<void>((resolve) => {
    process.send?.({ ...event, sequence: sequence++ }, () => resolve());
  });
}

async function phase(
  name: LifecyclePhase,
  state: "started" | "succeeded" | "failed",
): Promise<void> {
  if (state === "started") activePhase = name;
  await emit({ type: "phase", phase: name, state });
}

function requiredFunction(
  sdk: Record<string, unknown>,
  name: string,
): (...args: never[]) => unknown {
  const value = sdk[name];
  if (typeof value !== "function") throw new TypeError("invalid-sdk-shape");
  return value as (...args: never[]) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireLoadedInfo(
  value: unknown,
  modelId: string,
  artifact: ArtifactExecutionMaterial,
): void {
  if (
    !isRecord(value) ||
    value.modelId !== modelId ||
    value.isDelegated !== false ||
    value.modelType !== artifact.engine ||
    value.path !== artifact.canonicalPath
  ) {
    throw new TypeError("loaded-model-info-mismatch");
  }
}

// Both listeners and a non-rejecting aggregate exist before the first await.
const bootstrapResult = Promise.allSettled([
  receiveSdkBootstrapAndImport({ timeoutMs: 10_000 }),
  receiveArtifactBootstrap(),
]);

let sdk: Record<string, unknown> | undefined;
let artifact: ArtifactExecutionMaterial | undefined;
let modelId: string | undefined;
let pathExposed = false;
let workloadFailed = false;

try {
  await phase("qvac-import", "started");
  const received = await bootstrapResult;
  if (received[0].status === "fulfilled") sdk = received[0].value;
  if (received[1].status === "fulfilled") artifact = received[1].value;
  if (sdk === undefined || artifact === undefined) {
    throw new TypeError("bootstrap-invalid");
  }
  const heartbeat = requiredFunction(sdk, "heartbeat");
  const loadModel = requiredFunction(sdk, "loadModel");
  requiredFunction(sdk, "getLoadedModelInfo");
  requiredFunction(sdk, "completion");
  requiredFunction(sdk, "unloadModel");
  requiredFunction(sdk, "close");
  await phase("qvac-import", "succeeded");

  await phase("worker-start", "started");
  await heartbeat();
  await phase("worker-start", "succeeded");

  await phase("model-load", "started");
  await validateArtifactExecutionMaterial(artifact);
  pathExposed = true;
  const loaded = await loadModel({
    modelSrc: artifact.canonicalPath,
    modelType: "llamacpp-completion",
    modelConfig: { ctx_size: 512, device: "gpu", gpu_layers: 999 },
  } as never);
  if (typeof loaded !== "string") {
    throw new TypeError("invalid-model-id");
  }
  modelId = loaded;
  if (loaded.trim().length === 0) {
    throw new TypeError("invalid-model-id");
  }
  const getLoadedModelInfo = requiredFunction(sdk, "getLoadedModelInfo");
  const loadedInfo = await getLoadedModelInfo({ modelId } as never);
  requireLoadedInfo(loadedInfo, modelId, artifact);
  await phase("model-load", "succeeded");

  await phase("inference", "started");
  const completion = requiredFunction(sdk, "completion");
  const run = completion({
    modelId,
    history: [{ role: "user", content: "Reply with exactly: atlas" }],
    stream: true,
    generationParams: { predict: 8, seed: 1, temp: 0 },
  } as never) as { final?: PromiseLike<unknown> };
  if (
    run === null ||
    typeof run !== "object" ||
    run.final === undefined ||
    typeof run.final.then !== "function"
  ) {
    throw new TypeError("invalid-completion-run");
  }
  const final = (await run.final) as {
    contentText?: unknown;
    stats?: { backendDevice?: unknown };
  };
  if (
    final === null ||
    typeof final !== "object" ||
    typeof final.contentText !== "string" ||
    final.contentText.trim().length === 0
  ) {
    throw new TypeError("empty-completion");
  }
  const backend = final.stats?.backendDevice;
  if (backend === "cpu" || backend === "gpu") {
    await emit({ type: "backend", backend });
  }
  await phase("inference", "succeeded");
} catch {
  workloadFailed = true;
  await phase(activePhase, "failed");
} finally {
  await phase("clean-shutdown", "started");
  let cleanupFailed = false;
  if (sdk !== undefined && modelId !== undefined) {
    try {
      const unloadModel = requiredFunction(sdk, "unloadModel");
      await unloadModel({ modelId, clearStorage: false } as never);
    } catch {
      cleanupFailed = true;
    }
  }
  if (sdk !== undefined) {
    try {
      const close = requiredFunction(sdk, "close");
      await close();
    } catch {
      cleanupFailed = true;
    }
  }
  if (pathExposed && artifact !== undefined) {
    try {
      await validateArtifactExecutionMaterial(artifact);
    } catch {
      cleanupFailed = true;
    }
  }
  await phase("clean-shutdown", cleanupFailed ? "failed" : "succeeded");
  if (cleanupFailed) workloadFailed = true;
}

if (process.connected) process.disconnect();
if (workloadFailed) process.exitCode = 1;
