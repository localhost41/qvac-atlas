import { realpath } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import {
  PINNED_MODEL_CANDIDATE,
  ArtifactError,
  createPinnedArtifactDisclosure,
  type ArtifactDisclosure,
  type VerifiedArtifactCapability,
} from "@qvac-atlas/model-artifact";
import { acquireContainedPinnedArtifact } from "@qvac-atlas/model-artifact/contained";
import {
  ProjectLocalDoctorAdapter,
  StructuredRunnerAdapter,
  type CheckEvidence,
  type RunnerEvidence,
} from "@qvac-atlas/probe";
import {
  COMBINED_WORKLOAD_DISCLOSURE,
  type RealCoordinatorBoundary,
} from "@qvac-atlas/probe/real";
import {
  ProjectLocalQvacExecutor,
  createQvacModelExecutionGrant,
  type QvacModelExecutionGrant,
} from "@qvac-atlas/qvac-executor";
import {
  resolveProjectLocalSdk,
  type ResolvedSdkHandle,
  type SdkResolutionResult,
} from "@qvac-atlas/qvac-resolver";
import { internalGetSdkBootstrapMaterial } from "@qvac-atlas/qvac-resolver/internal";

interface ExecutorLike {
  execute(signal?: AbortSignal): Promise<readonly unknown[]>;
}

export interface RealCoordinatorPorts {
  readonly platform: NodeJS.Platform;
  readonly architecture: NodeJS.Architecture;
  canonicalizeRoot(root: string): Promise<string>;
  resolveSdk(root: string): Promise<SdkResolutionResult>;
  getSdkBinding(handle: ResolvedSdkHandle): {
    readonly projectRoot: string;
    readonly sdkVersion: string;
  };
  runDoctor(root: string, signal: AbortSignal): Promise<CheckEvidence>;
  acquire(options: {
    readonly signal: AbortSignal;
    readonly decide: (disclosure: ArtifactDisclosure) => boolean;
  }): Promise<VerifiedArtifactCapability>;
  createGrant(capability: VerifiedArtifactCapability): QvacModelExecutionGrant;
  createExecutor(
    handle: ResolvedSdkHandle,
    grant: QvacModelExecutionGrant,
  ): ExecutorLike;
  verifyContainedDisclosure(disclosure: ArtifactDisclosure): boolean;
  now(): number;
}

const defaultPorts: RealCoordinatorPorts = {
  platform: process.platform,
  architecture: process.arch,
  canonicalizeRoot: (root) => realpath(root),
  resolveSdk: resolveProjectLocalSdk,
  getSdkBinding: (handle) => internalGetSdkBootstrapMaterial(handle),
  runDoctor: async (root, signal) =>
    (await new ProjectLocalDoctorAdapter().run(root, signal)).evidence,
  acquire: acquireContainedPinnedArtifact,
  createGrant: createQvacModelExecutionGrant,
  createExecutor: (handle, grant) =>
    new ProjectLocalQvacExecutor(handle, grant),
  verifyContainedDisclosure(disclosure) {
    try {
      const expected = createPinnedArtifactDisclosure(
        path.join(userInfo().homedir, ".qvac-atlas-models"),
      );
      const snapshot = structuredClone(disclosure);
      const reviewed = COMBINED_WORKLOAD_DISCLOSURE.artifact;
      return (
        isDeepStrictEqual(snapshot, expected) &&
        isDeepStrictEqual(snapshot.candidate, PINNED_MODEL_CANDIDATE) &&
        reviewed.candidateId === snapshot.candidate.id &&
        reviewed.filename === snapshot.candidate.filename &&
        reviewed.revision === snapshot.candidate.revision &&
        reviewed.sourceUrl === snapshot.candidate.sourceUrl &&
        reviewed.license === snapshot.candidate.license &&
        reviewed.byteLength === snapshot.candidate.byteLength &&
        reviewed.sha256 === snapshot.candidate.sha256 &&
        reviewed.destination ===
          `~/.qvac-atlas-models/${snapshot.candidate.filename}` &&
        reviewed.requestedModes === "0700-directory/0600-file" &&
        reviewed.cachePolicy ===
          "full-size-hash-identity-verification-on-every-reuse" &&
        reviewed.networkPolicy ===
          "cache-miss-only-bounded-official-redirects" &&
        reviewed.invalidFinalPolicy === "never-repair-delete-or-overwrite" &&
        reviewed.retentionPolicy === "cached-until-user-removes" &&
        reviewed.cleanupPolicy === "owned-attempt-staging-only" &&
        reviewed.crashPolicy ===
          "named-partial-may-require-manual-review-and-is-never-treated-as-a-model"
      );
    } catch {
      return false;
    }
  },
  now: () => performance.now(),
};

