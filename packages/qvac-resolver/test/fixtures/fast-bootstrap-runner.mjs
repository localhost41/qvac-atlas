process.once("message", () => {
  process.send?.({ type: "fast-bootstrap-received" });
  process.disconnect();
});
