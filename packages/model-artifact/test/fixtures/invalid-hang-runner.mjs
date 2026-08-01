process.once("message", () => {
  process.send({ kind: "state", token: "staging-open" });
  setInterval(() => undefined, 1_000);
});

process.on("SIGTERM", () => undefined);
