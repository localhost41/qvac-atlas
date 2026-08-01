import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertAppendOnlyReports,
  auditContributions,
} from "../packages/catalog/src/index.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function gitPaths(args) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024,
  });
  return new Set(stdout.toString("utf8").split("\0").filter(Boolean));
}

function historyRequest(args) {
  if (args.length === 0) return null;
  if (args.length !== 4 || args[0] !== "--base" || args[2] !== "--target") {
    throw new Error(
      "Contribution history audit failed: use either no revision arguments or exact --base <40-hex> --target <40-hex> arguments",
    );
  }
  return { baseRevision: args[1], targetRevision: args[3] };
}

async function main() {
  const request = historyRequest(process.argv.slice(2));
  const history =
    request === null
      ? null
      : await assertAppendOnlyReports({ root, ...request });
  const [trackedPaths, untrackedPaths] = await Promise.all([
    gitPaths(["ls-files", "-z", "--", "reports/v1"]),
    gitPaths([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "reports/v1",
    ]),
  ]);
  const result = await auditContributions({
    root,
    trackedPaths,
    untrackedPaths: [...untrackedPaths],
  });

  if (history === null) {
    process.stdout.write(
      `Current-tree contribution audit passed: ${result.genuineReports} genuine report(s), ${result.fixtureReports} fixture(s), ${result.claims} claim group(s). Append-only history was not proven; supply exact --base and --target commit IDs when that proof is required.\n`,
    );
    return;
  }
  process.stdout.write(
    `Contribution audit passed: ${result.genuineReports} genuine report(s), ${result.fixtureReports} fixture(s), ${result.claims} claim group(s); append-only history preserved ${history.preserved} report(s) and added ${history.additions}.\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Contribution audit failed safely"}\n`,
  );
  process.exitCode = 1;
}
