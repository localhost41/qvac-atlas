import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";

import {
  ArtifactError,
  PINNED_MODEL_CANDIDATE,
  VerifiedArtifactCapability,
  acquirePinnedArtifact,
  createPinnedArtifactDisclosure,
} from "../dist/index.js";
import {
  internalAcquireArtifact,
  internalConsumeArtifact,
  internalInspectArtifact,
  internalIssueConsent,
} from "../dist/internal.js";

const temporaryDirectories = [];
const originalFetch = globalThis.fetch;
let networkCalls = 0;
const networkUrls = [];
globalThis.fetch = async (input) => {
  networkCalls += 1;
  networkUrls.push(String(input));
  throw new Error("network-disabled-in-acceptance-tests");
};

after(() => {
  globalThis.fetch = originalFetch;
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function testPaths() {
  const created = await mkdtemp(join(tmpdir(), "qvac-atlas-artifact-"));
  const parent = await realpath(created);
  temporaryDirectories.push(parent);
  return { parent, root: join(parent, "private") };
}

function syntheticCandidate(bytes) {
  return Object.freeze({
    id: "synthetic-artifact",
    sourceUrl: "https://invalid.test/synthetic.gguf",
    revision: "0000000000000000000000000000000000000000",
    filename: "synthetic.gguf",
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    license: "Apache-2.0",
    engine: "llamacpp-completion",
  });
}

function consent(root, candidate) {
  return internalIssueConsent({ candidateId: candidate.id, privateRoot: root });
}

function sourceOf(...chunks) {
  return async function* ({ signal }) {
    assert.equal(signal.aborted, false);
    for (const chunk of chunks) yield chunk;
  };
}

async function acquire(root, bytes, overrides = {}) {
  const candidate = overrides.candidate ?? syntheticCandidate(bytes);
  return internalAcquireArtifact({
    privateRoot: root,
    candidate,
    consent: overrides.consent ?? consent(root, candidate),
    byteSource: overrides.byteSource ?? sourceOf(bytes),
    timeoutMs: overrides.timeoutMs ?? 2_000,
    signal: overrides.signal,
    hooks: overrides.hooks,
  });
}

async function assertCode(promise, code, canary) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ArtifactError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.deepEqual(error.toJSON(), { code });
    if (canary !== undefined) {
      assert.equal(error.message.includes(canary), false);
      assert.equal(JSON.stringify(error).includes(canary), false);
    }
    return true;
  });
}

async function partials(root) {
  try {
    return (await readdir(root)).filter((name) => name.endsWith(".partial"));
  } catch {
    return [];
  }
}