function duration(startedAt: number, now: () => number): number {
  return Math.max(0, Math.min(3_600_000, Math.round(now() - startedAt)));
}

function isPreflightNotStarted(events: readonly unknown[]): boolean {
  try {
    if (!Array.isArray(events)) return false;
    const termination = events.find(
      (event) =>
        event !== null &&
        typeof event === "object" &&
        (event as Record<string, unknown>).type === "termination",
    ) as Record<string, unknown> | undefined;
    const result = events.find(
      (event) =>
        event !== null &&
        typeof event === "object" &&
        (event as Record<string, unknown>).type === "result",
    ) as Record<string, unknown> | undefined;
    const failure = result?.failure as Record<string, unknown> | undefined;
    return (
      termination?.kind === "spawn-error" &&
      failure?.category === "spawn-error" &&
      [
        "WINDOWS_CONTAINMENT_UNAVAILABLE",
        "MODEL_EXECUTION_GRANT_INVALID",
        "QVAC_CHILD_LAUNCH_FAILED",
        "EXECUTOR_ABORTED",
      ].includes(String(failure.code))
    );
  } catch {
    return false;
  }
}

/** Root-process owner of the exact SDK→Doctor→acquisition→executor continuity. */
export class ProductionRealCoordinator implements RealCoordinatorBoundary {
  readonly #requestedRoot: string;
  readonly #ports: RealCoordinatorPorts;
  #root: string | undefined;
  #handle: ResolvedSdkHandle | undefined;
  #stage:
    | "created"
    | "resolving"
    | "resolved"
    | "doctor-running"
    | "doctor-complete"
    | "workload-used" = "created";

  constructor(projectRoot: string, ports: RealCoordinatorPorts = defaultPorts) {
    if (
      typeof projectRoot !== "string" ||
      !path.isAbsolute(projectRoot) ||
      path.normalize(projectRoot) !== projectRoot
    ) {
      throw new Error("real-coordinator-request-invalid");
    }
    this.#requestedRoot = projectRoot;
    this.#ports = ports;
  }

