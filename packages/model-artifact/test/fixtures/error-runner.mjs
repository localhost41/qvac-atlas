process.once("message", () => {
  process.send({ kind: "state", token: "accepted" });
  process.send(
    { kind: "result", status: "error", code: "artifact-source-failed" },
    () => {
      process.exitCode = 1;
      process.disconnect();
    },
  );
});
