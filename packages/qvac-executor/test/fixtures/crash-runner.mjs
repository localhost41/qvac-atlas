import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

let sequence = 0;
const send = (event) => process.send?.({ ...event, sequence: sequence++ });

send({ type: "phase", phase: "qvac-import", state: "started" });
await receiveSdkBootstrapAndImport();
send({ type: "phase", phase: "qvac-import", state: "succeeded" });
send({ type: "phase", phase: "worker-start", state: "started" });
process.kill(process.pid, "SIGKILL");
