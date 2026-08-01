import path from "node:path";

import {
  type FixtureScenario,
  type ProbeInteraction,
  type ProbeOptions,
  type ProbeRunResult,
} from "@qvac-atlas/probe";

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

export function usage(): string {
  return [
    "QVAC Atlas creates a local, sanitized report and uploads nothing.",
    "",
    "Usage:",
    "  qvac-atlas probe --fixture <success|missing-qvac|worker-crash|timeout> --output <path> [--project <path>]",
    "  qvac-atlas probe --real --output <path>",
    "",
    "This build accepts synthetic fixture scenarios only.",
    "Real execution requires the ATLAS-013 physical-device/privacy gate and a separate reviewed activation decision.",
  ].join("\n");
}

interface ParsedFixtureArguments {
  output: string;
  project: string;
  scenario: FixtureScenario;
}

function validFixturePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_096 &&
    !/[\x00-\x1f\x7f]/u.test(value)
  );
}

export function parseFixtureArgs(
  args: readonly string[],
): ParsedFixtureArguments | null {
  if (args[0] !== "probe") return null;
  let output: string | undefined;
  let project = ".";
  let scenario: FixtureScenario | undefined;
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || value === undefined || seen.has(flag))
      return null;
    seen.add(flag);
    if (flag === "--output" && validFixturePath(value)) output = value;
    else if (flag === "--project" && validFixturePath(value)) project = value;
    else if (flag === "--fixture" && SCENARIOS.has(value as FixtureScenario))
      scenario = value as FixtureScenario;
    else return null;
  }
  if (output === undefined || scenario === undefined) return null;
  return { output, project, scenario };
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies,
): Promise<number> {
  const parsed = parseFixtureArgs(args);
  if (parsed === null) {
    dependencies.stderr(`${usage()}\n`);
    return 2;
  }

  let options: ProbeOptions;
  try {
    const cwd = dependencies.cwd();
    options = {
      projectRoot: path.resolve(cwd, parsed.project),
      outputPath: path.resolve(cwd, parsed.output),
      scenario: parsed.scenario,
    };
  } catch {
    dependencies.stderr(
      "QVAC Atlas stopped safely before completion. No report was uploaded; check the chosen local destination and try again.\n",
    );
    return 1;
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
