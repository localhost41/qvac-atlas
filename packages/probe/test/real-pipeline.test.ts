import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deriveReportClaim,
  evaluateV1ClaimEvidence,
  scanPrivacy,
  validateReport,
  verifyReportId,
} from "@qvac-atlas/schema";

import {
  CANDIDATE_PROFILE,
  assembleProbeReport,
  serializeReport,
  validateLocalReport,
} from "../src/report.js";
import {
  CANDIDATE_PUBLICATION_WARNING,
  COMBINED_WORKLOAD_DISCLOSURE,
  PROJECT_CODE_DISCLOSURE,
  REAL_PRIVACY_DISCLOSURE,
  runRealProbePipeline,
  type RealProbeDependencies,
} from "../src/real-pipeline.js";
import { RealProbeStateMachine } from "../src/real-state-machine.js";
import type { RunnerEvidence } from "../src/types.js";
import { deterministicPlatform } from "./fixtures.js";

const now = () => new Date("2026-07-31T12:00:00.000Z");
const qvac = {
  discovery: {
    status: "passed" as const,
    reason: "completed" as const,
    duration_ms: 7,
  },
  sdk_version: "0.16.0",
  packages: [{ name: "@qvac/sdk", version: "0.16.0" }],
};

function successfulRunner(): RunnerEvidence {
  return {
    phases: [
      { name: "qvac-import", status: "passed", duration_ms: 1 },
      { name: "worker-start", status: "passed", duration_ms: 2 },
      { name: "model-load", status: "passed", duration_ms: 3 },
      { name: "inference", status: "passed", duration_ms: 4 },
      { name: "clean-shutdown", status: "passed", duration_ms: 5 },
    ],
    backend_observation: {
      status: "observed",
      backend: "gpu",
      method: "runner-event",
    },
    termination: {
      kind: "clean-exit",
      exit_code: 0,
      signal: null,
      last_completed_phase: "clean-shutdown",
    },
    result: {
      workload_status: "passed",
      completion_observed: true,
      failure: {
        category: "none",
        phase: null,
        code: null,
        sanitized_excerpt: null,
      },
    },
  };
}

function failedRunner(): RunnerEvidence {
  return {
    phases: [
      { name: "qvac-import", status: "passed", duration_ms: 1 },
      { name: "worker-start", status: "passed", duration_ms: 2 },
      { name: "model-load", status: "failed", duration_ms: 3 },
    ],
    backend_observation: {
      status: "not-reached",
      backend: null,
      method: "unavailable",
    },
    termination: {
      kind: "exit-code",
      exit_code: 2,
      signal: null,
      last_completed_phase: "worker-start",
    },
    result: {
      workload_status: "failed",
      completion_observed: false,
      failure: {
        category: "native-runtime",
        phase: "model-load",
        code: "MODEL_LOAD_FAILED",
        sanitized_excerpt: null,
      },
    },
  };
}

type HarnessOptions = {
  fingerprint?: unknown;
  project?: unknown;
  workload?: unknown;
  publication?: unknown;
  write?: unknown;
  qvac?: unknown;
  doctor?: unknown;
  runtime?: unknown;
  preflight?: unknown;
  onCall?: (name: string) => void;
};

