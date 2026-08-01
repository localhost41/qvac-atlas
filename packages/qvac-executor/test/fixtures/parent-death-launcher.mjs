import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = fork(
  fileURLToPath(new URL("./parent-disconnect-child.mjs", import.meta.url)),
  [],
  {
    detached: true,
    execArgv: [],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  },
);

child.once("message", (message) => process.send?.(message));
setInterval(() => {}, 1_000);
