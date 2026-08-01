import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readBoundedRegularFile } from "../src/secure-file.js";

async function controlledFile(content = "safe") {
  const root = await mkdtemp(join(tmpdir(), "qvac-atlas-secure-read-"));
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(join(root, "data", "report.json"), content, "utf8");
  return root;
}

function readControlled(root, options = {}) {
  return readBoundedRegularFile({
    root,
    relativePath: "data/report.json",
    allowedDirectory: "data",
    maxBytes: 64,
    label: "controlled report",
    ...options,
  });
}

test("the bounded reader returns one stable descriptor snapshot", async () => {
  const root = await controlledFile();
  assert.equal(await readControlled(root), "safe");
});

test("growth after descriptor open cannot exceed the actual byte cap", async () => {
  const root = await controlledFile();
  await assert.rejects(
    readControlled(root, {
      afterOpen: async ({ lexicalPath }) => {
        await appendFile(lexicalPath, "x".repeat(128), "utf8");
      },
    }),
    /actual bytes read exceed the size limit/,
  );
});

test("a path replacement after descriptor open fails closed", async () => {
  const root = await controlledFile();
  await assert.rejects(
    readControlled(root, {
      afterOpen: async ({ lexicalPath }) => {
        await rename(lexicalPath, `${lexicalPath}.old`);
        await writeFile(lexicalPath, "evil", "utf8");
      },
    }),
    /file changed while it was being read/,
  );
});

test("an in-place mutation after descriptor open fails closed", async () => {
  const root = await controlledFile();
  await assert.rejects(
    readControlled(root, {
      afterOpen: async ({ lexicalPath }) => {
        await writeFile(lexicalPath, "evil", "utf8");
      },
    }),
    /file changed while it was being read/,
  );
});

test(
  "a static final-component symlink is never opened",
  { skip: process.platform === "win32" },
  async () => {
    const outside = join(
      await mkdtemp(join(tmpdir(), "qvac-atlas-secure-outside-")),
      "outside.json",
    );
    await writeFile(outside, "safe", "utf8");
    const root = await mkdtemp(join(tmpdir(), "qvac-atlas-secure-link-"));
    await mkdir(join(root, "data"), { recursive: true });
    await symlink(outside, join(root, "data", "report.json"));

    await assert.rejects(
      readControlled(root),
      /must be a physical regular file/,
    );
  },
);
