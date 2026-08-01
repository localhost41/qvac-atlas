export const LIFECYCLE_PHASES = [
  "qvac-import",
  "worker-start",
  "model-load",
  "inference",
  "clean-shutdown",
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];
export type ChildPhaseState = "started" | "succeeded" | "failed";

export type ChildEvent =
  | {
      type: "phase";
      sequence: number;
      phase: LifecyclePhase;
      state: ChildPhaseState;
    }
  | {
      type: "backend";
      sequence: number;
      backend: "cpu" | "gpu";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

export function parseChildEvent(value: unknown): ChildEvent | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.sequence)) return null;
  if (Number(value.sequence) < 0) return null;
  if (value.type === "phase") {
    if (!hasExactKeys(value, ["type", "sequence", "phase", "state"]))
      return null;
    if (!LIFECYCLE_PHASES.includes(value.phase as LifecyclePhase)) return null;
    if (
      !(["started", "succeeded", "failed"] as const).includes(
        value.state as ChildPhaseState,
      )
    )
      return null;
    return value as ChildEvent;
  }
  if (value.type === "backend") {
    if (!hasExactKeys(value, ["type", "sequence", "backend"])) return null;
    if (value.backend !== "cpu" && value.backend !== "gpu") return null;
    return value as ChildEvent;
  }
  return null;
}
