let sequence = 0;
const send = (event) => process.send?.({ ...event, sequence: sequence++ });

setInterval(() => {}, 1_000);
send({ type: "phase", phase: "qvac-import", state: "started" });
send({ type: "phase", phase: "qvac-import", state: "succeeded" });
send({ type: "phase", phase: "worker-start", state: "started" });
process.send?.({
  type: "phase",
  sequence: sequence++,
  phase: "worker-start",
  state: "succeeded",
  path: "/Users/private/qvac-sdk",
  output: "private generated completion",
});
