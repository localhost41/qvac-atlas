import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

let sequence = 0;
const send = (event) => process.send?.({ ...event, sequence: sequence++ });

send({ type: "phase", phase: "qvac-import", state: "started" });
await receiveSdkBootstrapAndImport();
send({ type: "phase", phase: "qvac-import", state: "succeeded" });
send({ type: "phase", phase: "worker-start", state: "started" });
send({ type: "phase", phase: "worker-start", state: "succeeded" });
send({ type: "phase", phase: "model-load", state: "started" });

const grandchild = spawn(
  process.execPath,
  ["-e", "setInterval(() => {}, 1000)"],
  {
    stdio: "ignore",
  },
);
await writeFile(
  path.join(process.env.TMPDIR, "grandchild.pid"),
  String(grandchild.pid),
  "utf8",
);
setInterval(() => {}, 1_000);
