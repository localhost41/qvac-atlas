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
export { DEFAULT_EXECUTOR_LIMITS, type ExecutorLimits } from "./supervisor.js";

export function issueSyntheticModelGrantForTest(): QvacModelExecutionGrant {
  return internalIssueSyntheticModelGrant();
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
