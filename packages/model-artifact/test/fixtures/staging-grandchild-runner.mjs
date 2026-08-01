import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

process.once("message", async ({ privateRoot, sessionNonce }) => {
  await mkdir(privateRoot, { mode: 0o700, recursive: true });
  const stage = join(
    privateRoot,
    `.smollm2-360m-instruct-q8_0.gguf.${sessionNonce}.partial`,
  );
  await writeFile(stage, "partial", { mode: 0o600 });
  spawn(
    process.execPath,
    [
      "-e",
      "setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'escaped'),800);setInterval(()=>{},1000)",
      join(privateRoot, "escaped-descendant"),
    ],
    { stdio: "ignore" },
  );
  process.send({ kind: "state", token: "accepted" });
  process.send({ kind: "state", token: "cache-miss" });
  process.send({ kind: "state", token: "capacity-ok" });
  process.send({ kind: "state", token: "staging-open" });
  setInterval(() => undefined, 1_000);
});

process.on("SIGTERM", () => undefined);