test("pins the exact reviewed candidate and creates a pure disclosure", async () => {
  const { root } = await testPaths();
  assert.deepEqual(PINNED_MODEL_CANDIDATE, {
    id: "smollm2-360m-instruct-q8_0",
    sourceUrl:
      "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf",
    revision: "593b5a2e04c8f3e4ee880263f93e0bd2901ad47f",
    filename: "smollm2-360m-instruct-q8_0.gguf",
    byteLength: 386_404_992,
    sha256: "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
    license: "Apache-2.0",
    engine: "llamacpp-completion",
  });
  const disclosure = createPinnedArtifactDisclosure(root);
  assert.equal(
    disclosure.destinationPath,
    join(root, PINNED_MODEL_CANDIDATE.filename),
  );
  assert.deepEqual(disclosure.effects, [
    "create-private-directory",
    "write-private-file",
    "download-exact-pinned-https-artifact-on-cache-miss",
  ]);
  await assert.rejects(lstat(root), { code: "ENOENT" });

  const profile = JSON.parse(
    await readFile(
      new URL(
        "../../../profiles/candidates/smollm2-360m-instruct-q8.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(
    {
      revision: PINNED_MODEL_CANDIDATE.revision,
      file: PINNED_MODEL_CANDIDATE.filename,
      size_bytes: PINNED_MODEL_CANDIDATE.byteLength,
      sha256: PINNED_MODEL_CANDIDATE.sha256,
      license: PINNED_MODEL_CANDIDATE.license,
      engine: PINNED_MODEL_CANDIDATE.engine,
    },
    {
      revision: profile.revision,
      file: profile.file,
      size_bytes: profile.size_bytes,
      sha256: profile.sha256,
      license: profile.license,
      engine: profile.engine,
    },
  );
  assert.equal(profile.claim_eligible, false);
});

test("invalid public requests fail with fixed path-free ArtifactError", async () => {
  const canary = "relative/SECRET-PRIVATE-ROOT";
  assert.throws(
    () => createPinnedArtifactDisclosure(canary),
    (error) => {
      assert.ok(error instanceof ArtifactError);
      assert.equal(error.code, "artifact-request-invalid");
      assert.equal(error.message, "artifact-request-invalid");
      assert.equal(error.stack.includes(canary), false);
      return true;
    },
  );
  await assertCode(
    acquirePinnedArtifact({ privateRoot: canary, consent: Object.freeze({}) }),
    "artifact-request-invalid",
    canary,
  );
  await assertCode(acquirePinnedArtifact(null), "artifact-request-invalid");
  assert.equal(networkCalls, 0);
});

test("refuses forged consent before filesystem or byte-source effects", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("valid");
  const candidate = syntheticCandidate(bytes);
  let sourceCalls = 0;
  await assertCode(
    internalAcquireArtifact({
      privateRoot: root,
      candidate,
      consent: Object.freeze({}),
      byteSource: () => {
        sourceCalls += 1;
        return sourceOf(bytes)({ signal: new AbortController().signal });
      },
    }),
    "artifact-consent-required",
  );
  assert.equal(sourceCalls, 0);
  await assert.rejects(lstat(root), { code: "ENOENT" });

  await assertCode(
    acquirePinnedArtifact({
      privateRoot: root,
      consent: Object.freeze({}),
      timeoutMs: 50,
    }),
    "artifact-consent-required",
  );
  assert.equal(networkCalls, 0);
  await assert.rejects(lstat(root), { code: "ENOENT" });
});

test("public acquisition ignores hostile candidate, source, and hook extras", async () => {
  const { root } = await testPaths();
  let hostileSourceCalled = false;
  let hostileHookCalled = false;
  const issued = internalIssueConsent({
    candidateId: PINNED_MODEL_CANDIDATE.id,
    privateRoot: root,
  });
  const beforeCalls = networkCalls;
  await assertCode(
    acquirePinnedArtifact({
      privateRoot: root,
      consent: issued,
      timeoutMs: 2_000,
      candidate: {
        ...PINNED_MODEL_CANDIDATE,
        sourceUrl: "https://hostile.invalid/private-model",
        byteLength: 1,
        sha256: "0".repeat(64),
      },
      byteSource: () => {
        hostileSourceCalled = true;
        return sourceOf(Buffer.from("x"))({
          signal: new AbortController().signal,
        });
      },
      hooks: {
        afterStagingOpen: () => {
          hostileHookCalled = true;
        },
      },
    }),
    "artifact-source-failed",
  );
  assert.equal(hostileSourceCalled, false);
  assert.equal(hostileHookCalled, false);
  assert.equal(networkCalls, beforeCalls + 1);
  assert.equal(networkUrls.at(-1), PINNED_MODEL_CANDIDATE.sourceUrl);
  assert.deepEqual(await partials(root), []);
});

test("acquires atomically with private modes and returns only an opaque capability", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("small verified model artifact");
  const candidate = syntheticCandidate(bytes);
  const capability = await acquire(root, bytes, { candidate });
  assert.ok(capability instanceof VerifiedArtifactCapability);
  assert.equal(JSON.stringify(capability), undefined);
  assert.equal(
    await readFile(join(root, candidate.filename), "utf8"),
    bytes.toString(),
  );
  if (process.platform !== "win32") {
    assert.equal((await lstat(root)).mode & 0o777, 0o700);
    assert.equal(
      (await lstat(join(root, candidate.filename))).mode & 0o777,
      0o600,
    );
  }
  assert.deepEqual(await partials(root), []);
  const material = internalInspectArtifact(capability);
  assert.equal(material.candidate, candidate);
  assert.equal(
    material.canonicalPath,
    await import("node:fs/promises").then(({ realpath }) =>
      realpath(join(root, candidate.filename)),
    ),
  );
});

