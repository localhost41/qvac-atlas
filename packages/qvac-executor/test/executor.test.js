import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assembleFixtureReport,
  StructuredRunnerAdapter,
  validateLocalReport,
} from "@qvac-atlas/probe";
import { resolveProjectLocalSdk } from "@qvac-atlas/qvac-resolver";
import { PINNED_MODEL_CANDIDATE } from "@qvac-atlas/model-artifact";

import {
  createQvacModelExecutionGrant,
  ProjectLocalQvacExecutor,
  QvacModelExecutionGrant,
} from "../dist/index.js";
import { internalIssueArtifact } from "../../model-artifact/dist/internal.js";
import {
  createSyntheticExecutorForTest,
  issueSyntheticModelGrantForTest,
} from "../dist/internal.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRunner = (name) =>
  path.join(packageRoot, "test", "fixtures", name);

const exactSdkManifest = {
  name: "@qvac/sdk",
  version: "0.16.0",
  type: "module",
  main: "./dist/index.js",
  exports: {
    ".": { import: "./dist/index.js", require: "./dist/index.js" },
    "./package": "./package.json",
  },
  license: "Apache-2.0",
};

const happySdk = `
import { fileURLToPath } from 'node:url'
const expectedArtifactPath = fileURLToPath(new URL('../../../../private-artifact/synthetic-model.gguf', import.meta.url))
let state = 'imported'
let loadedPath
const guard = setInterval(() => {}, 1000)
export async function heartbeat() {
  if (state !== 'imported') throw new Error('bad heartbeat order')
  state = 'ready'
}
export async function loadModel(options) {
  if (state !== 'ready') throw new Error('bad load order')
  if (options.modelSrc !== expectedArtifactPath) throw new Error('bad local path')
  if (options.modelType !== 'llamacpp-completion') throw new Error('bad model type')
  if (JSON.stringify(options.modelConfig) !== JSON.stringify({ctx_size:512,device:'gpu',gpu_layers:999})) throw new Error('bad config')
  if (JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(['modelConfig','modelSrc','modelType'])) throw new Error('extra load keys')
  loadedPath = options.modelSrc
  state = 'loaded'
  return 'private-model-id'
}
export async function getLoadedModelInfo(options) {
  if (state !== 'loaded') throw new Error('bad info order')
  if (JSON.stringify(options) !== JSON.stringify({modelId:'private-model-id'})) throw new Error('bad info args')
  return {modelId:'private-model-id',isDelegated:false,modelType:'llamacpp-completion',path:loadedPath}
}
export function completion(options) {
  if (state !== 'loaded') throw new Error('bad completion order')
  if (options.modelId !== 'private-model-id') throw new Error('bad model id')
  if (JSON.stringify(options.history) !== JSON.stringify([{role:'user',content:'Reply with exactly: atlas'}])) throw new Error('bad prompt')
  if (options.stream !== true || JSON.stringify(options.generationParams) !== JSON.stringify({predict:8,seed:1,temp:0})) throw new Error('bad generation')
  state = 'completed'
  return { final: Promise.resolve({ contentText: 'private generated completion', stats: { backendDevice: 'gpu' } }) }
}
export async function unloadModel(options) {
  if (state !== 'completed' && state !== 'loaded') throw new Error('bad unload order')
  if (JSON.stringify(options) !== JSON.stringify({modelId:'private-model-id',clearStorage:false})) throw new Error('bad unload args')
  state = 'unloaded'
}
export async function close() {
  clearInterval(guard)
  if (state === 'imported') { state = 'closed'; return }
  if (state !== 'unloaded') throw new Error('close before unload')
  state = 'closed'
}
`;

function variant(source, replacements) {
  let value = source;
  for (const [before, after] of replacements)
    value = value.replace(before, after);
  return value;
}

function sha256OfZeroBytes(byteLength) {
  const hash = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  for (let remaining = byteLength; remaining > 0;) {
    const length = Math.min(remaining, chunk.length);
    hash.update(chunk.subarray(0, length));
    remaining -= length;
  }
  return hash.digest("hex");
}

async function makeSparseArtifact(project, sha256) {
  const byteLength = PINNED_MODEL_CANDIDATE.byteLength;
  await writeFile(project.artifactPath, Buffer.alloc(0), { mode: 0o600 });
  await truncate(project.artifactPath, byteLength);
  project.artifact = Object.freeze({
    ...project.artifact,
    byteLength,
    sha256,
  });
}

