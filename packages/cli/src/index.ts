#!/usr/bin/env node

import { LocalMockProbeAdapter, type ProbeAdapter } from "./mock-adapter.js";

export function renderFixtureResult(adapter: ProbeAdapter): string {
  const fixture = adapter.runFixture();

  return [
    "QVAC Atlas CLI scaffold",
    `Fixture status: ${fixture.label}`,
    `Scenario: ${fixture.scenario}`,
    "No system inspection, QVAC execution, report validation, or upload occurred.",
  ].join("\n");
}

function main(): void {
  const [command] = process.argv.slice(2);

  if (command !== undefined && command !== "fixture") {
    console.error("Usage: qvac-atlas [fixture]");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${renderFixtureResult(new LocalMockProbeAdapter())}\n`);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
