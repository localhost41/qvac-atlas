import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const grandchild = spawn(
  process.execPath,
  ["-e", "setInterval(() => {}, 1000)"],
  {
    detached: false,
    stdio: "ignore",
  },
);
grandchild.unref();
await writeFile(
  path.join(process.cwd(), "grandchild.pid"),
  String(grandchild.pid),
  "utf8",
);
process.send?.({ type: "root-ready-to-exit" }, () => process.disconnect());