async function makeProject(entrySource = happySdk) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qvac-executor-project-"));
  const sdkRoot = path.join(root, "node_modules", "@qvac", "sdk");
  await mkdir(path.join(sdkRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ private: true, dependencies: { "@qvac/sdk": "0.16.0" } }),
  );
  await writeFile(
    path.join(sdkRoot, "package.json"),
    JSON.stringify(exactSdkManifest),
  );
  await writeFile(path.join(sdkRoot, "dist", "index.js"), entrySource);
  const artifactRoot = path.join(root, "private-artifact");
  const artifactPath = path.join(artifactRoot, "synthetic-model.gguf");
  const artifactBytes = Buffer.from("tiny verified executor artifact");
  await mkdir(artifactRoot, { mode: 0o700 });
  await chmod(artifactRoot, 0o700);
  await writeFile(artifactPath, artifactBytes, { mode: 0o600 });
  await chmod(artifactPath, 0o600);
  const resolved = await resolveProjectLocalSdk(root);
  assert.equal(resolved.status, "resolved");
  return {
    root,
    handle: resolved.handle,
    artifactPath,
    artifactRoot,
    artifact: Object.freeze({
      canonicalPath: await realpath(artifactPath),
      byteLength: artifactBytes.byteLength,
      sha256: createHash("sha256").update(artifactBytes).digest("hex"),
      engine: "llamacpp-completion",
    }),
  };
}

function fastLimits(overrides = {}) {
  const limits = {
    overallMs: 2_000,
    termGraceMs: 40,
    killSettleMs: 500,
    postExitSweepMs: 5,
    maxEvents: 16,
    maxEventBytes: 4 * 1024,
    maxAggregateEventBytes: 16 * 1024,
    maxOutputBytes: 16 * 1024,
    ...overrides,
  };
  limits.phaseMs = {
    "qvac-import": 500,
    "worker-start": 500,
    "model-load": 500,
    inference: 500,
    "clean-shutdown": 500,
    ...overrides.phaseMs,
  };
  return limits;
}

async function runSynthetic(project, internal = {}) {
  const grant = issueSyntheticModelGrantForTest(project.artifact);
  const executor = createSyntheticExecutorForTest({
    sdkHandle: project.handle,
    modelGrant: grant,
    internal: { limits: fastLimits(), ...internal },
  });
  return { executor, events: await executor.execute() };
}

async function validateAsFixtureReport(events) {
  const runner = await new StructuredRunnerAdapter({
    execute: async () => events,
  }).run();
  const report = assembleFixtureReport({
    fixtureId: "worker-crash",
    createdAt: "2026-07-31T00:00:00.000Z",
    publication: false,
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
    qvac: {
      discovery: { status: "passed", reason: "completed", duration_ms: 1 },
      sdk_version: "0.16.0",
      packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
    },
    doctor: { status: "passed", reason: "completed", duration_ms: 1 },
    runner,
  });
  validateLocalReport(report);
  return runner;
}

test("opaque test grant has no enumerable, JSON, or public synthetic issuer surface", async () => {
  const project = await makeProject();
  const grant = issueSyntheticModelGrantForTest(project.artifact);
  assert.deepEqual(Object.keys(grant), []);
  assert.equal(JSON.stringify(grant), undefined);
  assert.equal(JSON.stringify({ grant }), "{}");
  assert.deepEqual(Object.getOwnPropertyNames(grant.constructor).sort(), [
    "length",
    "name",
    "prototype",
  ]);
  const publicApi = await import("../dist/index.js");
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "ProjectLocalQvacExecutor",
    "QvacModelExecutionGrant",
    "createQvacModelExecutionGrant",
  ]);
  await assert.rejects(
    () => import("@qvac-atlas/qvac-executor/internal"),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
  await rm(project.root, { recursive: true, force: true });
});

test("forged execution grant fails before temporary directory or spawn", async (t) => {
  const project = await makeProject();
  const tempParent = await mkdtemp(
    path.join(os.tmpdir(), "qvac-forged-grant-"),
  );
  t.after(() =>
    Promise.all([
      rm(project.root, { recursive: true, force: true }),
      rm(tempParent, { recursive: true, force: true }),
    ]),
  );
  const forged = Object.create(QvacModelExecutionGrant.prototype);
  const executor = createSyntheticExecutorForTest({
    sdkHandle: project.handle,
    modelGrant: forged,
    internal: { tempParent, runnerPath: "/private/must-not-spawn.mjs" },
  });
  const events = await executor.execute();
  assert.equal(events.at(-1).failure.code, "MODEL_EXECUTION_GRANT_INVALID");
  assert.deepEqual(await readdir(tempParent), []);
});

