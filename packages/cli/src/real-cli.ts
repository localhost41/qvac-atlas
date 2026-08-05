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
): RealProbeInteraction {
  const decide = async (question: string): Promise<boolean> =>
    yes(await io.ask(question, signal));
  return {
    disclosePrivacy: async (view) => {
      io.stdout(
        [
          "QVAC Atlas real probe privacy disclosure",
          `Collection: ${view.collection}.`,
          "The selected project code executes in bounded isolation, not a sandbox.",
          "The candidate is nonstandard and cannot create a compatibility claim.",
          "Atlas installs nothing and performs approved cache effects before report preview.",
          "Nothing is submitted unless you separately approve anonymous queueing after the final report is written.",
          "",
        ].join("\n"),
      );
    },
    decideFingerprint: () =>
      decide(
        "I understand the fingerprint risk and consent to local collection [y/N] ",
      ),
    discloseProjectCode: async (view) => {
      io.stdout(
        `Project-code disclosure: exact current-project ${view.package}@${view.version}; ${view.containment}.\n`,
      );
    },
    decideProjectCode: () =>
      decide("Run the audited project-local QVAC Doctor and SDK code [y/N] "),
    discloseWorkload: async (view) => {
      io.stdout(
        `Authoritative artifact and workload disclosure:\n${JSON.stringify(view, null, 2)}\n`,
      );
    },
    decideWorkload: () =>
      decide(
        "Authorize exactly one pinned cache verify/download and one requested-GPU lifecycle [y/N] ",
      ),
    preview: async (exactJson, kind) => {
      io.stdout(
        `--- ${kind} exact JSON ---\n${exactJson}--- end ${kind} exact JSON ---\n`,
      );
    },
    choosePublication: async (warning) => {
      io.stdout(
        `Publication warning: claim eligible=${warning.claimEligible}; currently admissible=${warning.currentlyAdmissible}; no upload occurs until a separate post-write choice.\n`,
      );
      return decide(
        "Mark this local report as intended for later public submission [y/N] ",
      );
    },
    confirmLocalWrite: () =>
      decide(`Write the final exact JSON to ${outputPath} [y/N] `),
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
      "Payload: only the exact final JSON previewed above and written locally.",
      "The relay stores it in a private GitHub review queue; queueing is not public publication or identity verification.",
      "Accountless is not network-anonymous: the hosting provider processes connection metadata, and GitHub records relay timing.",
      "Atlas performs one bounded request, keeps no application access log, and never retries in the background.",
      "Rejected queue refs are scheduled for deletion within 30 days, but provider backups or internal retention may persist.",
      "A maintainer may later publish the report as unverified-anonymous evidence after review.",
      "",
    ].join("\n"),
  );
  let approved = false;
  try {
    approved = yes(
      await io.ask(
        `Submit this exact report accountlessly to ${client.origin} [y/N] `,
        signal,
      ),
    );
  } catch {
    if (signal.aborted) {
      io.stderr(
        "The local report remains saved. Anonymous submission was cancelled before a request started.\n",
      );
      return 130;
    }
  }
  if (!approved) {
    io.stdout("The report remains local. Nothing was submitted.\n");
    return 0;
  }
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
    const coordinator =
      overrides.createCoordinator?.(projectRoot) ??
      new ProductionRealCoordinator(projectRoot);
    const output =
      overrides.createOutput?.(outputPath) ?? new BoundRealOutput(outputPath);
    const result = await (overrides.runPipeline ?? runRealProbePipeline)(
      { signal: request.signal },
      {
        interaction: interaction(outputPath, request.signal, io),
        coordinator,
        output,
      },
    );
    if (result.status === "written") {
      const submissionClient =
        overrides.submissionClient === undefined
          ? configuredAnonymousSubmissionClient()
          : overrides.submissionClient;
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
