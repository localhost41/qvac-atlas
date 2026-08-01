import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

process.once("message", async ({ privateRoot, sessionNonce }) => {
  await mkdir(privateRoot, { mode: 0o700, recursive: true });
  await writeFile(
    join(
      privateRoot,
      `.smollm2-360m-instruct-q8_0.gguf.${sessionNonce}.partial`,
    ),
    "partial",
    { mode: 0o600 },
  );
  process.send({ kind: "state", token: "accepted" });
  process.send({ kind: "state", token: "cache-miss" });
  process.send({ kind: "state", token: "capacity-ok" });
  process.send({ kind: "state", token: "staging-open" }, () => process.exit(2));
});
