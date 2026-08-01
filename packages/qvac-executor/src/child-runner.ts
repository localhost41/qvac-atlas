import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

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

let sdk: Record<string, unknown> | undefined;
let modelId: string | undefined;
let workloadFailed = false;

try {
  await phase("qvac-import", "started");
  sdk = await receiveSdkBootstrapAndImport({ timeoutMs: 10_000 });
  const heartbeat = requiredFunction(sdk, "heartbeat");
  const loadModel = requiredFunction(sdk, "loadModel");
  const completion = requiredFunction(sdk, "completion");
  requiredFunction(sdk, "unloadModel");
  requiredFunction(sdk, "close");
  const modelSrc = sdk["SMOLLM2_360M_INST_Q8"];
  if (modelSrc === null || typeof modelSrc !== "object") {
    throw new TypeError("invalid-sdk-shape");
  }
  await phase("qvac-import", "succeeded");

  await phase("worker-start", "started");
  await heartbeat();
  await phase("worker-start", "succeeded");

  await phase("model-load", "started");
  const loaded = await loadModel({
    modelSrc,
    modelConfig: { ctx_size: 512, device: "gpu", gpu_layers: 999 },
    onProgress: () => {},
  } as never);
  if (typeof loaded !== "string" || loaded.length === 0) {
    throw new TypeError("invalid-model-id");
  }
  modelId = loaded;
  await phase("model-load", "succeeded");

  await phase("inference", "started");
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
  await phase("clean-shutdown", cleanupFailed ? "failed" : "succeeded");
  if (cleanupFailed) workloadFailed = true;
}

if (process.connected) process.disconnect();
if (workloadFailed) process.exitCode = 1;
