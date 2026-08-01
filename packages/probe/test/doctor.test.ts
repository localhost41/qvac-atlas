import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

test("locator accepts the raw and package-manager-normalized official CLI bin shapes", async (context) => {
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
      version: "0.9.0",
      bin: { qvac: "./dist/index.js" },
    }),
  );
  assert.equal(
    (await new ProjectLocalDoctorLocator().locate(root)).kind,
    "resolved",
  );

  await writeFile(
    cliManifest,
    JSON.stringify({
      name: "@qvac/cli",
      version: "0.9.0",
      bin: { qvac: "./dist/other.js" },
    }),
  );
  assert.deepEqual(await new ProjectLocalDoctorLocator().locate(root), {
    kind: "unavailable",
    code: "qvac-cli-unsafe",
  });

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

test("Doctor abort rejects only after a stubborn descendant is absent", async (context) => {
  if (process.platform === "win32") return context.skip("POSIX signal fixture");
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-doctor-abort-"));
  const entry = path.join(root, "doctor.js");
  const marker = path.join(root, "process-tree.json");
  const ready = path.join(root, "descendant.ready");
  const term = path.join(root, "term-signals.txt");
  const descendantProgram = [
    "const {appendFileSync,writeFileSync}=require('node:fs')",
    "const ready=process.argv[1]",
    "const term=process.argv[2]",
    "process.on('SIGTERM',()=>appendFileSync(term,'descendant\\n'))",
    "writeFileSync(ready,'ready')",
    "setInterval(()=>{},1000)",
  ].join(";");
  await writeFile(
    entry,
    [
      "const {spawn}=require('node:child_process')",
      "const {appendFileSync,existsSync,writeFileSync}=require('node:fs')",
      `process.on('SIGTERM',()=>appendFileSync(${JSON.stringify(term)},'root\\n'))`,
      `const child=spawn(process.execPath,['-e',${JSON.stringify(descendantProgram)},${JSON.stringify(ready)},${JSON.stringify(term)}],{stdio:'ignore'})`,
      `const deadline=Date.now()+2000;while(!existsSync(${JSON.stringify(ready)})&&Date.now()<deadline){}`,
      `if(!existsSync(${JSON.stringify(ready)}))throw new Error('descendant-not-ready')`,
      `writeFileSync(${JSON.stringify(marker)},JSON.stringify({root:process.pid,descendant:child.pid}))`,
      "setInterval(()=>{},1000)",
    ].join(";"),
    "utf8",
  );
  const controller = new AbortController();
  let pending: Promise<DoctorExecution> | undefined;
  let processTree:
    { readonly root: number; readonly descendant: number } | undefined;
  context.after(async () => {
    controller.abort();
    await pending?.catch(() => undefined);
    if (processTree !== undefined) {
      for (const pid of [processTree.descendant, processTree.root]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // A passing executor has already removed the complete group.
        }
      }
    }
    await rm(root, { recursive: true, force: true });
  });
  pending = new NodeDoctorExecutor({
    timeoutMs: 5_000,
    graceMs: 60,
    hardSettleMs: 750,
  }).execute(entry, root, controller.signal);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    processTree = await readFile(marker, "utf8").then(
      (value) => JSON.parse(value) as typeof processTree,
      () => undefined,
    );
    if (processTree !== undefined) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(Number.isSafeInteger(processTree?.root), true);
  assert.equal(Number.isSafeInteger(processTree?.descendant), true);
  const abortedAt = Date.now();
  controller.abort();
  await assert.rejects(() => pending, { message: "doctor-aborted" });
  const abortDuration = Date.now() - abortedAt;
  assert.ok(abortDuration >= 40);
  assert.ok(abortDuration < 1_500);
  const termSignals = await readFile(term, "utf8");
  assert.match(termSignals, /root/);
  assert.match(termSignals, /descendant/);
  for (const pid of [processTree!.root, processTree!.descendant]) {
    assert.throws(
      () => process.kill(pid, 0),
      (error: NodeJS.ErrnoException) => error.code === "ESRCH",
    );
  }
  processTree = undefined;
});