test("Windows refusal occurs before temporary-directory creation or spawn", async (t) => {
  const project = await makeProject();
  const tempParent = await mkdtemp(
    path.join(os.tmpdir(), "qvac-executor-win-refusal-"),
  );
  t.after(() =>
    Promise.all([
      rm(project.root, { recursive: true, force: true }),
      rm(tempParent, { recursive: true, force: true }),
    ]),
  );
  const executor = createSyntheticExecutorForTest({
    sdkHandle: project.handle,
    modelGrant: issueSyntheticModelGrantForTest(project.artifact),
    internal: {
      platform: "win32",
      tempParent,
      runnerPath: path.join(tempParent, "must-not-be-opened.mjs"),
    },
  });
  const events = await executor.execute();
  assert.equal(events.at(-1).failure.code, "WINDOWS_CONTAINMENT_UNAVAILABLE");
  assert.deepEqual(
    await (await import("node:fs/promises")).readdir(tempParent),
    [],
  );
});

test("public executor cannot reuse a consumed synthetic grant", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const grant = issueSyntheticModelGrantForTest(project.artifact);
  const executor = new ProjectLocalQvacExecutor(project.handle, grant);
  const first = await executor.execute();
  assert.equal(first.at(-1).workload_status, "passed");
  const second = await executor.execute();
  assert.equal(second.at(-1).failure.code, "MODEL_EXECUTION_GRANT_INVALID");
  const otherExecutor = new ProjectLocalQvacExecutor(project.handle, grant);
  const third = await otherExecutor.execute();
  assert.equal(third.at(-1).failure.code, "MODEL_EXECUTION_GRANT_INVALID");
});

test("public grant issuer consumes one exact pinned capability opaquely", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const capability = internalIssueArtifact({
    canonicalPath: path.join(
      project.artifactRoot,
      PINNED_MODEL_CANDIDATE.filename,
    ),
    candidate: PINNED_MODEL_CANDIDATE,
  });
  const grant = createQvacModelExecutionGrant(capability);
  assert.deepEqual(Object.keys(grant), []);
  assert.equal(JSON.stringify(grant), undefined);
  assert.throws(
    () => createQvacModelExecutionGrant(capability),
    (error) => error?.code === "artifact-execution-capability-invalid",
  );

  const nonPinned = internalIssueArtifact({
    canonicalPath: project.artifactPath,
    candidate: Object.freeze({
      ...PINNED_MODEL_CANDIDATE,
      filename: path.basename(project.artifactPath),
    }),
  });
  assert.throws(
    () => createQvacModelExecutionGrant(nonPinned),
    (error) => error?.code === "artifact-execution-capability-invalid",
  );
  const forgedCapability = Object.create(Object.getPrototypeOf(capability));
  assert.throws(
    () => createQvacModelExecutionGrant(forgedCapability),
    (error) => error?.code === "artifact-execution-capability-invalid",
  );
});

test("exact-shape SDK completes the audited lifecycle through the probe adapter", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { executor, events } = await runSynthetic(project);
  assert.deepEqual(
    events
      .filter((event) => event.type === "phase")
      .map(({ name, status }) => [name, status]),
    [
      ["qvac-import", "passed"],
      ["worker-start", "passed"],
      ["model-load", "passed"],
      ["inference", "passed"],
      ["clean-shutdown", "passed"],
    ],
  );
  assert.deepEqual(
    events.find((event) => event.type === "backend"),
    {
      type: "backend",
      backend: "gpu",
    },
  );
  assert.equal(events.at(-1).workload_status, "passed");
  const serialized = JSON.stringify(events);
  for (const forbidden of [
    project.root,
    project.artifact.sha256,
    "private-model-id",
    "Reply with exactly",
    "private generated completion",
    "synthetic-pinned-model",
  ])
    assert.equal(serialized.includes(forbidden), false);

  const evidence = await new StructuredRunnerAdapter({
    execute: async () => events,
  }).run();
  assert.equal(evidence.result.workload_status, "passed");
  assert.equal(evidence.backend_observation.backend, "gpu");
});

test("missing optional backend remains unavailable after successful inference", async (t) => {
  const source = happySdk.replace(
    "stats: { backendDevice: 'gpu' }",
    "stats: {} ",
  );
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(
    events.some((event) => event.type === "backend"),
    false,
  );
  const evidence = await new StructuredRunnerAdapter({
    execute: async () => events,
  }).run();
  assert.equal(evidence.result.workload_status, "passed");
  assert.equal(evidence.backend_observation.status, "unavailable");
});

