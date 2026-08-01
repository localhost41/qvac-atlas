import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ResolvedSdkHandle } from "@qvac-atlas/qvac-resolver";
import { launchResolvedSdkChild } from "@qvac-atlas/qvac-resolver/internal";

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
}

const internalOptions = new WeakMap<
  ProjectLocalQvacExecutor,
  InternalExecutorOptions
>();

/**
 * A dormant real lifecycle executor. It has no production model-grant issuer
 * and is intentionally absent from the probe and CLI dependency graphs.
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
    if (this.#used || !internalConsumeIssuedModelGrant(this.#modelGrant)) {
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

export function internalConfigureExecutor(
  executor: ProjectLocalQvacExecutor,
  options: InternalExecutorOptions,
): void {
  internalOptions.set(executor, Object.freeze({ ...options }));
}
