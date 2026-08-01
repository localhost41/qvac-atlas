import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import {
  deriveReportClaim,
  validateDerivedClaim,
  validatePublishableReport,
} from "../src/index.js";
import { asProbe, jsonFixture, standardProfiles } from "./helpers.js";

test("all golden reports validate and derive their checked-in claims", async () => {
  const expected = await jsonFixture("expected-claims.json");
  const profiles = await standardProfiles();
  const names = (await readdir(new URL("../fixtures", import.meta.url)))
    .filter((name) => name.endsWith(".json") && name !== "expected-claims.json")
    .sort();

  assert.deepEqual(names, Object.keys(expected).sort());
  for (const name of names) {
    const report = await jsonFixture(name);
    const validation = validatePublishableReport(report);
    assert.equal(
      validation.valid,
      true,
      `${name}: ${JSON.stringify(validation.errors)}`,
    );
    const fixtureClaim = deriveReportClaim(report, {
      standardProfiles: profiles,
    });
    assert.deepEqual(
      fixtureClaim,
      {
        observation: "inconclusive",
        claim: "unknown",
        actual_backend_claim: null,
        reasons: ["fixture-evidence"],
      },
      `${name} fixture isolation`,
    );
    const claim = deriveReportClaim(asProbe(report), {
      standardProfiles: profiles,
    });
    assert.deepEqual(claim, expected[name], name);
    assert.equal(
      validateDerivedClaim(claim),
      true,
      `${name}: ${JSON.stringify(validateDerivedClaim.errors)}`,
    );
  }
});

test("unknown and skipped evidence never becomes failure or success", async () => {
  const profiles = await standardProfiles();
  for (const name of ["missing-qvac.json", "inconclusive.json"]) {
    const claim = deriveReportClaim(asProbe(await jsonFixture(name)), {
      standardProfiles: profiles,
    });
    assert.equal(claim.claim, "unknown");
    assert.equal(claim.observation, "inconclusive");
  }
});

test("a supported-platform GPU fallback records actual-device CPU evidence", async () => {
  const profiles = await standardProfiles();
  const claim = deriveReportClaim(asProbe(await jsonFixture("fallback.json")), {
    standardProfiles: profiles,
  });
  assert.equal(claim.observation, "fallback");
  assert.equal(claim.claim, "unknown");
  assert.equal(claim.actual_backend_claim, "observed-success");
});