for (const [name, replacement] of [
  ["delegated model", ["isDelegated:false", "isDelegated:true"]],
  [
    "wrong model type",
    [
      "modelType:'llamacpp-completion',path:loadedPath",
      "modelType:'other',path:loadedPath",
    ],
  ],
  [
    "different path",
    ["path:loadedPath", "path:'/private/loaded-info-canary.gguf'"],
  ],
  ["missing path", [",path:loadedPath", ""]],
  [
    "wrong model id",
    [
      "return {modelId:'private-model-id',isDelegated:false",
      "return {modelId:'different-private-id',isDelegated:false",
    ],
  ],
]) {
  test(`loaded-model info rejects ${name} with fixed evidence`, async (t) => {
    const markerName = `loaded-info-cleaned-${name.replaceAll(" ", "-")}`;
    const source =
      `import { writeFile as writeCleanupMarker } from 'node:fs/promises'\n${happySdk.replace(...replacement)}`.replace(
        "  state = 'closed'\n}",
        `  state = 'closed'\n  await writeCleanupMarker(new URL('../../../../${markerName}', import.meta.url), 'closed')\n}`,
      );
    const project = await makeProject(source);
    t.after(() => rm(project.root, { recursive: true, force: true }));
    const { events } = await runSynthetic(project);
    assert.equal(events.at(-1).failure.phase, "model-load");
    assert.equal(events.at(-1).failure.code, "MODEL_LOAD_FAILED");
    assert.equal(JSON.stringify(events).includes("loaded-info-canary"), false);
    assert.equal(
      await readFile(path.join(project.root, markerName), "utf8"),
      "closed",
    );
    assert.equal(JSON.stringify(events).includes(markerName), false);
    await validateAsFixtureReport(events);
  });
}

test("whitespace-only model id fails closed", async (t) => {
  const project = await makeProject(
    happySdk
      .replace("return 'private-model-id'", "return '   '")
      .replace(
        "JSON.stringify({modelId:'private-model-id',clearStorage:false})",
        "JSON.stringify({modelId:'   ',clearStorage:false})",
      ),
  );
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.code, "MODEL_LOAD_FAILED");
  await validateAsFixtureReport(events);
});

for (const mutation of [
  "truncation",
  "same-size corruption",
  "unsafe file mode",
  "unsafe root mode",
  "target symlink",
  "non-regular target",
  "hard link",
  "ancestor substitution",
]) {
  test(`pre-load verification rejects ${mutation} before SDK load`, async (t) => {
    const markerName = "load-model-reached";
    const source =
      `import { writeFile as writeMarker } from 'node:fs/promises'\n${happySdk}`.replace(
        "export async function loadModel(options) {",
        `export async function loadModel(options) {\n  await writeMarker(new URL('../../../../${markerName}', import.meta.url), 'reached')`,
      );
    const project = await makeProject(source);
    t.after(() => rm(project.root, { recursive: true, force: true }));
    if (mutation === "truncation") {
      await truncate(project.artifactPath, project.artifact.byteLength - 1);
    } else if (mutation === "same-size corruption") {
      await writeFile(
        project.artifactPath,
        Buffer.alloc(project.artifact.byteLength, 120),
      );
    } else if (mutation === "unsafe file mode") {
      await chmod(project.artifactPath, 0o644);
    } else if (mutation === "unsafe root mode") {
      await chmod(project.artifactRoot, 0o755);
    } else if (mutation === "target symlink") {
      const outside = path.join(project.root, "outside-symlink.gguf");
      const original = await readFile(project.artifactPath);
      await writeFile(outside, original, { mode: 0o600 });
      await rm(project.artifactPath);
      await symlink(outside, project.artifactPath);
    } else if (mutation === "non-regular target") {
      await rm(project.artifactPath);
      await mkdir(project.artifactPath, { mode: 0o700 });
    } else if (mutation === "hard link") {
      const outside = path.join(project.root, "outside-hard-link.gguf");
      const original = await readFile(project.artifactPath);
      await rm(project.artifactPath);
      await writeFile(outside, original, { mode: 0o600 });
      await link(outside, project.artifactPath);
    } else {
      const moved = path.join(project.root, "moved-private-artifact");
      await rename(project.artifactRoot, moved);
      await symlink(moved, project.artifactRoot);
    }
    const { events } = await runSynthetic(project);
    assert.equal(events.at(-1).failure.code, "MODEL_LOAD_FAILED");
    await assert.rejects(access(path.join(project.root, markerName)));
    await validateAsFixtureReport(events);
  });
}