function harness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const previews: Array<{ kind: "draft" | "final"; json: string }> = [];
  const writes: string[] = [];
  const call = (name: string) => {
    calls.push(name);
    options.onCall?.(name);
  };
  const selected = <K extends keyof HarnessOptions>(
    key: K,
    fallback: unknown,
  ): unknown => (Object.hasOwn(options, key) ? options[key] : fallback);
  const dependencies: RealProbeDependencies = {
    output: {
      preflight: async () => {
        call("output:preflight");
        return selected("preflight", true) as boolean;
      },
      writeExclusive: async (bytes) => {
        call("output:write");
        writes.push(bytes);
      },
    },
    interaction: {
      disclosePrivacy: async () => call("privacy"),
      decideFingerprint: async () => {
        call("fingerprint");
        return selected("fingerprint", true) as boolean;
      },
      discloseProjectCode: async () => call("project:disclose"),
      decideProjectCode: async () => {
        call("project:decide");
        return selected("project", true) as boolean;
      },
      discloseWorkload: async () => call("workload:disclose"),
      decideWorkload: async () => {
        call("workload:decide");
        return selected("workload", true) as boolean;
      },
      preview: async (json, kind) => {
        call(`preview:${kind}`);
        previews.push({ kind, json });
      },
      choosePublication: async () => {
        call("publication");
        return selected("publication", true) as boolean | null;
      },
      confirmLocalWrite: async () => {
        call("write:decide");
        return selected("write", true) as boolean;
      },
    },
    coordinator: {
      resolve: async () => {
        call("resolve");
        return {
          status: "resolved",
          qvac: selected("qvac", qvac) as typeof qvac,
        };
      },
      runDoctor: async () => {
        call("doctor");
        return selected("doctor", {
          status: "passed",
          reason: "completed",
          duration_ms: 8,
        }) as never;
      },
      runWorkload: async () => {
        call("runtime");
        return selected("runtime", {
          status: "executed",
          runner: successfulRunner(),
        }) as never;
      },
    },
    platformSource: {
      ...deterministicPlatform,
      platform: () => {
        call("collect");
        return deterministicPlatform.platform();
      },
    },
    now,
  };
  return { calls, dependencies, previews, writes };
}

test("genuine candidate pipeline preserves consent order and writes exact final preview bytes", async () => {
  const state = harness();
  const result = await runRealProbePipeline(
    { signal: new AbortController().signal },
    state.dependencies,
  );
  assert.equal(result.status, "written");
  assert.deepEqual(state.calls, [
    "output:preflight",
    "privacy",
    "fingerprint",
    "collect",
    "resolve",
    "project:disclose",
    "project:decide",
    "doctor",
    "workload:disclose",
    "workload:decide",
    "runtime",
    "preview:draft",
    "publication",
    "preview:final",
    "write:decide",
    "output:write",
  ]);
  if (result.status !== "written") return;
  const draft = JSON.parse(state.previews[0]!.json);
  assert.equal(draft.consent.publication, false);
  assert.equal(result.report.consent.publication, true);
  assert.equal(draft.report_id, result.report.report_id);
  assert.equal(state.previews[1]!.json, result.exactJson);
  assert.equal(state.writes[0], result.exactJson);
  assert.equal(validateReport(result.report).valid, true);
  assert.deepEqual(scanPrivacy(result.report), []);
  assert.deepEqual(result.report.provenance, {
    kind: "probe",
    fixture_id: null,
  });
  assert.deepEqual(result.report.profile, CANDIDATE_PROFILE);
  assert.equal(Object.isFrozen(result.report), true);
  assert.equal(Object.isFrozen(result.report.execution.phases), true);
});

