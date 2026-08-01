export const PROBE_STAGES = [
  "created",
  "disclosed",
  "fingerprint-consented",
  "collected",
  "doctor-complete",
  "runner-complete",
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

export type ProbeStage = (typeof PROBE_STAGES)[number];

export class ProbeStateMachine {
  #index = 0;
  readonly history: ProbeStage[] = ["created"];

  get stage(): ProbeStage {
    return PROBE_STAGES[this.#index] ?? "created";
  }

  advance(next: ProbeStage): void {
    const expected = PROBE_STAGES[this.#index + 1];
    if (next !== expected)
      throw new Error(`Invalid probe transition: ${this.stage} -> ${next}`);
    this.#index += 1;
    this.history.push(next);
  }
}