test("same-size mutation after path exposure fails clean shutdown", async (t) => {
  const source =
    `import { readFile as readArtifact, writeFile as writeArtifact } from 'node:fs/promises'\n${happySdk}`.replace(
      "state = 'unloaded'",
      "state = 'unloaded'; const prior = await readArtifact(expectedArtifactPath); await writeArtifact(expectedArtifactPath, Buffer.alloc(prior.length, 120), {mode:0o600})",
    );
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.phase, "clean-shutdown");
  assert.equal(events.at(-1).failure.code, "CLEAN_SHUTDOWN_FAILED");
  await validateAsFixtureReport(events);
});

test("same-size mutation inside load is detected after close", async (t) => {
  const source =
    `import { readFile as readArtifact, writeFile as writeArtifact } from 'node:fs/promises'\n${happySdk}`.replace(
      "  loadedPath = options.modelSrc",
      "  const prior = await readArtifact(options.modelSrc); await writeArtifact(options.modelSrc, Buffer.alloc(prior.length, 121), {mode:0o600})\n  loadedPath = options.modelSrc",
    );
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.phase, "clean-shutdown");
  assert.equal(events.at(-1).failure.code, "CLEAN_SHUTDOWN_FAILED");
  assert.equal(JSON.stringify(events).includes(project.artifact.sha256), false);
  await validateAsFixtureReport(events);
});

test("byte-identical inode replacement inside load is detected after close", async (t) => {
  const source =
    `import { readFile as readArtifact, unlink as unlinkArtifact, writeFile as writeArtifact } from 'node:fs/promises'\n${happySdk}`.replace(
      "  loadedPath = options.modelSrc",
      "  const prior = await readArtifact(options.modelSrc); await unlinkArtifact(options.modelSrc); await writeArtifact(options.modelSrc, prior, {mode:0o600})\n  loadedPath = options.modelSrc",
    );
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.code, "CLEAN_SHUTDOWN_FAILED");
  assert.equal(JSON.stringify(events).includes(project.artifact.sha256), false);
  await validateAsFixtureReport(events);
});

function bootstrapCleanupSdk(markerName) {
  return `import { writeFile as writeMarker } from 'node:fs/promises'\n${happySdk}`.replace(
    "clearInterval(guard)",
    `clearInterval(guard)\n  await writeMarker(new URL('../../../../${markerName}', import.meta.url), 'closed')`,
  );
}

for (const [name, override] of [
  [
    "extra key",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      extra: "/private/canary",
    }),
  ],
  [
    "zero length",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      byteLength: 0,
    }),
  ],
  [
    "fractional length",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      byteLength: 1.5,
    }),
  ],
  [
    "oversize",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      byteLength: 386_404_993,
    }),
  ],
  [
    "uppercase digest",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      sha256: artifact.sha256.toUpperCase(),
    }),
  ],
  [
    "wrong engine",
    (artifact) => ({
      type: "qvac-atlas-model-artifact-v1",
      ...artifact,
      engine: "other",
    }),
  ],
]) {
  test(`malformed artifact bootstrap (${name}) closes imported SDK`, async (t) => {
    const markerName = `bootstrap-closed-${name.replaceAll(" ", "-")}`;
    const project = await makeProject(bootstrapCleanupSdk(markerName));
    t.after(() => rm(project.root, { recursive: true, force: true }));
    const { events } = await runSynthetic(project, {
      artifactBootstrapOverride: override(project.artifact),
    });
    assert.equal(events.at(-1).failure.code, "QVAC_IMPORT_FAILED");
    assert.equal(
      await readFile(path.join(project.root, markerName), "utf8"),
      "closed",
    );
    assert.equal(JSON.stringify(events).includes("/private/canary"), false);
    await validateAsFixtureReport(events);
  });
}

test("missing artifact bootstrap times out, closes imported SDK, and fails fixed", async (t) => {
  const markerName = "bootstrap-closed-missing";
  const project = await makeProject(bootstrapCleanupSdk(markerName));
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    artifactBootstrapOverride: null,
    limits: fastLimits({
      overallMs: 11_500,
      phaseMs: { "qvac-import": 10_500, "clean-shutdown": 500 },
    }),
  });
  assert.equal(events.at(-1).failure.code, "QVAC_IMPORT_FAILED");
  assert.equal(
    await readFile(path.join(project.root, markerName), "utf8"),
    "closed",
  );
  await validateAsFixtureReport(events);
});

test("missing required SDK function maps to fixed import failure", async (t) => {
  const project = await makeProject(
    happySdk.replace(
      "export async function getLoadedModelInfo",
      "async function getLoadedModelInfo",
    ),
  );
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.phase, "qvac-import");
  assert.equal(events.at(-1).failure.code, "QVAC_IMPORT_FAILED");
  await validateAsFixtureReport(events);
});

