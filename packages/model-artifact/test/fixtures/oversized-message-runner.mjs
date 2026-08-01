process.once("message", () => {
  process.send({ kind: "state", token: "x".repeat(1_024) });
  setInterval(() => undefined, 1_000);
});

process.on("SIGTERM", () => undefined);
