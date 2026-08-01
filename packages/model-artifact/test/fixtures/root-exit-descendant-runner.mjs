import { spawn } from "node:child_process";

process.once("message", () => {
  spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: ["ignore", process.stdout, process.stderr],
  });
  for (const token of ["accepted", "cache-hit", "capacity-ok", "ready"]) {
    process.send({ kind: "state", token });
  }
  process.send({ kind: "result", status: "success", cache: "hit" }, () =>
    process.exit(0),
  );
});
