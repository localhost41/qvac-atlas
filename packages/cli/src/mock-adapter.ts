/**
 * Temporary boundary for scaffold-only output.
 *
 * ATLAS-003 will replace this with an adapter that returns validated
 * atlas-report/v1 data. No fixture should be treated as a probe result.
 */
export interface LocalMockProbeResult {
  readonly kind: "fixture";
  readonly label: "NOT A REAL QVAC REPORT";
  readonly scenario: "raspberry-pi-5-worker-startup-failure";
  readonly outcome: "fixture-only";
}

export interface ProbeAdapter {
  runFixture(): LocalMockProbeResult;
}

export class LocalMockProbeAdapter implements ProbeAdapter {
  runFixture(): LocalMockProbeResult {
    return {
      kind: "fixture",
      label: "NOT A REAL QVAC REPORT",
      scenario: "raspberry-pi-5-worker-startup-failure",
      outcome: "fixture-only",
    };
  }
}