test("fully rehashes a cache hit without reading the source", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("cache me");
  const candidate = syntheticCandidate(bytes);
  await acquire(root, bytes, { candidate });
  let sourceCalls = 0;
  const capability = await acquire(root, bytes, {
    candidate,
    byteSource: () => {
      sourceCalls += 1;
      throw new Error("must-not-read-source");
    },
  });
  assert.ok(capability instanceof VerifiedArtifactCapability);
  assert.equal(sourceCalls, 0);
});

test("consent is bound and single-use even after acquisition failure", async () => {
  const first = await testPaths();
  const second = await testPaths();
  const bytes = Buffer.from("consent");
  const candidate = syntheticCandidate(bytes);
  const issued = consent(first.root, candidate);
  await assertCode(
    acquire(second.root, bytes, { candidate, consent: issued }),
    "artifact-consent-required",
  );
  await assertCode(
    acquire(first.root, bytes.subarray(0, 2), {
      candidate,
      consent: issued,
    }),
    "artifact-size-mismatch",
  );
  await assertCode(
    acquire(first.root, bytes, { candidate, consent: issued }),
    "artifact-consent-required",
  );

  const failureConsent = consent(first.root, candidate);
  await assertCode(
    acquire(first.root, bytes, {
      candidate,
      consent: failureConsent,
      byteSource: sourceOf(bytes.subarray(0, 2)),
    }),
    "artifact-size-mismatch",
  );
  await assertCode(
    acquire(first.root, bytes, { candidate, consent: failureConsent }),
    "artifact-consent-required",
  );
});

test("bounds truncation, overflow, wrong hash, and thrown source with cleanup", async (t) => {
  const bytes = Buffer.from("expected-content");
  const candidate = syntheticCandidate(bytes);
  const cases = [
    ["truncation", sourceOf(bytes.subarray(0, 3)), "artifact-size-mismatch"],
    ["overflow", sourceOf(bytes, Buffer.from("x")), "artifact-size-mismatch"],
    [
      "wrong hash",
      sourceOf(Buffer.alloc(bytes.length, 120)),
      "artifact-hash-mismatch",
    ],
    [
      "thrown source",
      async function* () {
        yield bytes.subarray(0, 2);
        throw new Error("secret-upstream-body");
      },
      "artifact-source-failed",
    ],
  ];
  for (const [name, byteSource, code] of cases) {
    await t.test(name, async () => {
      const { root } = await testPaths();
      await assertCode(acquire(root, bytes, { candidate, byteSource }), code);
      assert.deepEqual(await partials(root), []);
      assert.equal((await readdir(root)).includes(candidate.filename), false);
    });
  }
});

test("aborts and settles a never-yielding source at the fixed overall timeout", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("timeout");
  const candidate = syntheticCandidate(bytes);
  let observedAbort = false;
  const byteSource = ({ signal }) => ({
    [Symbol.asyncIterator]() {
      signal.addEventListener("abort", () => {
        observedAbort = true;
      });
      return {
        next: () => new Promise(() => {}),
        return: async () => ({ done: true, value: undefined }),
      };
    },
  });
  await assertCode(
    acquire(root, bytes, { candidate, byteSource, timeoutMs: 20 }),
    "artifact-acquisition-timeout",
  );
  assert.equal(observedAbort, true);
  assert.deepEqual(await partials(root), []);
});

test("deadline reason wins when abort synchronously rejects the source", async () => {
  const bytes = Buffer.from("abort-race");
  const candidate = syntheticCandidate(bytes);
  const rejectingSource = ({ signal }) => ({
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("source-abort-race")),
              { once: true },
            );
          }),
        return: async () => ({ done: true, value: undefined }),
      };
    },
  });

  const timed = await testPaths();
  await assertCode(
    acquire(timed.root, bytes, {
      candidate,
      byteSource: rejectingSource,
      timeoutMs: 20,
    }),
    "artifact-acquisition-timeout",
  );
  assert.deepEqual(await partials(timed.root), []);

  const aborted = await testPaths();
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 20);
  try {
    await assertCode(
      acquire(aborted.root, bytes, {
        candidate,
        byteSource: rejectingSource,
        signal: controller.signal,
      }),
      "artifact-acquisition-aborted",
    );
  } finally {
    clearTimeout(abortTimer);
  }
  assert.deepEqual(await partials(aborted.root), []);
});

