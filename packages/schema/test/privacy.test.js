import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveReportClaim,
  scanPrivacy,
  validatePublishableReport,
  withReportId,
} from "../src/index.js";
import { jsonFixture, standardProfiles } from "./helpers.js";

test("adversarial privacy canaries are detected without echoing their values", async () => {
  const canaries = await jsonFixture("adversarial/privacy-canaries.json");
  for (const canary of canaries) {
    const findings = scanPrivacy({ sanitized_excerpt: canary.value });
    assert.equal(
      findings.some((finding) => finding.rule === canary.expected_rule),
      true,
      `${canary.name}: ${JSON.stringify(findings)}`,
    );
    assert.equal(
      JSON.stringify(findings).includes(canary.value),
      false,
      canary.name,
    );
  }
});

test("known token shapes, high entropy, and forbidden field names are blocked", () => {
  const githubTokenShape = `github_pat_${"A".repeat(24)}`;
  assert.equal(
    scanPrivacy({ value: githubTokenShape }).some(
      ({ rule }) => rule === "known-token",
    ),
    true,
  );
  assert.equal(
    scanPrivacy({ value: "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" }).some(
      ({ rule }) => rule === "high-entropy-string",
    ),
    true,
  );
  assert.deepEqual(scanPrivacy({ environment: { safe: "still forbidden" } }), [
    { path: "/environment", rule: "forbidden-field-name" },
  ]);
});

test("allowlisted hashes and version-like driver data do not produce false positives", async () => {
  const report = await jsonFixture("success.json");
  assert.deepEqual(scanPrivacy(report), []);
  assert.deepEqual(
    scanPrivacy({ driver_version: "1.2.3.4", artifact_sha256: "a".repeat(64) }),
    [],
  );
});

test("generic Unix and Windows absolute paths are rejected", () => {
  const paths = [
    "/private/var/folders/atlas/model.gguf",
    "/tmp/atlas/model.gguf",
    "/var/lib/atlas/model.gguf",
    "/etc/passwd",
    "/opt/qvac/model.gguf",
    String.raw`D:\models\private\model.gguf`,
    "E:/models/private/model.gguf",
    String.raw`\\server\private\model.gguf`,
  ];
  for (const value of paths) {
    assert.equal(
      scanPrivacy({ sanitized_excerpt: `failure at ${value}` }).some(
        ({ rule }) =>
          rule.includes("absolute-path") || rule === "windows-unc-path",
      ),
      true,
      value,
    );
  }
});

test("genuine reports cannot retain even sanitized failure excerpts", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.provenance = { kind: "probe", fixture_id: null };
  const adjusted = withReportId(report);
  const validation = validatePublishableReport(adjusted);
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ code }) => code === "probe-excerpt"),
    true,
  );
  assert.equal(
    deriveReportClaim(adjusted, { standardProfiles: await standardProfiles() })
      .claim,
    "unknown",
  );
});

test("privacy checks reject a leak even after its report ID is refreshed", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.result.failure.sanitized_excerpt =
    "failed at /home/atlas-fixture/private/model.gguf";
  const validation = validatePublishableReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some(({ code }) => code === "privacy:posix-user-path"),
    true,
  );
  assert.equal(
    JSON.stringify(validation.errors).includes("atlas-fixture"),
    false,
  );
});

test("publication requires both explicit consent decisions", async () => {
  const report = await jsonFixture("success.json");
  report.consent.publication = false;
  const validation = validatePublishableReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors[0].code, "publication-consent");
});