  async resolve(signal: AbortSignal): Promise<
    | {
        readonly status: "resolved";
        readonly qvac: {
          discovery: {
            status: "passed";
            reason: "completed";
            duration_ms: number;
          };
          sdk_version: "0.16.0";
          packages: [{ name: "@qvac/sdk"; version: "0.16.0" }];
        };
      }
    | { readonly status: "failed" }
    | { readonly status: "aborted" }
  > {
    if (this.#stage !== "created") return { status: "failed" };
    this.#stage = "resolving";
    if (signal.aborted) return { status: "aborted" };
    if (
      this.#ports.platform !== "darwin" ||
      this.#ports.architecture !== "arm64"
    ) {
      return { status: "failed" };
    }
    const startedAt = this.#ports.now();
    try {
      const root = await this.#ports.canonicalizeRoot(this.#requestedRoot);
      if (signal.aborted) return { status: "aborted" };
      if (!path.isAbsolute(root) || path.normalize(root) !== root)
        return { status: "failed" };
      const resolution = await this.#ports.resolveSdk(root);
      if (signal.aborted) return { status: "aborted" };
      if (
        resolution.status !== "resolved" ||
        resolution.sdkVersion !== "0.16.0"
      ) {
        return { status: "failed" };
      }
      const material = this.#ports.getSdkBinding(resolution.handle);
      if (material.projectRoot !== root || material.sdkVersion !== "0.16.0")
        return { status: "failed" };
      this.#root = root;
      this.#handle = resolution.handle;
      this.#stage = "resolved";
      return {
        status: "resolved",
        qvac: {
          discovery: {
            status: "passed",
            reason: "completed",
            duration_ms: duration(startedAt, this.#ports.now),
          },
          sdk_version: "0.16.0",
          packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
        },
      };
    } catch {
      return signal.aborted ? { status: "aborted" } : { status: "failed" };
    }
  }

  async runDoctor(
    signal: AbortSignal,
  ): Promise<
    | { readonly status: "completed"; readonly doctor: CheckEvidence }
    | { readonly status: "preflight-failed" }
    | { readonly status: "aborted" }
  > {
    if (this.#stage !== "resolved" || this.#root === undefined)
      return { status: "preflight-failed" };
    this.#stage = "doctor-running";
    try {
      const doctor = await this.#ports.runDoctor(this.#root, signal);
      if (signal.aborted) return { status: "aborted" };
      this.#stage = "doctor-complete";
      return { status: "completed", doctor };
    } catch (error) {
      if (error instanceof Error && error.message === "doctor-cleanup-failed")
        return { status: "preflight-failed" };
      if (signal.aborted) return { status: "aborted" };
      this.#stage = "doctor-complete";
      return {
        status: "completed",
        doctor: {
          status: "unknown",
          reason: "unavailable",
          duration_ms: null,
        },
      };
    }
  }

  async runWorkload(
    signal: AbortSignal,
  ): Promise<
    | { readonly status: "executed"; readonly runner: RunnerEvidence }
    | { readonly status: "preflight-failed" }
    | { readonly status: "aborted" }
  > {
    if (
      this.#stage !== "doctor-complete" ||
      this.#root === undefined ||
      this.#handle === undefined
    ) {
      return { status: "preflight-failed" };
    }
    this.#stage = "workload-used";
    if (signal.aborted) return { status: "aborted" };
    let decisionCalls = 0;
    let approvedExactlyOnce = false;
    try {
      const capability = await this.#ports.acquire({
        signal,
        decide: (disclosure) => {
          decisionCalls += 1;
          const approved =
            decisionCalls === 1 &&
            this.#ports.verifyContainedDisclosure(disclosure);
          approvedExactlyOnce = approved;
          return approved;
        },
      });
      if (signal.aborted) return { status: "aborted" };
      if (decisionCalls !== 1 || !approvedExactlyOnce)
        return { status: "preflight-failed" };
      const grant = this.#ports.createGrant(capability);
      const executor = this.#ports.createExecutor(this.#handle, grant);
      const raw = await executor.execute(signal);
      if (signal.aborted) return { status: "aborted" };
      if (isPreflightNotStarted(raw)) return { status: "preflight-failed" };
      const runner = await new StructuredRunnerAdapter({
        execute: async () => raw,
      }).run();
      if (signal.aborted) return { status: "aborted" };
      return { status: "executed", runner };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "executor-cleanup-failed" ||
          error.message === "doctor-cleanup-failed" ||
          error.message === "artifact-cleanup-failed")
      ) {
        return { status: "preflight-failed" };
      }
      if (error instanceof ArtifactError) {
        return error.code === "artifact-acquisition-aborted"
          ? { status: "aborted" }
          : { status: "preflight-failed" };
      }
      return signal.aborted
        ? { status: "aborted" }
        : { status: "preflight-failed" };
    }
  }
}
