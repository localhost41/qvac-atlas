import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BoundRealOutput } from "../src/real-output.js";

test("same-directory publication writes exact 0600 bytes without staging residue", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-output-"));
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target);
    assert.equal(await output.preflight(new AbortController().signal), true);
    const exact = '{"schema":"exact"}\n';
    assert.deepEqual(await output.writeExclusive(exact), { status: "written" });
    assert.equal(await readFile(target, "utf8"), exact);
    const stat = await lstat(target);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.nlink, 1);
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("no-clobber publication preserves a target racer and cleans staging", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-race-"));
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target);
    assert.equal(await output.preflight(new AbortController().signal), true);
    await writeFile(target, "foreign", { mode: 0o644 });
    assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
      status: "write-failed",
    });
    assert.equal(await readFile(target, "utf8"), "foreign");
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("occupied and aborted preflight refuse without mutation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-preflight-"));
  try {
    const target = path.join(root, "report.json");
    await writeFile(target, "owned-by-user");
    const output = new BoundRealOutput(target);
    assert.equal(await output.preflight(new AbortController().signal), false);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => output.preflight(controller.signal), {
      name: "AbortError",
    });
    assert.equal(await readFile(target, "utf8"), "owned-by-user");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failures at every staged boundary remove only Atlas-owned names", async () => {
  const hookNames = [
    "afterStageCreate",
    "afterWrite",
    "afterSync",
    "afterStageValidation",
    "afterLink",
    "afterStagingUnlink",
  ] as const;
  for (const hookName of hookNames) {
    const root = await mkdtemp(path.join(tmpdir(), `atlas-real-${hookName}-`));
    try {
      const target = path.join(root, "report.json");
      const output = new BoundRealOutput(target, {
        [hookName]: async () => {
          throw new Error("injected-private-failure");
        },
      });
      assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
        status: "write-failed",
      });
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("post-link foreign replacement is preserved while owned staging is removed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-replace-"));
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target, {
      afterLink: async (_staging, outputPath) => {
        await unlink(outputPath);
        await writeFile(outputPath, "foreign-replacement", { mode: 0o644 });
      },
    });
    assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
      status: "write-failed",
    });
    assert.equal(await readFile(target, "utf8"), "foreign-replacement");
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("post-link mode drift fails closed and removes the owned inode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-mode-"));
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target, {
      afterLink: async (_staging, outputPath) => chmod(outputPath, 0o644),
    });
    assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
      status: "write-failed",
    });
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent publishers produce one exact winner and no staging residue", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-concurrent-"));
  try {
    const target = path.join(root, "report.json");
    const payloads = ['{"publisher":1}\n', '{"publisher":2}\n'];
    const results = await Promise.all(
      payloads.map((payload) =>
        new BoundRealOutput(target).writeExclusive(payload),
      ),
    );
    assert.deepEqual(results.map((result) => result.status).sort(), [
      "write-failed",
      "written",
    ]);
    assert.equal(payloads.includes(await readFile(target, "utf8")), true);
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("directory-sync failure does not misreport an authoritative exact target", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-dirsync-"));
  try {
    const target = path.join(root, "report.json");
    const exact = '{"authoritative":true}\n';
    const output = new BoundRealOutput(target, {
      afterDirectorySync: async () => {
        throw new Error("injected-directory-sync-failure");
      },
    });
    assert.deepEqual(await output.writeExclusive(exact), { status: "written" });
    assert.equal(await readFile(target, "utf8"), exact);
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("post-sync foreign replacement is preserved and does not report success", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "atlas-real-postsync-replace-"),
  );
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target, {
      afterDirectorySync: async (outputPath) => {
        await unlink(outputPath);
        await writeFile(outputPath, "foreign-post-sync");
      },
    });
    assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
      status: "write-failed",
    });
    assert.equal(await readFile(target, "utf8"), "foreign-post-sync");
    assert.deepEqual(await readdir(root), ["report.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("post-sync same-size mutation is detected and its owned inode removed", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "atlas-real-postsync-mutate-"),
  );
  try {
    const target = path.join(root, "report.json");
    const exact = '{"ours":true}\n';
    const replacement = "x".repeat(Buffer.byteLength(exact));
    const output = new BoundRealOutput(target, {
      afterDirectorySync: async (outputPath) => {
        await writeFile(outputPath, replacement);
      },
    });
    assert.deepEqual(await output.writeExclusive(exact), {
      status: "write-failed",
    });
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("permanent owned unlink failure returns cleanup-uncertain", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-real-unlink-fail-"));
  try {
    const target = path.join(root, "report.json");
    const output = new BoundRealOutput(target, {
      afterLink: async () => {
        throw new Error("force-rollback");
      },
      unlinkFile: async () => {
        const error = new Error(
          "injected-permanent-unlink-failure",
        ) as Error & {
          code: string;
        };
        error.code = "EPERM";
        throw error;
      },
    });
    assert.deepEqual(await output.writeExclusive('{"ours":true}\n'), {
      status: "cleanup-uncertain",
    });
    assert.equal((await readdir(root)).length >= 1, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
