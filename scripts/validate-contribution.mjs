import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { auditContributions } from "../packages/catalog/src/index.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function gitPaths(args) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024,
  });
  return new Set(stdout.toString("utf8").split("\0").filter(Boolean));
}

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

process.stdout.write(
  `Contribution audit passed: ${result.genuineReports} genuine report(s), ${result.fixtureReports} fixture(s), ${result.claims} claim group(s).\n`,
);
