import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { userInfo } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { globalAgent as httpsGlobalAgent } from "node:https";
import { after, afterEach, test } from "node:test";

import {
  ArtifactError,
  PINNED_MODEL_CANDIDATE,
  VerifiedArtifactCapability,
} from "../dist/index.js";
import { acquireContainedPinnedArtifact } from "../dist/contained.js";
import { internalRunAcquisitionSupervisor } from "../dist/contained-internal.js";
import {
  internalInspectArtifact,
  internalIssueConsent,
} from "../dist/internal.js";
import { internalRecoverOwnedStaging } from "../dist/recovery.js";
import {
  internalAcquireArtifact,
  internalPinnedHttpsByteSource,
  internalPinnedHttpsTransport,
} from "../dist/service.js";

const temporaryDirectories = [];
const NONCE = "0123456789abcdef0123456789abcdef0123456789abcdef";
const originalHttpsAddRequest = httpsGlobalAgent.addRequest;
let unexpectedNetworkCalls = 0;
httpsGlobalAgent.addRequest = function blockedHttpsRequest() {
  unexpectedNetworkCalls += 1;
  throw new Error("network-disabled-in-acceptance-tests");
};

after(() => {
  httpsGlobalAgent.addRequest = originalHttpsAddRequest;
  assert.equal(unexpectedNetworkCalls, 0);
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function paths() {
  const created = await mkdtemp(join(tmpdir(), "qvac-atlas-contained-"));
  const parent = await realpath(created);
  temporaryDirectories.push(parent);
  return { parent, root: join(parent, "models") };
}

function syntheticCandidate(bytes) {
  return Object.freeze({
    ...PINNED_MODEL_CANDIDATE,
    id: "synthetic-contained-artifact",
    filename: "synthetic-contained.gguf",
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

function sourceOf(bytes) {
  return async function* () {
    yield bytes;
  };
}

function response({
  statusCode,
  location,
  contentLength,
  contentEncoding,
  contentRange,
  invalidHeaders,
  bytes = Buffer.from("abc"),
}) {
  let discarded = false;
  return {
    statusCode,
    location,
    contentLength,
    contentEncoding,
    contentRange,
    invalidHeaders,
    body: sourceOf(bytes)(),
    discard() {
      discarded = true;
    },
    wasDiscarded() {
      return discarded;
    },
  };
}

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function assertCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ArtifactError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("production HTTPS request constructs only exact Host, Accept, and User-Agent headers", async () => {
  let rawHeaders;
  httpsGlobalAgent.addRequest = function captureRequest(request) {
    rawHeaders = request.getRawHeaderNames().sort();
    throw new Error("captured-without-network");
  };
  try {
    await assert.rejects(
      internalPinnedHttpsTransport(
        new URL(PINNED_MODEL_CANDIDATE.sourceUrl),
        new AbortController().signal,
      ),
      /captured-without-network/,
    );
  } finally {
    httpsGlobalAgent.addRequest = function blockedHttpsRequest() {
      unexpectedNetworkCalls += 1;
      throw new Error("network-disabled-in-acceptance-tests");
    };
  }
  assert.deepEqual(rawHeaders, ["Accept", "Host", "User-Agent"]);
});

test("manual source accepts only the finite official redirect authority", async (t) => {
  const hosts = [
    "cas-server.xethub.hf.co",
    "cas-server.xethub-eu.hf.co",
    "transfer.xethub.hf.co",
    "transfer.xethub-eu.hf.co",
    "us.aws.cdn.hf.co",
    "us.gcp.cdn.hf.co",
    "cdn-lfs-us-1.hf.co",
    "cdn-lfs-eu-1.hf.co",
  ];
  const candidate = { ...PINNED_MODEL_CANDIDATE, byteLength: 3 };
  for (const host of hosts) {
    await t.test(host, async () => {
      const seen = [];
      const redirected = response({
        statusCode: 302,
        location: `https://${host}/signed/model?SECRET=query`,
      });
      const transport = async (url) => {
        seen.push(url.href);
        return seen.length === 1
          ? redirected
          : response({ statusCode: 200, contentLength: "3" });
      };
      const body = await internalPinnedHttpsByteSource(
        { candidate, signal: new AbortController().signal },
        transport,
      );
      assert.equal((await collect(body)).toString(), "abc");
      assert.equal(seen[0], PINNED_MODEL_CANDIDATE.sourceUrl);
      assert.equal(new URL(seen[1]).hostname, host);
      assert.equal(redirected.wasDiscarded(), true);
    });
  }
});

test("manual source rejects redirects, response variants, and scalar ambiguity", async (t) => {
  const candidate = { ...PINNED_MODEL_CANDIDATE, byteLength: 3 };
  const cases = [
    [
      "downgrade",
      response({ statusCode: 302, location: "http://transfer.xethub.hf.co/x" }),
    ],
    [
      "credentials",
      response({
        statusCode: 302,
        location: "https://u:p@transfer.xethub.hf.co/x",
      }),
    ],
    [
      "fragment",
      response({
        statusCode: 302,
        location: "https://transfer.xethub.hf.co/x#f",
      }),
    ],
    [
      "private ip",
      response({ statusCode: 302, location: "https://127.0.0.1/x" }),
    ],
    [
      "unexpected host",
      response({ statusCode: 302, location: "https://evil.invalid/x" }),
    ],
    ["missing location", response({ statusCode: 302 })],
    [
      "partial response",
      response({ statusCode: 206, contentRange: "bytes 0-2/3" }),
    ],
    [
      "encoded response",
      response({ statusCode: 200, contentEncoding: "gzip" }),
    ],
    [
      "content range",
      response({ statusCode: 200, contentRange: "bytes 0-2/3" }),
    ],
    ["duplicate scalar", response({ statusCode: 200, invalidHeaders: true })],
    ["wrong length", response({ statusCode: 200, contentLength: "4" })],
  ];
  for (const [name, first] of cases) {
    await t.test(name, async () => {
      await assertCode(
        internalPinnedHttpsByteSource(
          { candidate, signal: new AbortController().signal },
          async () => first,
        ),
        name === "wrong length"
          ? "artifact-size-mismatch"
          : "artifact-source-failed",
      );
      assert.equal(first.wasDiscarded(), true);
    });
  }

  await t.test("loop", async () => {
    const target = "https://transfer.xethub.hf.co/signed";
    let calls = 0;
    await assertCode(
      internalPinnedHttpsByteSource(
        { candidate, signal: new AbortController().signal },
        async () => {
          calls += 1;
          return response({ statusCode: 302, location: target });
        },
      ),
      "artifact-source-failed",
    );
    assert.equal(calls, 2);
  });

  await t.test("more than three redirects", async () => {
    let calls = 0;
    await assertCode(
      internalPinnedHttpsByteSource(
        { candidate, signal: new AbortController().signal },
        async () => {
          calls += 1;
          return response({
            statusCode: 302,
            location: `https://transfer.xethub.hf.co/${calls}`,
          });
        },
      ),
      "artifact-source-failed",
    );
    assert.equal(calls, 4);
  });
});

test("capacity is checked after cache inspection and before any source effect", async () => {
  const miss = await paths();
  let sourceCalls = 0;
  let required;
  await assertCode(
    internalAcquireArtifact({
      privateRoot: miss.root,
      consent: internalIssueConsent({
        candidateId: PINNED_MODEL_CANDIDATE.id,
        privateRoot: miss.root,
      }),
      candidate: PINNED_MODEL_CANDIDATE,
      sessionNonce: NONCE,
      byteSource: () => {
        sourceCalls += 1;
        return sourceOf(Buffer.from("never"))();
      },
      capacityCheck: (_root, bytes) => {
        required = bytes;
        throw new ArtifactError("artifact-capacity-insufficient");
      },
    }),
    "artifact-capacity-insufficient",
  );
  assert.equal(required, 923_275_904n);
  assert.equal(sourceCalls, 0);
  assert.deepEqual(await readdir(miss.root), []);

  const hit = await paths();
  const bytes = Buffer.from("tiny-cache-hit");
  const candidate = syntheticCandidate(bytes);
  await internalAcquireArtifact({
    privateRoot: hit.root,
    consent: internalIssueConsent({
      candidateId: candidate.id,
      privateRoot: hit.root,
    }),
    candidate,
    byteSource: sourceOf(bytes),
  });
  await internalAcquireArtifact({
    privateRoot: hit.root,
    consent: internalIssueConsent({
      candidateId: candidate.id,
      privateRoot: hit.root,
    }),
    candidate,
    byteSource: () => {
      throw new Error("source-must-not-run");
    },
    capacityCheck: (_root, value) => {
      assert.equal(value, 536_870_912n);
    },
  });
});

test("exact-nonce recovery removes only safe owned staging", async (t) => {
  const bytes = Buffer.from("recoverable");
  const candidate = syntheticCandidate(bytes);
  const stageName = `.${candidate.filename}.${NONCE}.partial`;

  await t.test("one-link partial and foreign canary", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, stageName), bytes.subarray(0, 3), {
      mode: 0o600,
    });
    await writeFile(join(root, "foreign-canary"), "keep", { mode: 0o600 });
    await internalRecoverOwnedStaging({
      privateRoot: root,
      sessionNonce: NONCE,
      candidate,
    });
    assert.deepEqual(await readdir(root), ["foreign-canary"]);
  });

  await t.test("verified two-link publish", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    const stage = join(root, stageName);
    const final = join(root, candidate.filename);
    await writeFile(stage, bytes, { mode: 0o600 });
    await link(stage, final);
    await internalRecoverOwnedStaging({
      privateRoot: root,
      sessionNonce: NONCE,
      candidate,
    });
    assert.equal(await readFile(final, "utf8"), bytes.toString());
    assert.equal((await lstat(final)).nlink, 1);
  });

  await t.test("oversized or corrupt entries are preserved", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    const stage = join(root, stageName);
    const final = join(root, candidate.filename);
    await writeFile(stage, Buffer.alloc(bytes.length, 120), { mode: 0o600 });
    await link(stage, final);
    await assertCode(
      internalRecoverOwnedStaging({
        privateRoot: root,
        sessionNonce: NONCE,
        candidate,
      }),
      "artifact-cleanup-failed",
    );
    assert.equal((await lstat(stage)).nlink, 2);
    assert.equal((await lstat(final)).nlink, 2);
  });

  await t.test("oversized one-link partial is preserved", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    const stage = join(root, stageName);
    await writeFile(stage, Buffer.alloc(bytes.length + 1), { mode: 0o600 });
    await assertCode(
      internalRecoverOwnedStaging({
        privateRoot: root,
        sessionNonce: NONCE,
        candidate,
      }),
      "artifact-cleanup-failed",
    );
    assert.equal((await lstat(stage)).size, bytes.length + 1);
  });

  await t.test("model-sized sparse overflow is preserved", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    const stage = join(
      root,
      `.${PINNED_MODEL_CANDIDATE.filename}.${NONCE}.partial`,
    );
    const handle = await open(stage, "wx", 0o600);
    await handle.truncate(PINNED_MODEL_CANDIDATE.byteLength + 1);
    await handle.close();
    await assertCode(
      internalRecoverOwnedStaging({
        privateRoot: root,
        sessionNonce: NONCE,
      }),
      "artifact-cleanup-failed",
    );
    assert.equal(
      (await lstat(stage)).size,
      PINNED_MODEL_CANDIDATE.byteLength + 1,
    );
  });

  await t.test("symlink and wrong-mode entries are preserved", async () => {
    for (const kind of ["symlink", "mode"]) {
      const { root } = await paths();
      await mkdir(root, { mode: 0o700 });
      const stage = join(root, stageName);
      if (kind === "symlink") {
        const foreign = join(root, "foreign-target");
        await writeFile(foreign, "foreign", { mode: 0o600 });
        await symlink(foreign, stage);
      } else {
        await writeFile(stage, "partial", { mode: 0o600 });
        await chmod(stage, 0o644);
      }
      await assertCode(
        internalRecoverOwnedStaging({
          privateRoot: root,
          sessionNonce: NONCE,
          candidate,
        }),
        "artifact-cleanup-failed",
      );
      await lstat(stage);
    }
  });

  await t.test(
    "substitution immediately before unlink is preserved",
    async () => {
      const { root } = await paths();
      await mkdir(root, { mode: 0o700 });
      const stage = join(root, stageName);
      const moved = join(root, "original-partial");
      await writeFile(stage, bytes.subarray(0, 3), { mode: 0o600 });
      await assertCode(
        internalRecoverOwnedStaging({
          privateRoot: root,
          sessionNonce: NONCE,
          candidate,
          hooks: {
            beforeUnlink: async () => {
              await rename(stage, moved);
              await writeFile(stage, "foreign", { mode: 0o600 });
            },
          },
        }),
        "artifact-cleanup-failed",
      );
      assert.equal(await readFile(stage, "utf8"), "foreign");
      assert.equal(
        await readFile(moved, "utf8"),
        bytes.subarray(0, 3).toString(),
      );
    },
  );
});

