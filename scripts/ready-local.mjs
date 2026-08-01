import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(
        new Error(
          signal === null
            ? `Local readiness command failed with exit code ${String(code)}`
            : `Local readiness command ended by signal ${signal}`,
        ),
      );
    });
  });
}

async function untrackedPaths() {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "buffer", maxBuffer: 1024 * 1024 },
  );
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

async function main() {
  const nodeMajor = Number.parseInt(
    process.versions.node.split(".")[0] ?? "",
    10,
  );
  if (nodeMajor !== 22) {
    throw new Error("Local readiness requires Node major 22.");
  }

  process.stdout.write(
    "Checking current-tree readiness only; frozen installation is a separate fresh-checkout gate.\n",
  );
  await run(process.execPath, ["scripts/validate-contribution.mjs"]);
  await run(pnpm, ["check"]);
  await run(process.execPath, ["scripts/build-catalog.mjs"]);
  await run("git", [
    "diff",
    "--exit-code",
    "--",
    "apps/site/src/generated/catalog.json",
  ]);
  await run("git", ["diff", "--check"]);
  await run("git", ["diff", "--cached", "--check"]);

  const untracked = await untrackedPaths();
  if (untracked.length > 0) {
    throw new Error(
      `Local readiness found ${String(untracked.length)} untracked path(s); review and stage or ignore them explicitly.`,
    );
  }

  await run("git", ["status", "--short", "--untracked-files=all"]);
  process.stdout.write(
    [
      "Local current-tree readiness passed.",
      "Not proven: exact base/target append-only history or a frozen install from a fresh checkout.",
      "Not proven: physical hardware/privacy, repository ownership and protection, activation, deployment, or release approval gates.",
      "Review every listed tracked change before committing or proposing it.",
      "",
    ].join("\n"),
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Local readiness failed safely"}\n`,
  );
  process.exitCode = 1;
}
