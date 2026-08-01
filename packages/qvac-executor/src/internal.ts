import type { ResolvedSdkHandle } from "@qvac-atlas/qvac-resolver";

import {
  internalConfigureExecutor,
  ProjectLocalQvacExecutor,
  type InternalExecutorOptions,
} from "./executor.js";
import {
  internalIssueSyntheticModelGrant,
  type QvacModelExecutionGrant,
} from "./model-grant.js";
import type { ArtifactExecutionMaterial } from "@qvac-atlas/model-artifact/executor-bridge";
export { DEFAULT_EXECUTOR_LIMITS, type ExecutorLimits } from "./supervisor.js";

export function issueSyntheticModelGrantForTest(
  material: ArtifactExecutionMaterial = Object.freeze({
    canonicalPath: "/qvac-atlas-synthetic-artifact.gguf",
    byteLength: 1,
    sha256: "0".repeat(64),
    engine: "llamacpp-completion",
  }),
): QvacModelExecutionGrant {
  return internalIssueSyntheticModelGrant(material);
}

export function createSyntheticExecutorForTest(options: {
  sdkHandle: ResolvedSdkHandle;
  modelGrant: QvacModelExecutionGrant;
  internal?: InternalExecutorOptions;
}): ProjectLocalQvacExecutor {
  const executor = new ProjectLocalQvacExecutor(
    options.sdkHandle,
    options.modelGrant,
  );
  if (options.internal !== undefined)
    internalConfigureExecutor(executor, options.internal);
  return executor;
}
