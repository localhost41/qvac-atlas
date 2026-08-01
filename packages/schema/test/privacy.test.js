import assert from "node:assert/strict";
import test from "node:test";
import { scanPrivacy, validatePublishableReport, withReportId } from "../src/index.js";
import { jsonFixture } from "./helpers.js";

test("adversarial privacy canaries are detected without echoing their values", async () => {
  const canaries = await jsonFixture("adversarial/privacy-canaries.json");
  for (const canary of canaries) {
    const findings = scanPrivacy({ sanitized_excerpt: canary.value });
    assert.equal(
      findings.some((finding) => finding.rule === canary.expected_rule),
      true,
      `${canary.name}: ${JSON.stringify(findings)}`,
    );
    assert.equal(JSON.stringify(findings).includes(canary.value), false, canary.name);
  }
});

test("known token shapes, high entropy, and forbidden field names are blocked", () => {
  const githubTokenShape = `github_pat_${"A".repeat(24)}`;
  assert.equal(scanPrivacy({ value: githubTokenShape }).some(({ rule }) => rule === "known-token"), true);
  assert.equal(
    scanPrivacy({ value: "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" }).some(({ rule }) => rule === "high-entropy-string"),
    true,
  );
  assert.deepEqual(scanPrivacy({ environment: { safe: "still forbidden" } }), [
    { path: "/environment", rule: "forbidden-field-name" },
  ]);
});

test("allowlisted hashes and version-like driver data do not produce false positives", async () => {
  const report = await jsonFixture("success.json");
  assert.deepEqual(scanPrivacy(report), []);
  assert.deepEqual(scanPrivacy({ driver_version: "1.2.3.4", artifact_sha256: "a".repeat(64) }), []);
});

test("privacy checks reject a leak even after its report ID is refreshed", async () => {
  const report = await jsonFixture("worker-crash.json");
  report.result.failure.sanitized_excerpt = "failed at /home/atlas-fixture/private/model.gguf";
  const validation = validatePublishableReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some(({ code }) => code === "privacy:posix-user-path"), true);
  assert.equal(JSON.stringify(validation.errors).includes("atlas-fixture"), false);
});

test("publication requires both explicit consent decisions", async () => {
  const report = await jsonFixture("success.json");
  report.consent.publication = false;
  const validation = validatePublishableReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors[0].code, "publication-consent");
});
