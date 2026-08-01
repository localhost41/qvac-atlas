import { readFile } from "node:fs/promises";
import path from "node:path";

import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

const scenarioPath = path.join(process.env.TMPDIR, "protocol-matrix-case.json");
const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));

await receiveSdkBootstrapAndImport();

const send = (message) =>
  new Promise((resolve, reject) => {
    if (typeof process.send !== "function") {
      reject(new Error("fixture-ipc-unavailable"));
      return;
    }
    process.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

for (const message of scenario.messages ?? []) await send(message);

if (scenario.termination?.kind === "exit") {
  process.exit(scenario.termination.code);
}
if (scenario.termination?.kind === "signal") {
  process.kill(process.pid, scenario.termination.signal);
}

setInterval(() => {}, 1_000);