test("times out a stalled cache verification and supports caller abort", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("bounded-cache");
  const candidate = syntheticCandidate(bytes);
  await acquire(root, bytes, { candidate });
  let cacheHandleClosed = false;
  await assertCode(
    acquire(root, bytes, {
      candidate,
      timeoutMs: 20,
      hooks: {
        afterCacheOpen: () => new Promise(() => {}),
        afterCacheClose: async (handle) => {
          await assert.rejects(handle.stat(), { code: "EBADF" });
          cacheHandleClosed = true;
        },
      },
    }),
    "artifact-acquisition-timeout",
  );
  assert.equal(cacheHandleClosed, true);

  const next = await testPaths();
  const controller = new AbortController();
  controller.abort();
  await assertCode(
    acquire(next.root, bytes, { candidate, signal: controller.signal }),
    "artifact-acquisition-aborted",
  );
  await assert.rejects(lstat(next.root), { code: "ENOENT" });
});

test("expiry immediately after staging open closes and removes the partial", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("staging-open-timeout");
  const candidate = syntheticCandidate(bytes);
  let stagingHandleClosed = false;
  await assertCode(
    acquire(root, bytes, {
      candidate,
      timeoutMs: 20,
      hooks: {
        afterStagingOpen: () => new Promise(() => {}),
        afterStagingClose: async (handle) => {
          await assert.rejects(handle.stat(), { code: "EBADF" });
          stagingHandleClosed = true;
        },
      },
    }),
    "artifact-acquisition-timeout",
  );
  assert.equal(stagingHandleClosed, true);
  assert.deepEqual(await partials(root), []);
});

test("rejects an infinite zero-byte source without microtask starvation", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("nonempty");
  const candidate = syntheticCandidate(bytes);
  const byteSource = async function* () {
    for (;;) yield new Uint8Array(0);
  };
  await assertCode(
    acquire(root, bytes, { candidate, byteSource, timeoutMs: 20 }),
    "artifact-source-failed",
  );
  assert.deepEqual(await partials(root), []);
});

test("never overwrites a target that appears at publish time", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("collision");
  const candidate = syntheticCandidate(bytes);
  await assertCode(
    acquire(root, bytes, {
      candidate,
      hooks: {
        beforePublish: async (destination) => {
          await writeFile(destination, "other-owner", { mode: 0o600 });
        },
      },
    }),
    "artifact-publish-collision",
  );
  assert.equal(
    await readFile(join(root, candidate.filename), "utf8"),
    "other-owner",
  );
  assert.deepEqual(await partials(root), []);
});

test("rejects same-size mutation after publication and removes its inode", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("GOOD");
  const candidate = syntheticCandidate(bytes);
  await assertCode(
    acquire(root, bytes, {
      candidate,
      hooks: {
        afterRename: async (destination) => {
          await writeFile(destination, "EVIL", { mode: 0o600 });
        },
      },
    }),
    "artifact-publish-failed",
  );
  assert.deepEqual(await readdir(root), []);
});

test("rechecks ancestor components after publication before issuing capability", async () => {
  const { parent } = await testPaths();
  const container = join(parent, "container");
  const moved = join(parent, "moved");
  const root = join(container, "private");
  await mkdir(container, { mode: 0o700 });
  const bytes = Buffer.from("ancestor-race");
  const candidate = syntheticCandidate(bytes);
  await assertCode(
    acquire(root, bytes, {
      candidate,
      hooks: {
        afterRename: async () => {
          await rename(container, moved);
          await symlink(moved, container);
        },
      },
    }),
    "artifact-private-root-unsafe",
  );
  assert.deepEqual(await readdir(join(moved, "private")), []);
});

