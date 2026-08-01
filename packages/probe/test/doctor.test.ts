import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  NodeDoctorExecutor,
  ProjectLocalDoctorAdapter,
  ProjectLocalDoctorLocator,
  type DoctorExecution,
  type DoctorLocator,
} from "../src/doctor.js";

function doctorJson(ok = true): string {
  const ids = ["runtime", "hardware", "targets", "tools", "project"];
  return JSON.stringify({
    ok,
    platform: "darwin",
    arch: "arm64",
    nodeVersion: "22.17.0",
    sections: ids.map((id) => ({
      id,
      title: id,
      checks: [
        {
          id: `${id}-check`,
          label: "/Users/private/project",
          status: ok ? "pass" : "fail",
          severity: "required",
          hint: "C:\\Users\\private\\project",
        },
      ],
    })),
  });
}

const resolved: DoctorLocator = {
  locate: async () => ({
    kind: "resolved",
    entryPath: "/private/doctor-entry.js",
  }),
};

test("Doctor normalization retains only a strict summary and strips raw paths", async () => {
  const execution: DoctorExecution = {
    exitCode: 0,
    stdout: doctorJson(),
    durationMs: 12,
    timedOut: false,
    overflowed: false,
  };
  const result = await new ProjectLocalDoctorAdapter(resolved, {
    execute: async () => execution,
  }).run("/project");
  assert.deepEqual(result, {
    evidence: { status: "passed", reason: "completed", duration_ms: 12 },
    diagnostic: "doctor-passed",
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("truncated, inconsistent, and spoofed Doctor JSON is unknown", async () => {
  const values = [
    '{"ok":true}',
    JSON.stringify({ ...JSON.parse(doctorJson()), sections: [] }),
    doctorJson(false),
  ];
  const exits = [0, 0, 0];
  for (let index = 0; index < values.length; index += 1) {
    const result = await new ProjectLocalDoctorAdapter(resolved, {
      execute: async () => ({
        exitCode: exits[index]!,
        stdout: values[index]!,
        durationMs: 1,
        timedOut: false,
        overflowed: false,
      }),
    }).run("/project");
    if (index === 2) assert.equal(result.diagnostic, "doctor-reported-failure");
    else assert.equal(result.diagnostic, "doctor-invalid-output");
  }
});

test("unavailable local CLI is unknown evidence, not a compatibility failure", async () => {
  const result = await new ProjectLocalDoctorAdapter(
    {
      locate: async () => ({
        kind: "unavailable",
        code: "qvac-cli-not-locally-resolvable",
      }),
    },
    {
      execute: async () => {
        throw new Error("must not execute");
      },
    },
  ).run("/project");
  assert.deepEqual(result.evidence, {
    status: "unknown",
    reason: "unavailable",
    duration_ms: null,
  });
});

test("locator accepts only directly declared exact @qvac/cli 0.9.0 with its known bin", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-doctor-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "node_modules", "@qvac", "cli", "dist"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { "@qvac/cli": "0.9.0" } }),
  );
  const cliManifest = path.join(
    root,
    "node_modules",
    "@qvac",
    "cli",
    "package.json",
  );
  await writeFile(
    cliManifest,
    JSON.stringify({
      name: "@qvac/cli",
      version: "0.9.0",
      bin: { qvac: "dist/index.js" },
    }),
  );
  await writeFile(
    path.join(root, "node_modules", "@qvac", "cli", "dist", "index.js"),
    "",
  );
  assert.equal(
    (await new ProjectLocalDoctorLocator().locate(root)).kind,
    "resolved",
  );

  await writeFile(
    cliManifest,
    JSON.stringify({
      name: "@qvac/cli",
      version: "0.10.0",
      bin: { qvac: "dist/index.js" },
    }),
  );
  assert.deepEqual(await new ProjectLocalDoctorLocator().locate(root), {
    kind: "unavailable",
    code: "qvac-cli-unsafe",
  });
});

test("Doctor timeout escalates to SIGKILL and settles for a signal-ignoring child", async (context) => {
  if (process.platform === "win32") return context.skip("POSIX signal fixture");
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-doctor-timeout-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const entry = path.join(root, "doctor.js");
  await writeFile(
    entry,
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    "utf8",
  );
  const started = Date.now();
  const result = await new NodeDoctorExecutor({
    timeoutMs: 40,
    graceMs: 20,
    hardSettleMs: 500,
  }).execute(entry, root);
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 1_000);
});
