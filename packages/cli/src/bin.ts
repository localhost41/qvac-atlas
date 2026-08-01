#!/usr/bin/env node

import { createInterface } from "node:readline/promises";

import { runFixtureProbe } from "@qvac-atlas/probe";

import { dispatchCli } from "./internal-dispatcher.js";

let reader: ReturnType<typeof createInterface> | undefined;
try {
  process.exitCode = await dispatchCli(
    process.argv.slice(2),
    {
      interactive: false,
      isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
      cwd: () => process.cwd(),
      ask: (question) => {
        reader ??= createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        return reader.question(question);
      },
      askReal: (question, signal) => {
        reader ??= createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        return reader.question(question, { signal });
      },
      stdout: (value) => process.stdout.write(value),
      stderr: (value) => process.stderr.write(value),
      onSigint: (listener) => {
        process.once("SIGINT", listener);
        return () => process.off("SIGINT", listener);
      },
      runProbe: (options, interaction) =>
        runFixtureProbe(options, {
          interaction,
          doctor: {
            run: async () => ({
              evidence: {
                status: "passed" as const,
                reason: "completed" as const,
                duration_ms: 1,
              },
            }),
          },
        }),
    },
    false,
  );
} finally {
  reader?.close();
}
