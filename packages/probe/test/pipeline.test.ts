import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { validateReport } from "@qvac-atlas/schema";

import { runFixtureProbe } from "../src/pipeline.js";
import {
  deterministicPlatform,
  passingDoctor,
  RecordingInteraction,
  RecordingWriter,
} from "./fixtures.js";

const options = {
  projectRoot: path.resolve("/fixture/project"),
  outputPath: path.resolve("/fixture/output.json"),
  scenario: "success" as const,
};
const now = () => new Date("2026-07-31T12:00:00.000Z");

test("pipeline previews a private draft, chooses publication, previews final bytes, then writes", async () => {
  const interaction = new RecordingInteraction(true, true, true);
  const writer = new RecordingWriter();
  const result = await runFixtureProbe(options, {
    interaction,
    writer,
    platformSource: deterministicPlatform,
    doctor: passingDoctor,
    now,
  });
  assert.equal(result.status, "written");
  if (result.status !== "written") return;
  assert.deepEqual(interaction.calls, [
    "disclose",
    "fingerprint",
    "preview:draft",
    "publication",
    "preview:final",
    "write-consent",
  ]);
  assert.equal(interaction.previews.length, 2);
  const draft = JSON.parse(interaction.previews[0]!.json);
  const final = JSON.parse(interaction.previews[1]!.json);
  assert.equal(draft.consent.publication, false);
  assert.equal(final.consent.publication, true);
  assert.equal(draft.report_id, final.report_id);
  assert.equal(writer.writes[0]?.bytes, interaction.previews[1]!.json);
  assert.equal(validateReport(final).valid, true);
});

test("no write occurs before final preview and explicit local-write consent", async () => {
  const interaction = new RecordingInteraction(true, false, false);
  const writer = new RecordingWriter();
  const result = await runFixtureProbe(options, {
    interaction,
    writer,
    platformSource: deterministicPlatform,
    doctor: passingDoctor,
    now,
  });
  assert.equal(result.status, "previewed-not-written");
  assert.deepEqual(writer.writes, []);
  assert.deepEqual(interaction.calls.slice(-3), [
    "publication",
    "preview:final",
    "write-consent",
  ]);
});

test("fingerprint refusal prevents collection, Doctor, runner, preview, and write", async () => {
  const interaction = new RecordingInteraction(false);
  const writer = new RecordingWriter();
  let doctorCalled = false;
  const result = await runFixtureProbe(options, {
    interaction,
    writer,
    platformSource: {
      platform: () => {
        throw new Error("collection must not run");
      },
      release: () => "unknown",
      arch: () => "unknown",
      cpus: () => [],
      totalmem: () => 0,
      nodeVersion: () => "22.17.0",
    },
    doctor: {
      run: async () => {
        doctorCalled = true;
        return passingDoctor.run();
      },
    },
    now,
  });
  assert.equal(result.status, "refused");
  assert.equal(doctorCalled, false);
  assert.deepEqual(writer.writes, []);
  assert.deepEqual(interaction.calls, ["disclose", "fingerprint"]);
});

test("identical injected evidence produces byte-identical output", async () => {
  async function once(): Promise<string> {
    const result = await runFixtureProbe(options, {
      interaction: new RecordingInteraction(true, true, false),
      writer: new RecordingWriter(),
      platformSource: deterministicPlatform,
      doctor: passingDoctor,
      now,
    });
    assert.notEqual(result.status, "refused");
    return result.status === "refused" ? "" : result.exactJson;
  }
  assert.equal(await once(), await once());
});

test("fixture assembly preserves truthful platform redaction counts", async () => {
  const result = await runFixtureProbe(options, {
    interaction: new RecordingInteraction(true, true, false),
    writer: new RecordingWriter(),
    platformSource: {
      ...deterministicPlatform,
      release: () => "2001:db8::1",
      cpus: () => [{ model: "owner@example.invalid /Users/private/model" }],
    },
    doctor: passingDoctor,
    now,
  });
  assert.notEqual(result.status, "refused");
  if (result.status === "refused") return;
  assert.deepEqual(result.report.privacy.redaction_counts, {
    credentials: 0,
    identifiers: 1,
    network: 1,
    paths: 1,
  });
  assert.equal(JSON.stringify(result.report).includes("owner@example"), false);
  assert.equal(JSON.stringify(result.report).includes("2001:db8"), false);
});

for (const scenario of ["missing-qvac", "worker-crash", "timeout"] as const) {
  test(`${scenario} assembles a canonical schema-valid local fixture report`, async () => {
    const result = await runFixtureProbe(
      { ...options, scenario },
      {
        interaction: new RecordingInteraction(true, false, false),
        writer: new RecordingWriter(),
        platformSource: deterministicPlatform,
        doctor: passingDoctor,
        now,
      },
    );
    assert.notEqual(result.status, "refused");
    if (result.status === "refused") return;
    assert.equal(validateReport(result.report).valid, true);
    assert.equal(result.report.provenance.kind, "fixture");
  });
}