test("rejects symlinks, non-regular targets, and unsafe permissions", async (t) => {
  const bytes = Buffer.from("unsafe target");
  const candidate = syntheticCandidate(bytes);

  await t.test("root symlink", async () => {
    const { parent, root } = await testPaths();
    const real = join(parent, "real");
    await mkdir(real, { mode: 0o700 });
    await symlink(real, root);
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-private-root-unsafe",
    );
  });

  await t.test("parent-component symlink", async () => {
    const { parent } = await testPaths();
    const realParent = join(parent, "real-parent");
    const alias = join(parent, "alias-parent");
    await mkdir(realParent, { mode: 0o700 });
    await symlink(realParent, alias);
    const root = join(alias, "private");
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-private-root-unsafe",
    );
    await assert.rejects(lstat(join(realParent, "private")), {
      code: "ENOENT",
    });
  });

  await t.test("root permissions", async () => {
    const { root } = await testPaths();
    await mkdir(root, { mode: 0o700 });
    await chmod(root, 0o755);
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-private-root-unsafe",
    );
  });

  await t.test("target symlink", async () => {
    const { parent, root } = await testPaths();
    await mkdir(root, { mode: 0o700 });
    const outside = join(parent, "outside");
    await writeFile(outside, bytes);
    await symlink(outside, join(root, candidate.filename));
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-cache-unsafe",
    );
  });

  await t.test("target directory", async () => {
    const { root } = await testPaths();
    await mkdir(root, { mode: 0o700 });
    await mkdir(join(root, candidate.filename), { mode: 0o700 });
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-cache-unsafe",
    );
  });

  await t.test("target permissions", async () => {
    const { root } = await testPaths();
    await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, candidate.filename), bytes, { mode: 0o600 });
    await chmod(join(root, candidate.filename), 0o644);
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-cache-unsafe",
    );
  });

  await t.test("hard-linked cache target", async () => {
    const { parent, root } = await testPaths();
    await mkdir(root, { mode: 0o700 });
    const outside = join(parent, "outside-hard-link");
    await writeFile(outside, bytes, { mode: 0o600 });
    await link(outside, join(root, candidate.filename));
    await assertCode(
      acquire(root, bytes, { candidate }),
      "artifact-cache-unsafe",
    );
  });
});

test("verified capability resists forgery and is internally single-use-ready", async () => {
  const { root } = await testPaths();
  const bytes = Buffer.from("opaque");
  const capability = await acquire(root, bytes);
  const forged = Object.create(Object.getPrototypeOf(capability));
  assert.equal(internalInspectArtifact(forged), undefined);
  assert.equal(internalConsumeArtifact(forged), undefined);
  assert.ok(internalConsumeArtifact(capability));
  assert.equal(internalConsumeArtifact(capability), undefined);
});

test("all source failures remain fixed and path-free", async () => {
  const { parent, root } = await testPaths();
  const canary = `${parent}-SECRET-SOURCE-URL-AND-BODY`;
  const bytes = Buffer.from("redaction");
  await assertCode(
    acquire(root, bytes, {
      byteSource: () => {
        throw new Error(canary);
      },
    }),
    "artifact-source-failed",
    canary,
  );
});

test("remains dormant, package-private, and network-free under acceptance", async () => {
  const { readFile: read } = await import("node:fs/promises");
  const packageManifest = JSON.parse(
    await read(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(packageManifest.exports), ["."]);
  const publicApi = await import("../dist/index.js");
  assert.equal(
    Object.keys(publicApi).some(
      (name) => name.startsWith("internal") || name.includes("IssueConsent"),
    ),
    false,
  );
  for (const relative of [
    "../../cli/package.json",
    "../../probe/package.json",
    "../../catalog/package.json",
    "../../schema/package.json",
    "../../qvac-executor/package.json",
  ]) {
    const manifest = await read(new URL(relative, import.meta.url), "utf8");
    assert.equal(manifest.includes("@qvac-atlas/model-artifact"), false);
  }
  assert.equal(networkCalls, 0);
});
