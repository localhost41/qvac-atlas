import assert from "node:assert/strict";
import test from "node:test";

import { validateInitialBaseline } from "./validate-initial-baseline.mjs";

function fixtureOnly() {
  return {
    registry: {
      productionProfiles: [],
      sources: [{ kind: "fixture" }],
    },
    catalog: { reports: [], claims: [], fixtures: [{}] },
  };
}

test("initial baseline accepts only empty production evidence state", () => {
  const state = fixtureOnly();
  assert.deepEqual(validateInitialBaseline(state.registry, state.catalog), {
    fixtureOnly: true,
  });

  for (const mutation of [
    (value) => value.registry.productionProfiles.push({}),
    (value) => value.registry.sources.push({ kind: "genuine" }),
    (value) => value.catalog.reports.push({}),
    (value) => value.catalog.claims.push({}),
  ]) {
    const hostile = fixtureOnly();
    mutation(hostile);
    assert.throws(
      () => validateInitialBaseline(hostile.registry, hostile.catalog),
      /Initial release baseline rejected/u,
    );
  }
});