test("contained supervisor accepts only a clean reaped protocol success", async () => {
  const { root } = await paths();
  const started = performance.now();
  const capability = await internalRunAcquisitionSupervisor({
    privateRoot: root,
    sessionNonce: NONCE,
    timeoutMs: 2_000,
    recoveryTimeoutMs: 2_000,
    runnerUrl: new URL("./fixtures/success-hit-runner.mjs", import.meta.url),
  });
  assert.ok(capability instanceof VerifiedArtifactCapability);
  assert.equal(
    internalInspectArtifact(capability).candidate,
    PINNED_MODEL_CANDIDATE,
  );
  assert.ok(performance.now() - started < 1_500);
});

test("contained supervisor preserves fixed child errors and kills protocol violations promptly", async () => {
  const first = await paths();
  await assertCode(
    internalRunAcquisitionSupervisor({
      privateRoot: first.root,
      sessionNonce: NONCE,
      timeoutMs: 2_000,
      recoveryTimeoutMs: 2_000,
      runnerUrl: new URL("./fixtures/error-runner.mjs", import.meta.url),
    }),
    "artifact-source-failed",
  );

  const second = await paths();
  const started = performance.now();
  await assertCode(
    internalRunAcquisitionSupervisor({
      privateRoot: second.root,
      sessionNonce: NONCE,
      timeoutMs: 5_000,
      recoveryTimeoutMs: 2_000,
      runnerUrl: new URL("./fixtures/invalid-hang-runner.mjs", import.meta.url),
    }),
    "artifact-worker-protocol-invalid",
  );
  assert.ok(performance.now() - started < 2_000);
});

