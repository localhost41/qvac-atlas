import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

let sequence = 0;
const send = (event) => process.send?.({ ...event, sequence: sequence++ });
const complete = (phase) => {
  send({ type: "phase", phase, state: "started" });
  send({ type: "phase", phase, state: "succeeded" });
};

send({ type: "phase", phase: "qvac-import", state: "started" });
await receiveSdkBootstrapAndImport();
send({ type: "phase", phase: "qvac-import", state: "succeeded" });
complete("worker-start");
complete("model-load");
send({ type: "phase", phase: "inference", state: "started" });
send({ type: "backend", backend: "gpu" });
send({ type: "phase", phase: "inference", state: "succeeded" });
complete("clean-shutdown");

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
  path.join(process.env.TMPDIR, "root-exit-grandchild.pid"),
  String(grandchild.pid),
  "utf8",
);
process.disconnect();
