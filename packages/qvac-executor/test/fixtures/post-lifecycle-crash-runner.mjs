import { receiveSdkBootstrapAndImport } from "@qvac-atlas/qvac-resolver/internal";

let sequence = 0;
const send = (event) =>
  new Promise((resolve) =>
    process.send?.({ ...event, sequence: sequence++ }, resolve),
  );
const complete = async (phase) => {
  await send({ type: "phase", phase, state: "started" });
  await send({ type: "phase", phase, state: "succeeded" });
};

await send({ type: "phase", phase: "qvac-import", state: "started" });
await receiveSdkBootstrapAndImport();
await send({ type: "phase", phase: "qvac-import", state: "succeeded" });
await complete("worker-start");
await complete("model-load");
await send({ type: "phase", phase: "inference", state: "started" });
await send({ type: "backend", backend: "gpu" });
await send({ type: "phase", phase: "inference", state: "succeeded" });
await complete("clean-shutdown");
process.kill(process.pid, "SIGKILL");
