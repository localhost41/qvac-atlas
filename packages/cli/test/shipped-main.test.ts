import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("built main hardcodes false and ignores env, config, stdin, and hidden flags", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-shipped-main-"));
  try {
    await writeFile(
      path.join(root, ".qvac-atlas.json"),
      JSON.stringify({ realModeEnabled: true, yes: true }),
    );
    const mainPath = path.resolve("dist/index.js");
    const exact = spawnSync(
      process.execPath,
      [mainPath, "probe", "--real", "--output", "report.json"],
      {
        cwd: root,
        encoding: "utf8",
        input: "yes\nyes\nyes\nyes\nyes\n",
        env: {
          ...process.env,
          QVAC_ATLAS_REAL: "1",
          QVAC_ATLAS_YES: "1",
          CI: "false",
        },
      },
    );
    assert.equal(exact.status, 2);
    assert.equal(exact.stdout, "");
    assert.match(exact.stderr, /disabled until the ATLAS-013/);
    assert.deepEqual(await readdir(root), [".qvac-atlas.json"]);

    const hidden = spawnSync(
      process.execPath,
      [
        mainPath,
        "probe",
        "--real",
        "--output",
        "report.json",
        "--enable-real",
        "yes",
      ],
      { cwd: root, encoding: "utf8", env: process.env },
    );
    assert.equal(hidden.status, 2);
    assert.match(hidden.stderr, /^Usage: qvac-atlas probe --real/u);
    assert.equal(hidden.stderr.includes(root), false);

    const builtMain = await readFile(mainPath, "utf8");
    const builtDispatcher = await readFile(
      path.resolve("dist/internal-dispatcher.js"),
      "utf8",
    );
    assert.equal(builtMain.includes("real-cli.js"), false);
    assert.match(builtMain, /dispatchCli\([\s\S]*false\)/u);
    assert.equal(
      (builtDispatcher.match(/import\("\.\/real-cli\.js"\)/gu) ?? []).length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
