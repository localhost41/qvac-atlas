import assert from "node:assert/strict";
import test from "node:test";

import { LocalMockProbeAdapter } from "../src/mock-adapter.js";
import { renderFixtureResult } from "../src/index.js";

test("fixture output cannot be mistaken for a probe report", () => {
  const output = renderFixtureResult(new LocalMockProbeAdapter());

  assert.match(output, /NOT A REAL QVAC REPORT/);
  assert.match(output, /No system inspection/);
});
