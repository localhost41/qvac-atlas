setInterval(() => {}, 1_000);
process.send?.({ type: "ready-to-disconnect" });
