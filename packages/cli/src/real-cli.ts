import { realpath } from "node:fs/promises";
import path from "node:path";

import {
  runRealProbePipeline,
  type RealCoordinatorBoundary,
  type RealOutputBoundary,
  type RealProbeInteraction,
  type RealProbeRunResult,
} from "@qvac-atlas/probe/real";
import {
  admitExactSubmission,
  SubmissionClientError,
  type AnonymousSubmissionClient,
} from "@qvac-atlas/submission";

import { ProductionRealCoordinator } from "./real-coordinator.js";
import { BoundRealOutput } from "./real-output.js";
import { configuredAnonymousSubmissionClient } from "./submission-policy.js";

export interface EnabledRealCliRequest {
  readonly cwd: string;
  readonly output: string;
  readonly signal: AbortSignal;
}

export interface EnabledRealCliIo {
  ask(question: string, signal: AbortSignal): Promise<string>;
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface EnabledRealCliOverrides {
  createCoordinator?(projectRoot: string): RealCoordinatorBoundary;
  createOutput?(outputPath: string): RealOutputBoundary;
  runPipeline?: typeof runRealProbePipeline;
  submissionClient?: AnonymousSubmissionClient | null;
}

function yes(value: string): boolean {
  return /^(?:y|yes)$/i.test(value.trim());
}

async function normalizeOutputPath(
  cwd: string,
  output: string,
): Promise<string> {
  if (
    typeof output !== "string" ||
    output.length === 0 ||
    output.length > 4_096 ||
    /[\x00-\x1f\x7f-\x9f]/u.test(output)
  ) {
    throw new Error("real-output-path-invalid");
  }
  const absolute = path.resolve(cwd, output);
  const parent = await realpath(path.dirname(absolute));
  const normalized = path.join(parent, path.basename(absolute));
  if (
    !path.isAbsolute(normalized) ||
    path.normalize(normalized) !== normalized ||
    /[\x00-\x1f\x7f-\x9f]/u.test(normalized)
  )
    throw new Error("real-output-path-invalid");
  return normalized;
}

function interaction(
  outputPath: string,
  signal: AbortSignal,
  io: EnabledRealCliIo,
  submissionClient: AnonymousSubmissionClient | null,
): RealProbeInteraction {
  const decide = async (question: string): Promise<boolean> =>
    yes(await io.ask(question, signal));
  let localRunConsent: boolean | undefined;
  return {
    disclosePrivacy: async (view) => {
      io.stdout(
        [
          "QVAC Atlas real probe privacy disclosure",
          `Collection: ${view.collection}.`,
          "The selected project code executes in bounded isolation, not a sandbox.",
          "The candidate is nonstandard and cannot create a compatibility claim.",
          "Atlas installs nothing and performs only the disclosed cache and workload effects.",
          "One local-run decision authorizes the audited project code and exactly one pinned workload.",
          "Nothing is submitted unless you separately approve anonymous queueing after the local report is saved.",
          "",
        ].join("\n"),
      );
    },
    decideFingerprint: async () => {
      localRunConsent = await decide(
        "Run one disclosed local QVAC Atlas check on this project? [y/N] ",
      );
      return localRunConsent;
    },
    discloseProjectCode: async (view) => {
      io.stdout(
        `Project-code disclosure: exact current-project ${view.package}@${view.version}; ${view.containment}.\n`,
      );
    },
    decideProjectCode: async () => localRunConsent === true,
    discloseWorkload: async (view) => {
      io.stdout(
        `Authoritative artifact and workload disclosure:\n${JSON.stringify(view, null, 2)}\n`,
      );
    },
    decideWorkload: async () => localRunConsent === true,
    preview: async (exactJson, kind) => {
      if (kind !== "draft") return;
      try {
        const report = JSON.parse(exactJson) as {
          platform?: {
            cpu?: { model?: string };
            architecture?: string;
            memory_bucket?: string;
            gpus?: Array<{ model?: string }>;
            os?: { family?: string; version?: string };
          };
          runtime?: { node_version?: string };
          qvac?: { sdk_version?: string | null };
          profile?: { id?: string; requested_backend?: string };
          execution?: {
            backend_observation?: { backend?: string | null; status?: string };
          };
          result?: { workload_status?: string };
        };
        const platform = report.platform ?? {};
        const cpu = platform.cpu?.model ?? "unknown CPU";
        const gpu =
          platform.gpus
            ?.map((item) => item.model)
            .filter(Boolean)
            .join(", ") ||
          (platform.os?.family === "macos"
            ? "integrated GPU keyed by Apple SoC (exact inventory unavailable)"
            : "GPU inventory unavailable");
        io.stdout(
          [
            "QVAC Atlas result summary",
            `Hardware: ${cpu} · ${platform.architecture ?? "unknown architecture"} · ${platform.memory_bucket ?? "unknown memory"}`,
            `GPU: ${gpu}`,
            `OS: ${platform.os?.family ?? "unknown"} ${platform.os?.version ?? "unknown"}`,
            `Runtime: Node ${report.runtime?.node_version ?? "unknown"} · QVAC SDK ${report.qvac?.sdk_version ?? "unknown"}`,
            `Workload: ${report.profile?.id ?? "unknown profile"} · requested ${report.profile?.requested_backend ?? "unknown"} · observed ${report.execution?.backend_observation?.backend ?? "unknown"} (${report.execution?.backend_observation?.status ?? "unknown"})`,
            `Result: ${report.result?.workload_status ?? "unknown"}`,
            "Only these allowlisted fields are retained; usernames, paths, network data, credentials, and arbitrary logs are excluded.",
            "",
          ].join("\n"),
        );
      } catch {
        io.stdout("QVAC Atlas completed a privacy-bounded result preview.\n");
      }
    },
    choosePublication: async (warning) => {
      if (submissionClient === null) {
        io.stdout(
          "Anonymous submission is unavailable in this build; the report will remain private.\n",
        );
        return false;
      }
      io.stdout(
        `Anonymous submission: claim eligible=${warning.claimEligible}; admissible=${warning.currentlyAdmissible}. The exact report will be saved locally first; one bounded request follows only if you say yes.\n`,
      );
      try {
        return await decide("Submit anonymous report? [y/N] ");
      } catch {
        if (signal.aborted) throw new Error("submission-prompt-cancelled");
        io.stdout(
          "Submission choice was unavailable; the report will remain private.\n",
        );
        return false;
      }
    },
    confirmLocalWrite: async () => true,
  };
}

function renderNonWrittenResult(
  result: RealProbeRunResult,
  outputPath: string,
  io: EnabledRealCliIo,
): number {
  if (result.status === "aborted") {
    io.stderr("QVAC Atlas was cancelled. No report was written or uploaded.\n");
    return 130;
  }
  if (
    result.status === "previewed-not-written" ||
    result.status === "refused"
  ) {
    io.stdout("No report was written. Nothing was uploaded.\n");
    return result.status === "refused" ? 2 : 0;
  }
  io.stderr(
    "QVAC Atlas could not complete the local report. Nothing was uploaded.\n",
  );
  return 1;
}

async function handleWrittenResult(
  result: { readonly exactJson: string },
  outputPath: string,
  signal: AbortSignal,
  io: EnabledRealCliIo,
  client: AnonymousSubmissionClient | null,
): Promise<number> {
  io.stdout(`Candidate report written locally to ${outputPath}.\n`);
  let publicationRequested = false;
  try {
    publicationRequested =
      (JSON.parse(result.exactJson) as { consent?: { publication?: boolean } })
        .consent?.publication === true;
  } catch {
    publicationRequested = false;
  }
  if (!publicationRequested) {
    io.stdout("Private report saved. Nothing was submitted.\n");
    return 0;
  }
  let submission;
  try {
    submission = admitExactSubmission(result.exactJson);
  } catch {
    io.stdout(
      "This report is not eligible for anonymous queueing and remains local. Nothing was submitted.\n",
    );
    return 0;
  }
  if (client === null) {
    io.stdout(
      "Anonymous submission is disabled in this build; the report remains local. Nothing was submitted.\n",
    );
    return 0;
  }
  io.stdout(
    [
      "Anonymous submission disclosure",
      `Destination: ${client.origin}`,
      "Payload: only the exact final JSON written locally immediately before this request.",
      "The relay stores it in a private GitHub review queue; queueing is not public publication or identity verification.",
      "Accountless is not network-anonymous: the hosting provider processes connection metadata, and GitHub records relay timing.",
      "Atlas performs one bounded request, keeps no application access log, and never retries in the background.",
      "Rejected queue refs are scheduled for deletion within 30 days, but provider backups or internal retention may persist.",
      "A maintainer may later publish the report as unverified-anonymous evidence after review.",
      "",
    ].join("\n"),
  );
  try {
    const receipt = await client.submit(submission.exactJson, signal);
    io.stdout(
      `Anonymous report ${receipt.submissionId} is ${receipt.status} in the private review queue. Maintainer review is required before publication.\n`,
    );
    return 0;
  } catch (error) {
    const cancelled =
      signal.aborted ||
      (error instanceof SubmissionClientError && error.code === "cancelled");
    io.stderr(
      cancelled
        ? "The local report remains saved. Submission was cancelled; its queue outcome may be unknown. Atlas did not retry.\n"
        : "The local report remains saved. Anonymous submission did not complete; its queue outcome may be unknown. Atlas did not retry.\n",
    );
    return cancelled ? 130 : 1;
  }
}

/** Relative-only enabled seam; shipped main never calls it while the gate is false. */
export async function runEnabledRealCli(
  request: EnabledRealCliRequest,
  io: EnabledRealCliIo,
  overrides: EnabledRealCliOverrides = {},
): Promise<number> {
  try {
    request.signal.throwIfAborted();
    const projectRoot = path.resolve(request.cwd);
    const outputPath = await normalizeOutputPath(projectRoot, request.output);
    request.signal.throwIfAborted();
    const submissionClient =
      overrides.submissionClient === undefined
        ? configuredAnonymousSubmissionClient()
        : overrides.submissionClient;
    const coordinator =
      overrides.createCoordinator?.(projectRoot) ??
      new ProductionRealCoordinator(projectRoot);
    const output =
      overrides.createOutput?.(outputPath) ?? new BoundRealOutput(outputPath);
    const result = await (overrides.runPipeline ?? runRealProbePipeline)(
      { signal: request.signal },
      {
        interaction: interaction(
          outputPath,
          request.signal,
          io,
          submissionClient,
        ),
        coordinator,
        output,
      },
    );
    if (result.status === "written") {
      return await handleWrittenResult(
        result,
        outputPath,
        request.signal,
        io,
        submissionClient,
      );
    }
    return renderNonWrittenResult(result, outputPath, io);
  } catch {
    if (request.signal.aborted) {
      io.stderr(
        "QVAC Atlas was cancelled. No report was written or uploaded.\n",
      );
      return 130;
    }
    io.stderr(
      "QVAC Atlas could not complete the local report. Nothing was uploaded.\n",
    );
    return 1;
  }
}