test("candidate success and lifecycle failure remain ineligible in both central evaluators", async () => {
  const registry = JSON.parse(
    await readFile(
      new URL("../../../registry/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(registry.productionProfiles, []);
  for (const runner of [successfulRunner(), failedRunner()]) {
    const state = harness({
      runtime: { status: "executed", runner },
      write: false,
    });
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "previewed-not-written");
    if (result.status !== "previewed-not-written") continue;
    const evidence = evaluateV1ClaimEvidence(result.report, {
      standardProfiles: registry.productionProfiles,
    });
    assert.equal(evidence.trustedProfile, false);
    assert.equal(evidence.successEligible, false);
    assert.equal(evidence.failureEligible, false);
    const claim = deriveReportClaim(result.report, {
      standardProfiles: registry.productionProfiles,
    });
    assert.equal(claim.claim, "unknown");
    assert.equal(claim.reasons.includes("nonstandard-profile"), true);
  }
  const candidate = JSON.parse(
    await readFile(
      new URL(
        "../../../profiles/candidates/smollm2-360m-instruct-q8.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(candidate.claim_eligible, false);
});

test("each refusal prevents all downstream effects", async () => {
  const cases: Array<[HarnessOptions, string[]]> = [
    [{ fingerprint: false }, ["output:preflight", "privacy", "fingerprint"]],
    [
      { project: false },
      [
        "output:preflight",
        "privacy",
        "fingerprint",
        "collect",
        "resolve",
        "project:disclose",
        "project:decide",
      ],
    ],
    [
      { workload: false },
      [
        "output:preflight",
        "privacy",
        "fingerprint",
        "collect",
        "resolve",
        "project:disclose",
        "project:decide",
        "doctor",
        "workload:disclose",
        "workload:decide",
      ],
    ],
  ];
  for (const [options, expectedCalls] of cases) {
    const state = harness(options);
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "refused");
    assert.deepEqual(state.calls, expectedCalls);
    assert.deepEqual(state.previews, []);
    assert.deepEqual(state.writes, []);
  }
});

test("malformed exact decisions, resolver evidence, runtime evidence, and private fields fail closed", async () => {
  const cases: HarnessOptions[] = [
    { fingerprint: 1 },
    { project: "yes" },
    { workload: null },
    { publication: "yes" },
    { write: 1 },
    { qvac: { ...qvac, sdk_version: "0.16.1" } },
    { qvac: { ...qvac, extra: true } },
    { runtime: { status: "preflight-failed" } },
    {
      runtime: {
        status: "executed",
        runner: {
          ...successfulRunner(),
          result: {
            ...successfulRunner().result,
            failure: {
              ...successfulRunner().result.failure,
              code: "A".repeat(64),
            },
          },
        },
      },
    },
    {
      runtime: {
        status: "executed",
        runner: {
          ...successfulRunner(),
          result: {
            ...successfulRunner().result,
            failure: {
              ...successfulRunner().result.failure,
              sanitized_excerpt: "/Users/secret/model.gguf",
            },
          },
        },
      },
    },
  ];
  for (const options of cases) {
    const state = harness(options);
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "preflight-failed");
    assert.deepEqual(state.writes, []);
  }
});

test("Doctor exceptions and malformed output normalize to unavailable without blocking", async () => {
  for (const invalid of [
    Symbol("invalid"),
    { status: "passed", raw: "/secret" },
  ]) {
    const state = harness({ doctor: invalid, write: false });
    if (typeof invalid === "symbol") {
      state.dependencies.coordinator.runDoctor = async () => {
        throw new Error("/Users/private/doctor");
      };
    }
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "previewed-not-written");
    if (result.status !== "previewed-not-written") continue;
    assert.deepEqual(result.report.official_checks.doctor, {
      status: "unknown",
      reason: "unavailable",
      duration_ms: null,
    });
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("external evidence mutation after draft cannot change the detached final report", async () => {
  const mutableQvac = structuredClone(qvac);
  const mutableRunner = successfulRunner();
  const state = harness({
    qvac: mutableQvac,
    runtime: { status: "executed", runner: mutableRunner },
  });
  const originalPreview = state.dependencies.interaction.preview;
  state.dependencies.interaction.preview = async (json, kind) => {
    await originalPreview(json, kind);
    if (kind === "draft") {
      mutableQvac.sdk_version = "9.9.9";
      mutableRunner.phases[0]!.duration_ms = 999;
    }
  };
  const result = await runRealProbePipeline(
    { signal: new AbortController().signal },
    state.dependencies,
  );
  assert.equal(result.status, "written");
  if (result.status !== "written") return;
  assert.equal(result.report.qvac.sdk_version, "0.16.0");
  assert.equal(result.report.execution.phases[0]!.duration_ms, 1);
});

test("abort after an awaited decision takes priority and stops downstream effects", async () => {
  for (const boundary of [
    "output:preflight",
    "privacy",
    "fingerprint",
    "collect",
    "resolve",
    "project:disclose",
    "project:decide",
    "doctor",
    "workload:disclose",
    "workload:decide",
    "runtime",
    "preview:draft",
    "publication",
    "preview:final",
    "write:decide",
  ]) {
    const controller = new AbortController();
    const state = harness({
      onCall: (name) => {
        if (name === boundary) controller.abort();
      },
    });
    const result = await runRealProbePipeline(
      { signal: controller.signal },
      state.dependencies,
    );
    assert.equal(result.status, "aborted", boundary);
    assert.deepEqual(state.writes, [], boundary);
    assert.equal(
      state.calls.slice(state.calls.indexOf(boundary) + 1).length,
      0,
      boundary,
    );
  }
});

test("an abort during uncancellable exclusive commit still reports the settled write", async () => {
  const controller = new AbortController();
  const state = harness();
  state.dependencies.output.writeExclusive = async (bytes) => {
    state.writes.push(bytes);
    controller.abort();
  };
  const result = await runRealProbePipeline(
    { signal: controller.signal },
    state.dependencies,
  );
  assert.equal(result.status, "written");
  assert.equal(state.writes.length, 1);
});

test("direct candidate assembly is canonical, private, and schema-valid", () => {
  const report = assembleProbeReport({
    createdAt: now().toISOString(),
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
    qvac,
    doctor: { status: "passed", reason: "completed", duration_ms: 8 },
    runner: successfulRunner(),
  });
  validateLocalReport(report);
  assert.deepEqual(scanPrivacy(report), []);
  assert.equal(report.consent.publication, false);
  assert.equal(verifyReportId(report), true);
  assert.equal(serializeReport(report).endsWith("\n"), true);
  assert.equal(serializeReport(report).endsWith("\n\n"), false);
});

test("output vacancy is the first awaited effect and failure has zero downstream effects", async () => {
  for (const mode of ["occupied", "throw"] as const) {
    const state = harness({ preflight: false });
    if (mode === "throw") {
      state.dependencies.output.preflight = async () => {
        state.calls.push("output:preflight");
        throw new Error("/private/output.json");
      };
    }
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "preflight-failed");
    assert.deepEqual(state.calls, ["output:preflight"]);
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("resolver and runtime exact status failures never produce a report or preview", async () => {
  const resolverValues: unknown[] = [
    { status: "failed" },
    { status: "aborted" },
    null,
    { status: "failed", capability: "SECRET" },
  ];
  for (const value of resolverValues) {
    const state = harness();
    state.dependencies.coordinator.resolve = async () => value as never;
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(
      result.status,
      (value as { status?: string } | null)?.status === "aborted"
        ? "aborted"
        : "preflight-failed",
    );
    assert.deepEqual(state.previews, []);
    assert.deepEqual(state.writes, []);
  }
  for (const value of [
    { status: "preflight-failed" },
    { status: "aborted" },
    null,
    { status: "preflight-failed", handle: "SECRET" },
  ]) {
    const state = harness({ runtime: value });
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(
      result.status,
      value?.status === "aborted" ? "aborted" : "preflight-failed",
    );
    assert.deepEqual(state.previews, []);
    assert.deepEqual(state.writes, []);
  }
});

test("thrown and hostile resolver/runtime boundary values fail with fixed no-report results", async () => {
  for (const boundary of ["resolve", "runtime"] as const) {
    const state = harness();
    if (boundary === "resolve") {
      state.dependencies.coordinator.resolve = async () => {
        throw new Error("/Users/private/sdk.js");
      };
    } else {
      state.dependencies.coordinator.runWorkload = async () => {
        throw new Error("https://private.example/model?token=secret");
      };
    }
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "preflight-failed");
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.deepEqual(state.previews, []);
    assert.deepEqual(state.writes, []);
  }
  const state = harness();
  state.dependencies.coordinator.resolve = async () =>
    new Proxy(
      { status: "resolved", qvac },
      {
        get: () => {
          throw new Error("SECRET");
        },
      },
    ) as never;
  const result = await runRealProbePipeline(
    { signal: new AbortController().signal },
    state.dependencies,
  );
  assert.equal(result.status, "preflight-failed");
});

test("runner topology extras, forged methods, and non-executions are rejected before preview", async () => {
  const base = successfulRunner();
  const throwingGetter = structuredClone(base);
  Object.defineProperty(throwingGetter.result, "failure", {
    get: () => {
      throw new Error("/Users/private/model.gguf");
    },
  });
  const runners: unknown[] = [
    new Proxy(base, {}),
    throwingGetter,
    { ...base, capability: "SECRET" },
    {
      ...base,
      phases: [
        { ...base.phases[0], path: "/private" },
        ...base.phases.slice(1),
      ],
    },
    {
      ...base,
      backend_observation: {
        ...base.backend_observation,
        method: "qvac-structured-output",
      },
    },
    { ...base, termination: { ...base.termination, extra: true } },
    { ...base, result: { ...base.result, extra: true } },
    {
      ...base,
      result: {
        ...base.result,
        failure: { ...base.result.failure, extra: true },
      },
    },
    {
      ...base,
      termination: {
        kind: "not-started",
        exit_code: null,
        signal: null,
        last_completed_phase: null,
      },
    },
    {
      ...base,
      termination: {
        kind: "spawn-error",
        exit_code: null,
        signal: null,
        last_completed_phase: null,
      },
    },
  ];
  for (const runner of runners) {
    const state = harness({ runtime: { status: "executed", runner } });
    const result = await runRealProbePipeline(
      { signal: new AbortController().signal },
      state.dependencies,
    );
    assert.equal(result.status, "preflight-failed");
    assert.deepEqual(state.previews, []);
    assert.deepEqual(state.writes, []);
  }
});

test("Doctor timeout is retained, while abort after Doctor stops before workload disclosure", async () => {
  const timedOut = harness({
    doctor: { status: "failed", reason: "timed-out", duration_ms: 250 },
    write: false,
  });
  const timedOutResult = await runRealProbePipeline(
    { signal: new AbortController().signal },
    timedOut.dependencies,
  );
  assert.equal(timedOutResult.status, "previewed-not-written");
  if (timedOutResult.status === "previewed-not-written") {
    assert.deepEqual(timedOutResult.report.official_checks.doctor, {
      status: "failed",
      reason: "timed-out",
      duration_ms: 250,
    });
  }

  const controller = new AbortController();
  const aborted = harness();
  aborted.dependencies.coordinator.runDoctor = async () => {
    aborted.calls.push("doctor");
    controller.abort();
    return { status: "passed", reason: "completed", duration_ms: 1 };
  };
  const abortedResult = await runRealProbePipeline(
    { signal: controller.signal },
    aborted.dependencies,
  );
  assert.equal(abortedResult.status, "aborted");
  assert.equal(aborted.calls.includes("workload:disclose"), false);
});

test("publication cancellation and write refusal preserve preview-only behavior", async () => {
  const cancelled = harness({ publication: null });
  const cancelledResult = await runRealProbePipeline(
    { signal: new AbortController().signal },
    cancelled.dependencies,
  );
  assert.equal(cancelledResult.status, "refused");
  assert.equal(cancelled.previews.length, 1);
  assert.deepEqual(cancelled.writes, []);

  const privateLocal = harness({ publication: false, write: false });
  const privateResult = await runRealProbePipeline(
    { signal: new AbortController().signal },
    privateLocal.dependencies,
  );
  assert.equal(privateResult.status, "previewed-not-written");
  if (privateResult.status === "previewed-not-written") {
    assert.equal(privateResult.report.consent.publication, false);
  }
  assert.deepEqual(privateLocal.writes, []);
});

test("exclusive-write rejection, including concurrent abort, returns fixed write-failed", async () => {
  for (const abort of [false, true]) {
    const controller = new AbortController();
    const state = harness();
    state.dependencies.output.writeExclusive = async () => {
      if (abort) controller.abort();
      throw new Error("/Users/private/output.json");
    };
    const result = await runRealProbePipeline(
      { signal: controller.signal },
      state.dependencies,
    );
    assert.equal(result.status, "write-failed");
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("abort waits for an in-flight runtime boundary to settle before returning", async () => {
  const controller = new AbortController();
  const state = harness();
  let release!: () => void;
  state.dependencies.coordinator.runWorkload = () =>
    new Promise((resolve) => {
      release = () => resolve({ status: "aborted" });
    });
  let settled = false;
  const pending = runRealProbePipeline(
    { signal: controller.signal },
    state.dependencies,
  ).then((result) => {
    settled = true;
    return result;
  });
  while (release === undefined) await Promise.resolve();
  controller.abort();
  await Promise.resolve();
  assert.equal(settled, false);
  release();
  assert.equal((await pending).status, "aborted");
});

test("authoritative disclosures are deeply frozen and contain no runtime capability", () => {
  const disclosures = [
    REAL_PRIVACY_DISCLOSURE,
    PROJECT_CODE_DISCLOSURE,
    COMBINED_WORKLOAD_DISCLOSURE,
    CANDIDATE_PUBLICATION_WARNING,
  ];
  const assertDeepFrozen = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    for (const nested of Object.values(value)) assertDeepFrozen(nested);
  };
  for (const disclosure of disclosures) assertDeepFrozen(disclosure);
  const serialized = JSON.stringify(disclosures);
  assert.equal(serialized.includes("runDoctor"), false);
  assert.equal(serialized.includes("runWorkload"), false);
  assert.equal(serialized.includes("SECRET"), false);
  assert.equal(
    COMBINED_WORKLOAD_DISCLOSURE.artifact.approximateSize,
    "about 368.5 MiB",
  );
});

test("candidate metadata remains non-production and real machinery stays dormant", async () => {
  const candidate = JSON.parse(
    await readFile(
      new URL(
        "../../../profiles/candidates/smollm2-360m-instruct-q8.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const registry = JSON.parse(
    await readFile(
      new URL("../../../registry/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(candidate.profile_id, CANDIDATE_PROFILE.id);
  assert.equal(candidate.profile_version, CANDIDATE_PROFILE.version);
  assert.equal(candidate.sha256, CANDIDATE_PROFILE.artifact_sha256);
  assert.equal(CANDIDATE_PROFILE.requested_backend, "gpu");
  assert.equal(candidate.claim_eligible, false);
  assert.deepEqual(registry.productionProfiles, []);

  const index = await readFile(
    new URL("../src/index.ts", import.meta.url),
    "utf8",
  );
  const manifest = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.equal(index.includes("real-pipeline"), false);
  assert.equal(index.includes("real-state-machine"), false);
  const dormantSource = [
    await readFile(new URL("../src/real-pipeline.ts", import.meta.url), "utf8"),
    await readFile(
      new URL("../src/real-state-machine.ts", import.meta.url),
      "utf8",
    ),
  ].join("\n");
  for (const forbidden of [
    "qvac-resolver",
    "qvac-executor",
    "model-artifact",
    "@qvac-atlas/cli",
    'from "node:fs',
    'from "node:net',
    'from "node:http',
    'from "node:https',
  ]) {
    assert.equal(manifest.includes(forbidden), false, forbidden);
    assert.equal(dormantSource.includes(forbidden), false, forbidden);
  }
});

test("real state machine rejects a skipped or repeated stage", () => {
  const state = new RealProbeStateMachine();
  assert.throws(
    () => state.advance("privacy-disclosed"),
    /invalid-real-probe-transition/,
  );
  state.advance("output-vacant");
  assert.throws(
    () => state.advance("output-vacant"),
    /invalid-real-probe-transition/,
  );
});
