import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ResolvedSdkHandle } from "@qvac-atlas/qvac-resolver";
import { launchResolvedSdkChild } from "@qvac-atlas/qvac-resolver/internal";
import type { ArtifactExecutionMaterial } from "@qvac-atlas/model-artifact/executor-bridge";

import {
  internalConsumeIssuedModelGrant,
  type QvacModelExecutionGrant,
} from "./model-grant.js";
import {
  DEFAULT_EXECUTOR_LIMITS,
  ExecutorSupervisor,
  notStartedEvents,
  type ExecutorLimits,
} from "./supervisor.js";

export interface InternalExecutorOptions {
  platform?: NodeJS.Platform;
  runnerPath?: string;
  limits?: ExecutorLimits;
  sourceEnv?: NodeJS.ProcessEnv;
  tempParent?: string;
  artifactBootstrapOverride?: unknown | null;
}

const internalOptions = new WeakMap<
  ProjectLocalQvacExecutor,
  InternalExecutorOptions
>();

/**
 * A dormant real lifecycle executor. Its artifact-bound grant issuer cannot be
 * reached without acquisition consent and remains absent from probe and CLI.
 */
export class ProjectLocalQvacExecutor {
  readonly #sdkHandle: ResolvedSdkHandle;
  readonly #modelGrant: QvacModelExecutionGrant;
  #used = false;

  constructor(
    sdkHandle: ResolvedSdkHandle,
    modelGrant: QvacModelExecutionGrant,
  ) {
    this.#sdkHandle = sdkHandle;
    this.#modelGrant = modelGrant;
  }

  async execute(): Promise<readonly unknown[]> {
    const configured = internalOptions.get(this) ?? {};
    if ((configured.platform ?? process.platform) === "win32") {
      return notStartedEvents("WINDOWS_CONTAINMENT_UNAVAILABLE");
    }
    const artifact = internalConsumeIssuedModelGrant(this.#modelGrant);
    if (this.#used || artifact === undefined) {
      return notStartedEvents("MODEL_EXECUTION_GRANT_INVALID");
    }
    this.#used = true;

    let tempCwd: string | undefined;
    const supervisor = new ExecutorSupervisor(
      configured.limits ?? DEFAULT_EXECUTOR_LIMITS,
    );
    try {
      const tempParent = configured.tempParent ?? os.tmpdir();
      tempCwd = await mkdtemp(path.join(tempParent, "qvac-atlas-executor-"));
      const runnerPath =
        configured.runnerPath ??
        fileURLToPath(new URL("./child-runner.js", import.meta.url));
      await launchResolvedSdkChild({
        handle: this.#sdkHandle,
        runnerPath,
        tempCwd,
        sourceEnv: configured.sourceEnv,
        beforeBootstrap(child) {
          supervisor.attach(child);
        },
        async afterSdkBootstrapSent(child) {
          const configuredMessage = configured.artifactBootstrapOverride;
          if (configuredMessage === null) return;
          const message =
            configuredMessage === undefined
              ? createArtifactBootstrapMessage(artifact)
              : configuredMessage;
          await sendArtifactBootstrap(child, message);
        },
      });
      return await supervisor.wait();
    } catch {
      supervisor.disposeAfterLaunchFailure();
      return notStartedEvents("QVAC_CHILD_LAUNCH_FAILED");
    } finally {
      if (tempCwd !== undefined) {
        await rm(tempCwd, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

function createArtifactBootstrapMessage(material: ArtifactExecutionMaterial): {
  readonly type: "qvac-atlas-model-artifact-v1";
  readonly canonicalPath: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly engine: "llamacpp-completion";
} {
  return Object.freeze({
    type: "qvac-atlas-model-artifact-v1",
    canonicalPath: material.canonicalPath,
    byteLength: material.byteLength,
    sha256: material.sha256,
    engine: material.engine,
  });
}

async function sendArtifactBootstrap(
  child: import("node:child_process").ChildProcess,
  message: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.send(message as Parameters<typeof child.send>[0], (error) => {
      if (error) reject(new Error("artifact-bootstrap-send-failed"));
      else resolve();
    });
  });
}

export function internalConfigureExecutor(
  executor: ProjectLocalQvacExecutor,
  options: InternalExecutorOptions,
): void {
  internalOptions.set(executor, Object.freeze({ ...options }));
}
