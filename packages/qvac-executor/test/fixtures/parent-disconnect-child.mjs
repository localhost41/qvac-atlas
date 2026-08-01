import { spawn } from "node:child_process";

import { installParentDisconnectFailSafe } from "../../dist/parent-disconnect.js";

installParentDisconnectFailSafe(process);

const descendant = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
  { stdio: "ignore" },
);

process.send?.({
  type: "parent-disconnect-tree-ready",
  root: process.pid,
  descendant: descendant.pid,
});
setInterval(() => {}, 1_000);
