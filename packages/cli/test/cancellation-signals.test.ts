import assert from "node:assert/strict";
import test from "node:test";

import {
  CANCELLATION_SIGNALS,
  installCancellationSignalHandlers,
  type CancellationSignal,
  type CancellationSignalHost,
} from "../src/cancellation-signals.js";

class FakeSignalHost implements CancellationSignalHost {
  readonly listeners = new Map<CancellationSignal, Set<() => void>>();

  on(signal: CancellationSignal, listener: () => void): void {
    const listeners = this.listeners.get(signal) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }

  off(signal: CancellationSignal, listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  emit(signal: CancellationSignal): void {
    for (const listener of this.listeners.get(signal) ?? []) listener();
  }
}

test("persistent cancellation handlers cover INT, TERM, and HUP until removal", () => {
  const host = new FakeSignalHost();
  let cancellations = 0;
  const remove = installCancellationSignalHandlers(host, () => {
    cancellations += 1;
  });

  assert.deepEqual(CANCELLATION_SIGNALS, ["SIGINT", "SIGTERM", "SIGHUP"]);
  for (const signal of CANCELLATION_SIGNALS) {
    assert.equal(host.listeners.get(signal)?.size, 1);
    host.emit(signal);
    host.emit(signal);
  }
  assert.equal(cancellations, 6);

  remove();
  remove();
  for (const signal of CANCELLATION_SIGNALS) {
    assert.equal(host.listeners.get(signal)?.size, 0);
    host.emit(signal);
  }
  assert.equal(cancellations, 6);
});
