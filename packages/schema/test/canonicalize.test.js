import assert from "node:assert/strict";
import test from "node:test";
import { calculateReportId, canonicalize, verifyReportId, withReportId } from "../src/index.js";
import { jsonFixture } from "./helpers.js";

test("canonical JSON is independent of object insertion order", () => {
  const left = { z: [3, { b: true, a: null }], a: "value" };
  const right = { a: "value", z: [3, { a: null, b: true }] };
  assert.equal(canonicalize(left), '{"a":"value","z":[3,{"a":null,"b":true}]}');
  assert.equal(canonicalize(left), canonicalize(right));
});

test("canonicalization rejects values outside the JSON contract", () => {
  assert.throws(() => canonicalize({ invalid: undefined }), /undefined/);
  assert.throws(() => canonicalize({ invalid: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalize({ invalid: Number.POSITIVE_INFINITY }), /non-finite/);
  assert.throws(() => canonicalize({ invalid: -0 }), /negative zero/);
  assert.throws(() => canonicalize(new Date()), /not a JSON value/);
});

test("report IDs are stable and exclude only the report_id field", async () => {
  const report = await jsonFixture("success.json");
  assert.equal(calculateReportId(report), report.report_id);
  assert.equal(verifyReportId(report), true);

  const reordered = Object.fromEntries(Object.entries(report).reverse());
  assert.equal(calculateReportId(reordered), report.report_id);

  const stale = structuredClone(report);
  stale.result.completion_observed = false;
  assert.equal(verifyReportId(stale), false);
  const refreshed = withReportId(stale);
  assert.equal(verifyReportId(refreshed), true);
  assert.notEqual(refreshed.report_id, report.report_id);
});

test("publication consent is transport metadata and does not change evidence identity", async () => {
  const report = await jsonFixture("success.json");
  const unpublished = structuredClone(report);
  unpublished.consent.publication = false;
  assert.equal(calculateReportId(unpublished), calculateReportId(report));

  const changedEvidence = structuredClone(report);
  changedEvidence.consent.fingerprint_acknowledged = false;
  assert.notEqual(calculateReportId(changedEvidence), calculateReportId(report));
});
