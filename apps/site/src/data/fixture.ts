/**
 * Scaffold-only presentation data. It is intentionally not shaped like an
 * atlas-report/v1 document and must never be included in a public registry.
 */
export const fixtureRegistryEntry = {
  label: "FIXTURE — NOT A REAL COMPATIBILITY CLAIM",
  device: "Raspberry Pi 5",
  qvacVersion: "0.16.0 (illustrative)",
  outcome: "Fixture-only worker startup failure",
} as const;
