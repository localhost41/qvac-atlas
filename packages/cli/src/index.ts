import path from "node:path";

import {
  type FixtureScenario,
  type ProbeInteraction,
  type ProbeOptions,
  type ProbeRunResult,
} from "@qvac-atlas/probe";

import { LocalMockProbeAdapter, type ProbeAdapter } from "./mock-adapter.js";

const SCENARIOS = new Set<FixtureScenario>([
  "success",
  "missing-qvac",
  "worker-crash",
  "timeout",
]);

export interface CliDependencies {
  interactive: boolean;
  cwd(): string;
  ask(question: string): Promise<string>;
  stdout(value: string): void;
  stderr(value: string): void;
  runProbe(
    options: ProbeOptions,
    interaction: ProbeInteraction,
  ): Promise<ProbeRunResult>;
}

function yes(value: string): boolean {
  return /^(?:y|yes)$/i.test(value.trim());
}

function usage(): string {
  return "Usage: qvac-atlas probe --fixture <success|missing-qvac|worker-crash|timeout> --output <path> [--project <path>]\n       qvac-atlas probe --real --output <path>";
}

function parseArgs(args: string[], cwd: string): ProbeOptions | null {
  if (args[0] !== "probe") return null;
  let output: string | undefined;
  let project = cwd;
  let scenario: FixtureScenario | undefined;
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined) return null;
    if (flag === "--output") output = value;
    else if (flag === "--project") project = value;
    else if (flag === "--fixture" && SCENARIOS.has(value as FixtureScenario))
      scenario = value as FixtureScenario;
    else return null;
  }
  if (output === undefined || scenario === undefined) return null;
  return {
    projectRoot: path.resolve(cwd, project),
    outputPath: path.resolve(cwd, output),
    scenario,
  };
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies,
): Promise<number> {
  let options: ProbeOptions | null;
  try {
    options = parseArgs(args, dependencies.cwd());
  } catch {
    dependencies.stderr(
      "QVAC Atlas stopped safely before completion. No report was uploaded; check the chosen local destination and try again.\n",
    );
    return 1;
  }
  if (options === null) {
    dependencies.stderr(
      `${usage()}\nReal QVAC execution remains disabled until the audited SDK resolver is bound to a reviewed executor and passes the device gate.\n`,
    );
    return 2;
  }
  if (!dependencies.interactive) {
    dependencies.stderr(
      "QVAC Atlas refuses noninteractive probing: disclosure, post-preview publication choice, and local-write consent are required.\n",
    );
    return 2;
  }

  const interaction: ProbeInteraction = {
    disclose: async (text) => dependencies.stdout(`${text}\n\n`),
    acknowledgeFingerprint: async () =>
      yes(
        await dependencies.ask(
          "I understand the fingerprint risk and consent to local collection [y/N] ",
        ),
      ),
    preview: async (exactJson, kind) => {
      dependencies.stdout(
        `--- ${kind} exact JSON ---\n${exactJson}--- end ${kind} exact JSON ---\n`,
      );
    },
    choosePublication: async () =>
      yes(
        await dependencies.ask(
          "Mark this report as intended for later public submission [y/N] ",
        ),
      ),
    confirmLocalWrite: async (outputPath) =>
      yes(
        await dependencies.ask(
          `Write the final exact JSON to ${outputPath} [y/N] `,
        ),
      ),
  };

  let result: ProbeRunResult;
  try {
    result = await dependencies.runProbe(options, interaction);
  } catch {
    dependencies.stderr(
      "QVAC Atlas stopped safely before completion. No report was uploaded; check the chosen local destination and try again.\n",
    );
    return 1;
  }
  if (result.status === "written") {
    dependencies.stdout(
      `Fixture report written locally to ${result.outputPath}. Nothing was uploaded.\n`,
    );
    return 0;
  }
  dependencies.stdout("No report was written. Nothing was uploaded.\n");
  return result.status === "refused" ? 2 : 0;
}

export function renderFixtureResult(adapter: ProbeAdapter): string {
  const fixture = adapter.runFixture();
  return [
    "QVAC Atlas CLI scaffold",
    `Fixture status: ${fixture.label}`,
    `Scenario: ${fixture.scenario}`,
    "No system inspection, QVAC execution, report validation, or upload occurred.",
  ].join("\n");
}

export { LocalMockProbeAdapter };
