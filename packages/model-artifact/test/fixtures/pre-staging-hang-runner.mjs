process.once("message", () => {
  process.send({ kind: "state", token: "accepted" });
  process.send({ kind: "state", token: "cache-miss" });
  process.send({ kind: "state", token: "capacity-ok" });
  setInterval(() => undefined, 1_000);
});

process.on("SIGTERM", () => undefined);
