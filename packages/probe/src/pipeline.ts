import path from "node:path";

import { withReportId } from "@qvac-atlas/schema";

import type { ProjectLocalDoctorAdapter } from "./doctor.js";
import { collectPlatform, type PlatformSource } from "./platform.js";
import {
  assembleFixtureReport,
  serializeReport,
  validateLocalReport,
} from "./report.js";
import {
  FakeRunnerExecutor,
  type FixtureScenario,
  StructuredRunnerAdapter,
} from "./runner.js";
import { ProbeStateMachine, type ProbeStage } from "./state-machine.js";
import type { AtlasReport, CheckEvidence, QvacEvidence } from "./types.js";
import { LocalReportWriter, type ReportWriter } from "./writer.js";

export const PROBE_DISCLOSURE = `QVAC Atlas fixture probe (no real QVAC execution)

Atlas will collect only: OS family/version, CPU model, architecture, a coarse
memory bucket, Node version, structured project-local QVAC/Doctor results, and
controlled lifecycle events. It does not collect environment values, usernames,
hostnames, network identifiers, prompts, generated content, full logs, or paths.

The hardware/software combination may still be identifying. Nothing is uploaded,
installed, downloaded, repaired, or written before you preview the report and
separately approve the exact local output path.`;

export interface ProbeInteraction {
  disclose(text: string): Promise<void>;
  acknowledgeFingerprint(): Promise<boolean>;
  preview(exactJson: string, kind: "draft" | "final"): Promise<void>;
  choosePublication(): Promise<boolean | null>;
  confirmLocalWrite(outputPath: string): Promise<boolean>;
}

export interface ProbeDoctor {
  run(projectRoot: string): Promise<{ evidence: CheckEvidence }>;
}

export interface ProbeOptions {
  projectRoot: string;
  outputPath: string;
  scenario: FixtureScenario;
}

export interface ProbeDependencies {
  interaction: ProbeInteraction;
  doctor: ProbeDoctor | ProjectLocalDoctorAdapter;
  platformSource?: PlatformSource;
  runner?: StructuredRunnerAdapter;
  writer?: ReportWriter;
  now?: () => Date;
}

export type ProbeRunResult =
  | { status: "refused"; stage: ProbeStage; history: readonly ProbeStage[] }
  | {
      status: "previewed-not-written";
      report: AtlasReport;
      exactJson: string;
      history: readonly ProbeStage[];
    }
  | {
      status: "written";
      report: AtlasReport;
      exactJson: string;
      outputPath: string;
      history: readonly ProbeStage[];
    };

function fixtureQvac(scenario: FixtureScenario): QvacEvidence {
  if (scenario === "missing-qvac") {
    return {
      discovery: { status: "failed", reason: "missing-qvac", duration_ms: 1 },
      sdk_version: null,
      packages: [],
    };
  }
  return {
    discovery: { status: "passed", reason: "completed", duration_ms: 1 },
    sdk_version: "0.16.0",
    packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
  };
}

export async function runFixtureProbe(
  options: ProbeOptions,
  dependencies: ProbeDependencies,
): Promise<ProbeRunResult> {
  if (!path.isAbsolute(options.projectRoot))
    throw new Error("projectRoot must be an explicit absolute path");
  if (!path.isAbsolute(options.outputPath))
    throw new Error("outputPath must be an explicit absolute path");

  const state = new ProbeStateMachine();
  const { interaction } = dependencies;
  await interaction.disclose(PROBE_DISCLOSURE);
  state.advance("disclosed");
  if (!(await interaction.acknowledgeFingerprint())) {
    return { status: "refused", stage: state.stage, history: state.history };
  }
  state.advance("fingerprint-consented");

  const collected = collectPlatform(dependencies.platformSource);
  const qvac = fixtureQvac(options.scenario);
  state.advance("collected");

  const doctor =
    options.scenario === "missing-qvac"
      ? ({
          status: "skipped",
          reason: "not-reached",
          duration_ms: null,
        } satisfies CheckEvidence)
      : (await dependencies.doctor.run(options.projectRoot)).evidence;
  state.advance("doctor-complete");

  const runner =
    dependencies.runner ??
    new StructuredRunnerAdapter(new FakeRunnerExecutor(options.scenario));
  const runnerEvidence = await runner.run();
  state.advance("runner-complete");

  let report = assembleFixtureReport({
    fixtureId: options.scenario,
    createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    publication: false,
    platform: collected.platform,
    nodeVersion: collected.nodeVersion,
    qvac,
    doctor,
    runner: runnerEvidence,
    redactionCounts: collected.redactionCounts,
  });
  state.advance("assembled");
  validateLocalReport(report);
  state.advance("validated");

  await interaction.preview(serializeReport(report), "draft");
  state.advance("draft-previewed");
  const publication = await interaction.choosePublication();
  if (publication === null)
    return { status: "refused", stage: state.stage, history: state.history };
  state.advance("publication-chosen");

  report = withReportId({
    ...report,
    consent: { ...report.consent, publication },
  }) as AtlasReport;
  validateLocalReport(report);
  state.advance("final-validated");
  const exactJson = serializeReport(report);
  await interaction.preview(exactJson, "final");
  state.advance("final-previewed");

  if (!(await interaction.confirmLocalWrite(options.outputPath))) {
    return {
      status: "previewed-not-written",
      report,
      exactJson,
      history: state.history,
    };
  }
  state.advance("write-consented");
  await (dependencies.writer ?? new LocalReportWriter()).writeExclusive(
    options.outputPath,
    exactJson,
  );
  state.advance("written");
  state.advance("complete");
  return {
    status: "written",
    report,
    exactJson,
    outputPath: options.outputPath,
    history: state.history,
  };
}
