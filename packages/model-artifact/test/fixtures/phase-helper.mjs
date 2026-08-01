import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const filename = "smollm2-360m-instruct-q8_0.gguf";

function state(token) {
  process.send({ kind: "state", token });
}

export function runAtPhase(phase) {
  process.once("message", async ({ privateRoot, sessionNonce }) => {
    await mkdir(privateRoot, { mode: 0o700, recursive: true });
    const stage = join(privateRoot, `.${filename}.${sessionNonce}.partial`);
    const final = join(privateRoot, filename);
    await writeFile(stage, "partial", { mode: 0o600 });
    state("accepted");
    state("cache-miss");
    state("capacity-ok");
    state("staging-open");
    if (phase === "mid-stream") return hang();
    await link(stage, final);
    state("hard-linked");
    if (phase === "hard-link") return hang();
    await unlink(stage);
    state("staging-unlinked");
    if (phase === "staging-unlink") return hang();
    state("directory-synced");
    if (phase === "directory-sync") return hang();
    state("ready");
    if (phase === "ready") return hang();
    process.exit(2);
  });
  process.on("SIGTERM", () => undefined);
}

function hang() {
  setInterval(() => undefined, 1_000);
}
