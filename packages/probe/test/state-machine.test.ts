import assert from "node:assert/strict";
import test from "node:test";

import { ProbeStateMachine } from "../src/state-machine.js";

test("publication cannot be chosen before the sanitized draft preview", () => {
  const state = new ProbeStateMachine();
  state.advance("disclosed");
  state.advance("fingerprint-consented");
  assert.throws(
    () => state.advance("publication-chosen"),
    /Invalid probe transition/,
  );
});

test("state machine rejects skipped and repeated stages", () => {
  const state = new ProbeStateMachine();
  assert.throws(() => state.advance("collected"), /Invalid probe transition/);
  state.advance("disclosed");
  assert.throws(() => state.advance("disclosed"), /Invalid probe transition/);
});
