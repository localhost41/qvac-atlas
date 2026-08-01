import assert from "node:assert/strict";
import test from "node:test";

import { fixtureRegistryEntry } from "../src/data/fixture.js";

test("fixture data is visibly labelled as non-claim content", () => {
  assert.match(fixtureRegistryEntry.label, /^FIXTURE/);
  assert.match(fixtureRegistryEntry.outcome, /Fixture-only/);
});
