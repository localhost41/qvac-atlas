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

test("privacy rules do not reject larger non-token and relative-path supersets", () => {
  for (const value of [
    "unbearer AAAAAAAA",
    "xeyJAAAAAAAA.BBBBBBBB.CCCCCCCC",
    "XAKIAIOSFODNN7EXAMPLEY",
    "XASIAIOSFODNN7EXAMPLEY",
    "ASIAIOSFODNN7EXAMPL",
    "ASIAIOSFODNN7EXAMPLEX",
    "asiaiosfodnn7example",
    "NOT_TOKEN=secretvalue",
    "___NOT_TOKEN=secretvalue",
    "TOKENIZER=secretvalue",
    "MY_TOKENIZER=secretvalue",
    "PASSWORDLESS=secretvalue",
    "MY_PASSWORDLESS=secretvalue",
    "AWS_SECRETARY=secretvalue",
    "COOKIECUTTER=secretvalue",
    "CREDENTIALLESS=secretvalue",
    "API_KEYBOARD=secretvalue",
    "OPENAI_APIKEYBOARD=secretvalue",
    "AA:BB:CC:DD:EE:FF:11",
    "gAA:BB:CC:DD:EE:FFz",
    "0011.aabb.ccdd.eeff",
    "aabb.ccdd.eeff.0011",
    "gaabb.ccdd.eeffz",
    "aabb.ccdd.eef",
    "aabb.ccdd.ggee",
    "g123e4567-e89b-12d3-a456-426614174000z",
    "x192.0.2.42y",
    String.raw`wordD:\models\file.gguf`,
  ]) {
    assert.deepEqual(scanPrivacy({ value }), [], value);
  }
});

test("only schema-constrained hashes and versions bypass entropy scanning", async () => {
  const report = await jsonFixture("success.json");
  assert.deepEqual(scanPrivacy(report), []);
  const entropyCanary = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const exempt = {
    report_id: entropyCanary,
    schema_version: entropyCanary,
    probe_version: entropyCanary,
    runtime: { node_version: entropyCanary },
    qvac: {
      sdk_version: entropyCanary,
      packages: [{ version: entropyCanary }],
    },
    profile: { version: entropyCanary, artifact_sha256: entropyCanary },
    privacy: { sanitizer_version: entropyCanary },
  };
  assert.equal(
    scanPrivacy(exempt).some(({ rule }) => rule === "high-entropy-string"),
    false,
  );
  for (const [path, value] of [
    ["os version", { platform: { os: { version: entropyCanary } } }],
    [
      "driver version",
      { platform: { gpus: [{ driver_version: entropyCanary }] } },
    ],
  ]) {
    assert.equal(
      scanPrivacy(value).some(({ rule }) => rule === "high-entropy-string"),
      true,
      path,
    );
  }
});

test("dotted quads in driver versions cannot bypass network scanning", () => {
  for (const driver_version of ["1.2.3.4", "driver_1.2.3.4_release"]) {
    assert.deepEqual(scanPrivacy({ driver_version }), [
      { path: "/driver_version", rule: "ipv4-address" },
    ]);
  }
});

test("IPv6 detection respects address validity and contributor-string boundaries", () => {
  for (const value of [
    "2001:db8:::1",
    "not-an-address:still-not-an-address",
    "prefix2001:db8::1suffix",
  ]) {
    assert.equal(
      scanPrivacy({ value }).some(({ rule }) => rule === "ipv6-address"),
      false,
      value,
    );
  }
  assert.equal(
    scanPrivacy({ value: "endpoint [fe80::1%en0]:443" }).some(
      ({ rule }) => rule === "ipv6-address",
    ),
    true,
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

test("every privacy canary rejects a refreshed-ID genuine report without echo", async () => {
  const canaries = await jsonFixture("adversarial/privacy-canaries.json");
  for (const canary of canaries) {
    const report = await jsonFixture("success.json");
    report.provenance = { kind: "probe", fixture_id: null };
    report.platform.cpu.model = canary.value;
    const adjusted = withReportId(report);
    const validation = validatePublishableReport(adjusted);
    assert.equal(validation.valid, false, canary.name);
    assert.equal(
      validation.errors.some(
        ({ code }) => code === `privacy:${canary.expected_rule}`,
      ),
      true,
      canary.name,
    );
    assert.equal(
      JSON.stringify(validation.errors).includes(canary.value),
      false,
      canary.name,
    );
  }
});

test("OS and driver entropy plus driver dotted quads reject refreshed genuine reports", async () => {
  const entropyCanary = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
  const cases = [
    {
      name: "OS entropy",
      rule: "high-entropy-string",
      apply: (report) => {
        report.platform.os.version = entropyCanary;
      },
      value: entropyCanary,
    },
    {
      name: "driver entropy",
      rule: "high-entropy-string",
      apply: (report) => {
        report.platform.gpus[0].driver_version = entropyCanary;
      },
      value: entropyCanary,
    },
    {
      name: "driver dotted quad",
      rule: "ipv4-address",
      apply: (report) => {
        report.platform.gpus[0].driver_version = "driver_192.0.2.42_release";
      },
      value: "driver_192.0.2.42_release",
    },
  ];
  for (const entry of cases) {
    const report = await jsonFixture("success.json");
    report.provenance = { kind: "probe", fixture_id: null };
    entry.apply(report);
    const validation = validatePublishableReport(withReportId(report));
    assert.equal(validation.valid, false, entry.name);
    assert.equal(
      validation.errors.some(({ code }) => code === `privacy:${entry.rule}`),
      true,
      entry.name,
    );
    assert.equal(
      JSON.stringify(validation.errors).includes(entry.value),
      false,
    );
  }
});

test("publication requires both explicit consent decisions", async () => {
  const report = await jsonFixture("success.json");
  report.consent.publication = false;
  const validation = validatePublishableReport(withReportId(report));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors[0].code, "publication-consent");
});
