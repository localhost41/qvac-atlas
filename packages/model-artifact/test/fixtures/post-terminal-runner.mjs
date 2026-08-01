process.once("message", () => {
  for (const token of ["accepted", "cache-hit", "capacity-ok", "ready"]) {
    process.send({ kind: "state", token });
  }
  process.send({ kind: "result", status: "success", cache: "hit" });
  process.send({ kind: "state", token: "ready" }, () => process.disconnect());
});
