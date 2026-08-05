import path from "node:path";

import { auditPackage } from "./package-audit-lib.mjs";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();

if (args.length !== 1 || /[\x00-\x1f\x7f-\x9f]/u.test(args[0])) {
  process.stderr.write(
    "Usage: pnpm package:audit -- <path-to-qvac-atlas-0.2.0.tgz>\n",
  );
  process.exitCode = 2;
} else {
  try {
    const result = await auditPackage(path.resolve(args[0]));
    process.stdout.write(
      `Package audit passed: ${result.filename} ${String(result.byteLength)} bytes sha256:${result.sha256}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Package audit failed safely"}\n`,
    );
    process.exitCode = 1;
  }
}
