import {
  parseFixtureArgs,
  runCli,
  usage,
  type CliDependencies,
} from "./index.js";

interface RealModule {
  runEnabledRealCli(
    request: { cwd: string; output: string; signal: AbortSignal },
    io: {
      ask(question: string, signal: AbortSignal): Promise<string>;
      stdout(value: string): void;
      stderr(value: string): void;
    },
  ): Promise<number>;
}

export interface InternalCliDependencies extends CliDependencies {
  platform(): string;
  architecture(): string;
  isInteractive(): boolean;
  askReal(question: string, signal: AbortSignal): Promise<string>;
  loadRealCli?(): Promise<RealModule>;
  onCancellationSignal?(listener: () => void): () => void;
}

function validRealOutput(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_096 &&
    !value.startsWith("-") &&
    !/[\x00-\x1f\x7f-\x9f]/u.test(value)
  );
}

function exactReal(args: readonly string[]): { output: string } | null {
  return args.length === 4 &&
    args[0] === "probe" &&
    args[1] === "--real" &&
    args[2] === "--output" &&
    validRealOutput(args[3])
    ? { output: args[3] }
    : null;
}

function exactContribution(args: readonly string[]): { output: string } | null {
  if (args[0] !== "contribute") return null;
  if (args.length === 1) return { output: "qvac-atlas-report.json" };
  if (args.length === 3 && args[1] === "--output" && validRealOutput(args[2])) {
    return { output: args[2] };
  }
  return null;
}

function realUsage(): string {
  return (
    [
      "Usage: qvac-atlas probe --real --output <path>",
      "       qvac-atlas contribute [--output <path>]",
    ].join("\n") + "\n"
  );
}

function isHelp(args: readonly string[]): boolean {
  return (
    (args.length === 1 && ["--help", "-h"].includes(args[0] ?? "")) ||
    (args.length === 2 &&
      args[0] === "probe" &&
      ["--help", "-h"].includes(args[1] ?? ""))
  );
}

function hasRealFlagIntent(args: readonly string[]): boolean {
  if (args[0] !== "probe") return false;
  for (let index = 1; index < args.length; index += 2) {
    if (args[index] === "--real") return true;
  }
  return false;
}

/** Relative-only test seam. Shipped main passes the literal false gate. */
export async function dispatchCli(
  args: string[],
  dependencies: InternalCliDependencies,
  realModeEnabled: boolean,
): Promise<number> {
  if (isHelp(args)) {
    dependencies.stdout(`${usage()}\n`);
    return 0;
  }
  const real = exactReal(args) ?? exactContribution(args);
  if (real === null) {
    if (hasRealFlagIntent(args) || args[0] === "contribute") {
      dependencies.stderr(realUsage());
      return 2;
    }
    if (parseFixtureArgs(args) === null) {
      dependencies.stderr(`${usage()}\n`);
      return 2;
    }
    let interactive: boolean;
    try {
      interactive = dependencies.isInteractive();
    } catch {
      dependencies.stderr(
        "QVAC Atlas stopped safely before completion. No report was uploaded; check the chosen local destination and try again.\n",
      );
      return 1;
    }
    return runCli(args, { ...dependencies, interactive });
  }
  if (!realModeEnabled) {
    dependencies.stderr(
      "Real QVAC execution is disabled in this build. Activation requires the ATLAS-013 physical-device/privacy gate and a separate reviewed activation decision.\n",
    );
    return 2;
  }

  let platform: string;
  let architecture: string;
  try {
    platform = dependencies.platform();
    architecture = dependencies.architecture();
  } catch {
    dependencies.stderr(
      "QVAC Atlas could not verify the supported host. Nothing was uploaded.\n",
    );
    return 1;
  }
  if (platform !== "darwin" || architecture !== "arm64") {
    dependencies.stderr(
      "QVAC Atlas V1 real probing requires macOS on arm64. Nothing was uploaded.\n",
    );
    return 2;
  }

  let interactive: boolean;
  try {
    interactive = dependencies.isInteractive();
  } catch {
    dependencies.stderr(
      "QVAC Atlas could not verify interactive consent requirements. Nothing was uploaded.\n",
    );
    return 1;
  }
  if (!interactive) {
    dependencies.stderr(
      "QVAC Atlas refuses noninteractive real probing: stdin and stdout TTY consent are required.\n",
    );
    return 2;
  }

  let cwd: string;
  try {
    cwd = dependencies.cwd();
  } catch {
    dependencies.stderr(
      "QVAC Atlas could not select the current project. Nothing was uploaded.\n",
    );
    return 1;
  }

  const controller = new AbortController();
  const removeCancellationSignals = dependencies.onCancellationSignal?.(() =>
    controller.abort(),
  );
  try {
    const module = await (dependencies.loadRealCli?.() ??
      import("./real-cli.js"));
    return await module.runEnabledRealCli(
      { cwd, output: real.output, signal: controller.signal },
      {
        ask: dependencies.askReal,
        stdout: dependencies.stdout,
        stderr: dependencies.stderr,
      },
    );
  } catch {
    dependencies.stderr(
      controller.signal.aborted
        ? "QVAC Atlas was cancelled. No report was written or uploaded.\n"
        : "QVAC Atlas could not complete the local report. Nothing was uploaded.\n",
    );
    return controller.signal.aborted ? 130 : 1;
  } finally {
    removeCancellationSignals?.();
  }
}