test("stalled full prehash remains bounded by model-load deadline", async (t) => {
  const project = await makeProject();
  await makeSparseArtifact(project, "0".repeat(64));
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    limits: fastLimits({
      overallMs: 2_000,
      phaseMs: { "model-load": 5 },
    }),
  });
  assert.equal(events.at(-1).failure.category, "timeout");
  assert.equal(events.at(-1).failure.phase, "model-load");
  await validateAsFixtureReport(events);
});

test("stalled full posthash remains bounded by clean-shutdown deadline", async (t) => {
  const project = await makeProject();
  await makeSparseArtifact(
    project,
    sha256OfZeroBytes(PINNED_MODEL_CANDIDATE.byteLength),
  );
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    limits: fastLimits({
      overallMs: 5_000,
      phaseMs: { "model-load": 3_000, "clean-shutdown": 5 },
    }),
  });
  assert.equal(events.at(-1).failure.category, "timeout");
  assert.equal(events.at(-1).failure.phase, "clean-shutdown");
  await validateAsFixtureReport(events);
});

for (const [name, source, phase, code] of [
  [
    "SDK import failure",
    "throw new Error('private import failure')\n",
    "qvac-import",
    "QVAC_IMPORT_FAILED",
  ],
  [
    "model load failure",
    variant(happySdk, [
      [
        "state = 'loaded'\n  return 'private-model-id'",
        "throw new Error('private load failure')\n  return 'private-model-id'",
      ],
      [
        "if (state !== 'unloaded') throw new Error('close before unload')",
        "if (state !== 'ready') throw new Error('unexpected cleanup state')",
      ],
    ]),
    "model-load",
    "MODEL_LOAD_FAILED",
  ],
  [
    "completion failure",
    variant(happySdk, [
      [
        "state = 'completed'\n  return { final:",
        "throw new Error('private completion failure')\n  return { final:",
      ],
      [
        "if (state !== 'completed' && state !== 'loaded') throw new Error('bad unload order')",
        "if (state !== 'loaded') throw new Error('unexpected cleanup state')",
      ],
    ]),
    "inference",
    "INFERENCE_FAILED",
  ],
  [
    "empty completion",
    happySdk.replace(
      "contentText: 'private generated completion'",
      "contentText: '   '",
    ),
    "inference",
    "INFERENCE_FAILED",
  ],
  [
    "close failure",
    happySdk.replace(
      "  state = 'closed'\n}",
      "  throw new Error('private close failure')\n}",
    ),
    "clean-shutdown",
    "CLEAN_SHUTDOWN_FAILED",
  ],
]) {
  test(`${name} is fixed, path-free, and schema-valid`, async (t) => {
    const project = await makeProject(source);
    t.after(() => rm(project.root, { recursive: true, force: true }));
    const { events } = await runSynthetic(project);
    assert.equal(events.at(-1).failure.phase, phase);
    assert.equal(events.at(-1).failure.code, code);
    assert.equal(JSON.stringify(events).includes("private"), false);
    await validateAsFixtureReport(events);
  });
}

test("unload failure still calls close and preserves cleanup as the primary failure", async (t) => {
  const source = variant(happySdk, [
    [
      "state = 'unloaded'",
      "state = 'unload-attempted'; throw new Error('private unload failure')",
    ],
    [
      "if (state !== 'unloaded') throw new Error('close before unload')",
      "if (state !== 'unload-attempted') throw new Error('close was not attempted after unload failure')",
    ],
  ]);
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.deepEqual(events.at(-1).failure, {
    category: "workload-failed",
    phase: "clean-shutdown",
    code: "CLEAN_SHUTDOWN_FAILED",
    sanitized_excerpt: null,
  });
  assert.equal(events.at(-1).completion_observed, false);
  await validateAsFixtureReport(events);
});

test("earlier lifecycle failure is not overwritten by cleanup", async (t) => {
  const source = variant(happySdk, [
    [
      "state = 'ready'",
      "state = 'heartbeat-failed'; throw new Error('private heartbeat failure')",
    ],
    [
      "if (state !== 'unloaded') throw new Error('close before unload')",
      "if (state !== 'heartbeat-failed') throw new Error('unexpected cleanup state')",
    ],
  ]);
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).failure.phase, "worker-start");
  assert.equal(events.at(-1).failure.code, "WORKER_START_FAILED");
  assert.equal(
    events.some(
      (event) => event.type === "phase" && event.name === "clean-shutdown",
    ),
    false,
  );
  assert.equal(JSON.stringify(events).includes("heartbeat failure"), false);
  await validateAsFixtureReport(events);
});

