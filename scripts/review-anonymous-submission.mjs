import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  admitExactSubmission,
  MAX_REPORT_BYTES,
} from "../packages/submission/dist/index.js";

function reject() {
  throw new Error("Anonymous submission review failed safely.");
}

export async function reviewAnonymousSubmission(inputPath) {
  if (
    typeof inputPath !== "string" ||
    inputPath.length === 0 ||
    inputPath.length > 4_096 ||
    /[\x00-\x1f\x7f-\x9f]/u.test(inputPath)
  ) {
    reject();
  }
  const path = resolve(inputPath);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | noFollow);
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size <= 0n ||
      before.size > BigInt(MAX_REPORT_BYTES)
    )
      reject();
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      BigInt(bytes.byteLength) !== before.size
    ) {
      reject();
    }
    const exactJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const submission = admitExactSubmission(exactJson);
    return Object.freeze({
      reportId: submission.reportId,
      targetPath: `reports/v1/sha256-${submission.digest}.json`,
      sourceMetadata: Object.freeze({
        independence: "unverified-anonymous",
        kind: "genuine",
        lifecycle: Object.freeze({ state: "active" }),
        path: `reports/v1/sha256-${submission.digest}.json`,
        sourceKey: "source:anonymous-relay",
      }),
    });
  } catch {
    reject();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function main() {
  if (process.argv.length !== 3) reject();
  const result = await reviewAnonymousSubmission(process.argv[2]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
