import { realpath } from "node:fs/promises";
import path from "node:path";

import {
  runRealProbePipeline,
  type RealCoordinatorBoundary,
  type RealOutputBoundary,
  type RealProbeInteraction,
  type RealProbeRunResult,
} from "@qvac-atlas/probe/real";

import { ProductionRealCoordinator } from "./real-coordinator.js";
import { BoundRealOutput } from "./real-output.js";

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
    /[\x00-\x1f\x7f]/u.test(output)
  ) {
    throw new Error("real-output-path-invalid");
  }
  const absolute = path.resolve(cwd, output);
  const parent = await realpath(path.dirname(absolute));
  const normalized = path.join(parent, path.basename(absolute));
  if (
    !path.isAbsolute(normalized) ||
    path.normalize(normalized) !== normalized ||
    /[\x00-\x1f\x7f]/u.test(normalized)
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
          "Atlas installs nothing, uploads nothing, and performs approved cache effects before report preview.",
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
        `Publication warning: claim eligible=${warning.claimEligible}; currently admissible=${warning.currentlyAdmissible}; no upload occurs.\n`,
      );
      return decide(
        "Mark this local report as intended for later public submission [y/N] ",
      );
    },
    confirmLocalWrite: () =>
      decide(`Write the final exact JSON to ${outputPath} [y/N] `),
  };
}

function renderResult(
  result: RealProbeRunResult,
  outputPath: string,
  io: EnabledRealCliIo,
): number {
  if (result.status === "written") {
    io.stdout(
      `Candidate report written locally to ${outputPath}. Nothing was uploaded.\n`,
    );
    return 0;
  }
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
    return renderResult(result, outputPath, io);
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