test("cleanup timeout after a primary failure degrades to schema-valid unknown evidence", async (t) => {
  const source = variant(happySdk, [
    [
      "state = 'ready'",
      "state = 'heartbeat-failed'; throw new Error('private heartbeat failure')",
    ],
    [
      "if (state !== 'unloaded') throw new Error('close before unload')",
      "if (state !== 'heartbeat-failed') throw new Error('unexpected cleanup state')",
    ],
    [
      "  state = 'closed'\n}",
      "  await new Promise(() => { setInterval(() => {}, 1000) })\n}",
    ],
  ]);
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    limits: fastLimits({ phaseMs: { "clean-shutdown": 80 } }),
  });
  assert.equal(events.at(-2).kind, "timeout");
  assert.deepEqual(events.at(-1), {
    type: "result",
    workload_status: "unknown",
    completion_observed: false,
    failure: {
      category: "unknown",
      phase: "worker-start",
      code: "CLEANUP_TIMEOUT_AFTER_FAILURE",
      sanitized_excerpt: null,
    },
  });
  assert.equal(
    events.some(
      (event) => event.type === "phase" && event.name === "clean-shutdown",
    ),
    false,
  );
  await validateAsFixtureReport(events);
});

test("overall timeout after a complete lifecycle is schema-valid inconclusive evidence", async (t) => {
  const source = happySdk.replace("clearInterval(guard)", "void guard");
  const project = await makeProject(source);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    limits: fastLimits({ overallMs: 100 }),
  });
  assert.deepEqual(
    events
      .filter((event) => event.type === "phase")
      .map(({ name, status }) => [name, status]),
    [
      ["qvac-import", "passed"],
      ["worker-start", "passed"],
      ["model-load", "passed"],
      ["inference", "passed"],
      ["clean-shutdown", "passed"],
    ],
  );
  assert.deepEqual(events.at(-2), {
    type: "termination",
    kind: "timeout",
    exit_code: null,
    signal: null,
    last_completed_phase: "clean-shutdown",
  });
  assert.deepEqual(events.at(-1), {
    type: "result",
    workload_status: "unknown",
    completion_observed: false,
    failure: {
      category: "unknown",
      phase: "clean-shutdown",
      code: "TIMEOUT_AFTER_LIFECYCLE",
      sanitized_excerpt: null,
    },
  });
  await validateAsFixtureReport(events);
});

test("stdout and stderr are drained but never exposed", async (t) => {
  const noisy = `process.stdout.write('stdout-private-canary'.repeat(8192)); process.stderr.write('stderr-private-canary'.repeat(8192));\n${happySdk}`;
  const project = await makeProject(noisy);
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project);
  assert.equal(events.at(-1).workload_status, "passed");
  assert.equal(JSON.stringify(events).includes("private-canary"), false);
});

test("structured event caps fail closed before child values reach evidence", async (t) => {
  const project = await makeProject();
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    limits: fastLimits({ maxEvents: 0 }),
  });
  assert.equal(events.at(-1).failure.code, "RUNNER_PROTOCOL_INVALID");
  const evidence = await new StructuredRunnerAdapter({
    execute: async () => events,
  }).run();
  assert.equal(evidence.result.failure.code, "RUNNER_PROTOCOL_INVALID");
});

for (const [name, runner, expected] of [
  [
    "phase timeout",
    "hang-runner.mjs",
    { category: "timeout", phase: "worker-start" },
  ],
  [
    "worker crash",
    "crash-runner.mjs",
    { category: "worker-crash", phase: "worker-start" },
  ],
  [
    "hostile IPC",
    "hostile-runner.mjs",
    { category: "unknown", phase: "worker-start" },
  ],
]) {
  test(`${name} becomes fixed path-free evidence`, async (t) => {
    const project = await makeProject();
    t.after(() => rm(project.root, { recursive: true, force: true }));
    const { events } = await runSynthetic(project, {
      runnerPath: fixtureRunner(runner),
      limits: fastLimits({ phaseMs: { "worker-start": 80 } }),
    });
    assert.equal(events.at(-1).failure.category, expected.category);
    assert.equal(events.at(-1).failure.phase, expected.phase);
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("/Users/private"), false);
    assert.equal(serialized.includes("generated completion"), false);
    await validateAsFixtureReport(events);
    if (name === "hostile IPC") {
      const evidence = await new StructuredRunnerAdapter({
        execute: async () => events,
      }).run();
      assert.equal(evidence.result.failure.code, "RUNNER_PROTOCOL_INVALID");
      assert.deepEqual(evidence.phases.at(-1), {
        name: "worker-start",
        status: "unknown",
        duration_ms: null,
      });
    }
  });
}

