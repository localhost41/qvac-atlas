process.once("message", () => {
  process.send({ kind: "state", token: "accepted" });
  process.send({ kind: "state", token: "cache-hit" });
  process.send({ kind: "state", token: "capacity-ok" });
  process.send({ kind: "state", token: "ready" });
  process.send({ kind: "result", status: "success", cache: "hit" }, () =>
    process.disconnect(),
  );
});