test("protocol rejects oversized and post-terminal messages", async (t) => {
  for (const fixture of ["oversized-message", "post-terminal"]) {
    await t.test(fixture, async () => {
      const { root } = await paths();
      await assertCode(
        internalRunAcquisitionSupervisor({
          privateRoot: root,
          sessionNonce: NONCE,
          timeoutMs: 2_000,
          recoveryTimeoutMs: 2_000,
          runnerUrl: new URL(
            `./fixtures/${fixture}-runner.mjs`,
            import.meta.url,
          ),
        }),
        "artifact-worker-protocol-invalid",
      );
    });
  }
});

test("fast root exit with inherited pipes sweeps descendants before capability", async () => {
  const { root } = await paths();
  const capability = await internalRunAcquisitionSupervisor({
    privateRoot: root,
    sessionNonce: NONCE,
    timeoutMs: 2_000,
    recoveryTimeoutMs: 2_000,
    runnerUrl: new URL(
      "./fixtures/root-exit-descendant-runner.mjs",
      import.meta.url,
    ),
  });
  assert.ok(capability instanceof VerifiedArtifactCapability);
});

test("timeout reaps the whole acquisition group before exact recovery", async () => {
  const { root } = await paths();
  await mkdir(root, { mode: 0o700 });
  await assertCode(
    internalRunAcquisitionSupervisor({
      privateRoot: root,
      sessionNonce: NONCE,
      timeoutMs: 100,
      recoveryTimeoutMs: 2_000,
      runnerUrl: new URL(
        "./fixtures/staging-grandchild-runner.mjs",
        import.meta.url,
      ),
    }),
    "artifact-acquisition-timeout",
  );
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.deepEqual(await readdir(root), []);
});