test("signal after a complete lifecycle is schema-valid inconclusive evidence", async (t) => {
  const project = await makeProject("export const fixture = true\n");
  t.after(() => rm(project.root, { recursive: true, force: true }));
  const { events } = await runSynthetic(project, {
    runnerPath: fixtureRunner("post-lifecycle-crash-runner.mjs"),
  });
  assert.equal(events.at(-2).kind, "signal");
  assert.deepEqual(events.at(-1), {
    type: "result",
    workload_status: "unknown",
    completion_observed: false,
    failure: {
      category: "unknown",
      phase: "clean-shutdown",
      code: "SIGNAL_AFTER_LIFECYCLE",
      sanitized_excerpt: null,
    },
  });
  await validateAsFixtureReport(events);
});

test(
  "timeout removes a nested grandchild from the detached process group",
  { skip: process.platform === "win32" },
  async (t) => {
    const project = await makeProject("export const fixture = true\n");
    const markerRoot = await mkdtemp(
      path.join(os.tmpdir(), "qvac-executor-tree-"),
    );
    t.after(() =>
      Promise.all([
        rm(project.root, { recursive: true, force: true }),
        rm(markerRoot, { recursive: true, force: true }),
      ]),
    );
    const { events } = await runSynthetic(project, {
      runnerPath: fixtureRunner("grandchild-runner.mjs"),
      tempParent: markerRoot,
      sourceEnv: { ...process.env, TMPDIR: markerRoot },
      limits: fastLimits({ phaseMs: { "model-load": 100 } }),
    });
    assert.equal(events.at(-1).failure.category, "timeout");
    const grandchildPid = Number(
      await readFile(path.join(markerRoot, "grandchild.pid"), "utf8"),
    );
    assert.equal(Number.isSafeInteger(grandchildPid), true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.throws(() => process.kill(grandchildPid, 0));
  },
);

test(
  "post-root-exit sweep removes a surviving process-group descendant",
  { skip: process.platform === "win32" },
  async (t) => {
    const project = await makeProject("export const fixture = true\n");
    const markerRoot = await mkdtemp(
      path.join(os.tmpdir(), "qvac-executor-post-exit-"),
    );
    t.after(() =>
      Promise.all([
        rm(project.root, { recursive: true, force: true }),
        rm(markerRoot, { recursive: true, force: true }),
      ]),
    );
    const { events } = await runSynthetic(project, {
      runnerPath: fixtureRunner("root-exit-grandchild-runner.mjs"),
      tempParent: markerRoot,
      sourceEnv: { ...process.env, TMPDIR: markerRoot },
    });
    assert.equal(events.at(-1).workload_status, "passed");
    const grandchildPid = Number(
      await readFile(path.join(markerRoot, "root-exit-grandchild.pid"), "utf8"),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.throws(() => process.kill(grandchildPid, 0));
  },
);

test("executor package vendors no SDK and implements no downloader or network client", async () => {
  await assert.rejects(() =>
    access(path.join(packageRoot, "node_modules", "@qvac", "sdk")),
  );
  const sourceNames = (await readdir(path.join(packageRoot, "src"))).filter(
    (name) => name.endsWith(".ts"),
  );
  const sources = (
    await Promise.all(
      sourceNames.map((name) =>
        readFile(path.join(packageRoot, "src", name), "utf8"),
      ),
    )
  ).join("\n");
  for (const forbidden of [
    'from "node:http"',
    'from "node:https"',
    'from "node:net"',
    'from "node:tls"',
    "fetch(",
    "npm install",
    "pnpm install",
    "npx ",
    'import("@qvac/sdk")',
  ]) {
    assert.equal(sources.includes(forbidden), false);
  }
});

test("executor remains absent from CLI/probe wiring and candidate claims", async () => {
  const packagesRoot = path.dirname(packageRoot);
  const cliManifest = await readFile(
    path.join(packagesRoot, "cli", "package.json"),
    "utf8",
  );
  const cliSource = await readFile(
    path.join(packagesRoot, "cli", "src", "index.ts"),
    "utf8",
  );
  const probePipeline = await readFile(
    path.join(packagesRoot, "probe", "src", "pipeline.ts"),
    "utf8",
  );
  for (const surface of [cliManifest, cliSource, probePipeline]) {
    assert.equal(surface.includes("qvac-executor"), false);
    assert.equal(surface.includes("ProjectLocalQvacExecutor"), false);
  }
  const candidate = JSON.parse(
    await readFile(
      path.join(
        packagesRoot,
        "..",
        "profiles",
        "candidates",
        "smollm2-360m-instruct-q8.json",
      ),
      "utf8",
    ),
  );
  assert.equal(candidate.claim_eligible, false);
});
