export const REAL_PROBE_STAGES = [
  "created",
  "output-vacant",
  "privacy-disclosed",
  "fingerprint-consented",
  "collected",
  "project-resolved",
  "project-code-disclosed",
  "project-code-consented",
  "doctor-complete",
  "workload-disclosed",
  "workload-consented",
  "runtime-complete",
  "assembled",
  "validated",
  "draft-previewed",
  "publication-chosen",
  "final-validated",
  "final-previewed",
  "write-consented",
  "written",
  "complete",
] as const;

export type RealProbeStage = (typeof REAL_PROBE_STAGES)[number];

export class RealProbeStateMachine {
  #index = 0;
  readonly history: RealProbeStage[] = ["created"];

  get stage(): RealProbeStage {
    return REAL_PROBE_STAGES[this.#index] ?? "created";
  }

  advance(next: RealProbeStage): void {
    const expected = REAL_PROBE_STAGES[this.#index + 1];
    if (next !== expected) throw new Error("invalid-real-probe-transition");
    this.#index += 1;
    this.history.push(next);
  }
}