test("crash recovery is phase-exact and never grants uncertain bytes", async (t) => {
  const cases = [
    ["mid-stream", "artifact-acquisition-timeout", []],
    [
      "hard-link",
      "artifact-cleanup-failed",
      [
        `.smollm2-360m-instruct-q8_0.gguf.${NONCE}.partial`,
        PINNED_MODEL_CANDIDATE.filename,
      ],
    ],
    [
      "staging-unlink",
      "artifact-acquisition-timeout",
      [PINNED_MODEL_CANDIDATE.filename],
    ],
    [
      "directory-sync",
      "artifact-acquisition-timeout",
      [PINNED_MODEL_CANDIDATE.filename],
    ],
    [
      "ready",
      "artifact-acquisition-timeout",
      [PINNED_MODEL_CANDIDATE.filename],
    ],
  ];
  for (const [phase, code, expectedNames] of cases) {
    await t.test(phase, async () => {
      const { root } = await paths();
      await mkdir(root, { mode: 0o700 });
      await writeFile(join(root, "foreign-canary"), "keep", { mode: 0o600 });
      await assertCode(
        internalRunAcquisitionSupervisor({
          privateRoot: root,
          sessionNonce: NONCE,
          timeoutMs: 100,
          recoveryTimeoutMs: 2_000,
          runnerUrl: new URL(`./fixtures/${phase}-runner.mjs`, import.meta.url),
        }),
        code,
      );
      assert.deepEqual(
        (await readdir(root)).sort(),
        ["foreign-canary", ...expectedNames].sort(),
      );
      assert.equal(
        await readFile(join(root, "foreign-canary"), "utf8"),
        "keep",
      );
    });
  }

  await t.test("fast root exit", async () => {
    const { root } = await paths();
    await mkdir(root, { mode: 0o700 });
    await assertCode(
      internalRunAcquisitionSupervisor({
        privateRoot: root,
        sessionNonce: NONCE,
        timeoutMs: 2_000,
        recoveryTimeoutMs: 2_000,
        runnerUrl: new URL("./fixtures/fast-exit-runner.mjs", import.meta.url),
      }),
      "artifact-worker-failed",
    );
    assert.deepEqual(await readdir(root), []);
  });
});

