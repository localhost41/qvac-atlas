import assert from "node:assert/strict";
import test from "node:test";

import { collectPlatform } from "../src/platform.js";
import { deterministicPlatform } from "./fixtures.js";

test("platform collection is allowlisted, coarse, and deterministic", () => {
  assert.deepEqual(collectPlatform(deterministicPlatform), {
    platform: {
      os: { family: "macos", version: "24.5.0", build: null },
      architecture: "arm64",
      cpu: {
        vendor: "Apple",
        model: "Apple M3 Pro",
        family: null,
        feature_flags: [],
      },
      memory_bucket: "16-31-gib",
      gpus: [],
    },
    nodeVersion: "22.17.0",
    redactionCounts: {
      credentials: 0,
      identifiers: 0,
      network: 0,
      paths: 0,
    },
  });
});

test("unavailable and private platform values become explicit unknowns", () => {
  const collected = collectPlatform({
    platform: () => "aix",
    release: () => "/Users/private/workstation",
    arch: () => "riscv64",
    cpus: () => [{ model: "owner@example.invalid" }],
    totalmem: () => Number.NaN,
    nodeVersion: () => "22.17.0",
  });
  assert.equal(collected.platform.os.family, "unknown");
  assert.equal(collected.platform.os.version, "unknown");
  assert.equal(collected.platform.architecture, "unknown");
  assert.equal(collected.platform.cpu.model, "unknown");
  assert.equal(collected.platform.memory_bucket, "unknown");
  assert.deepEqual(collected.redactionCounts, {
    credentials: 0,
    identifiers: 1,
    network: 0,
    paths: 1,
  });
  assert.equal(JSON.stringify(collected).includes("private"), false);
});

test("each redacted platform label increments every applicable category once", () => {
  const collected = collectPlatform({
    ...deterministicPlatform,
    release: () => "Bearer atlas_fixture_1234567890 at 2001:db8::1",
    cpus: () => [{ model: "owner@example.invalid /Users/private/model" }],
  });
  assert.equal(collected.platform.os.version, "unknown");
  assert.equal(collected.platform.cpu.model, "unknown");
  assert.deepEqual(collected.redactionCounts, {
    credentials: 1,
    identifiers: 1,
    network: 1,
    paths: 1,
  });
});
