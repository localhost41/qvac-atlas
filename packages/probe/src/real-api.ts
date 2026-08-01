/** Private-workspace composition surface. It is not re-exported by the probe root. */
export {
  CANDIDATE_PUBLICATION_WARNING,
  COMBINED_WORKLOAD_DISCLOSURE,
  PROJECT_CODE_DISCLOSURE,
  REAL_PRIVACY_DISCLOSURE,
  runRealProbePipeline,
} from "./real-pipeline.js";
export type {
  RealCoordinatorBoundary,
  RealOutputBoundary,
  RealProbeDependencies,
  RealProbeInteraction,
  RealProbeOptions,
  RealProbeRunResult,
} from "./real-pipeline.js";