test("abort settles the child and owned recovery before returning", async () => {
  const { root } = await paths();
  await mkdir(root, { mode: 0o700 });
  const controller = new AbortController();
  const operation = internalRunAcquisitionSupervisor({
    privateRoot: root,
    sessionNonce: NONCE,
    timeoutMs: 5_000,
    recoveryTimeoutMs: 2_000,
    signal: controller.signal,
    runnerUrl: new URL("./fixtures/mid-stream-runner.mjs", import.meta.url),
  });
  setTimeout(() => controller.abort(), 100);
  await assertCode(operation, "artifact-acquisition-aborted");
  assert.deepEqual(await readdir(root), []);
});

test("recovery never deletes an exact-name entry before legal ownership acknowledgement", async () => {
  const { root } = await paths();
  await mkdir(root, { mode: 0o700 });
  const stage = join(
    root,
    `.${PINNED_MODEL_CANDIDATE.filename}.${NONCE}.partial`,
  );
  await writeFile(stage, "foreign-exact-name", { mode: 0o600 });
  await assertCode(
    internalRunAcquisitionSupervisor({
      privateRoot: root,
      sessionNonce: NONCE,
      timeoutMs: 100,
      recoveryTimeoutMs: 2_000,
      runnerUrl: new URL(
        "./fixtures/pre-staging-hang-runner.mjs",
        import.meta.url,
      ),
    }),
    "artifact-acquisition-timeout",
  );
  assert.equal(await readFile(stage, "utf8"), "foreign-exact-name");
});

test("public contained transaction is fixed-root, decision-bound, and path-free", async () => {
  let disclosure;
  const originalHome = process.env.HOME;
  process.env.HOME = "/hostile/environment/cache-root";
  try {
    await assertCode(
      acquireContainedPinnedArtifact({
        decide(value) {
          disclosure = value;
          return false;
        },
      }),
      "artifact-consent-required",
    );
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }
  assert.equal(Object.isFrozen(disclosure), true);
  assert.equal(disclosure.candidate, PINNED_MODEL_CANDIDATE);
  assert.equal(
    disclosure.destinationPath,
    join(
      userInfo().homedir,
      ".qvac-atlas-models",
      PINNED_MODEL_CANDIDATE.filename,
    ),
  );

  const canary = "/SECRET-PROXY-GETTER";
  await assertCode(
    acquireContainedPinnedArtifact(
      new Proxy(
        {},
        {
          get() {
            throw new Error(canary);
          },
        },
      ),
    ),
    "artifact-request-invalid",
  );
});
