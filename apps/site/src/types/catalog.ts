export type ClaimState =
  | "observed-success"
  | "reproduced-success"
  | "mixed"
  | "observed-failure"
  | "unknown";

export type ObservationState =
  "success" | "fallback" | "failure" | "inconclusive";

export type ActualDeviceClaim = "observed-success" | "reproduced-success";

export interface CatalogFacets {
  architecture: string;
  hardware: string;
  memory: string;
  observedDevice: string;
  os: string;
  outcome: ObservationState;
  qvac: string;
  requestedDevice: string;
  gpu: string;
}

export interface DerivedClaim {
  actual_backend_claim: ActualDeviceClaim | null;
  claim: ClaimState;
  observation: ObservationState;
  reasons: string[];
}

export interface CatalogCardEntry {
  actualDeviceClaims: ActualDeviceClaim[];
  claim: DerivedClaim;
  facets: CatalogFacets & { claimState: ClaimState | "not-a-claim" };
  fixture: boolean;
  links: { href: string; label: string }[];
  reportCount: number;
  reportObservations: ObservationState[];
  sourceCount: number | null;
  unverifiedAnonymous: boolean;
  title: string;
}

export interface ReportEvidence {
  provenance: {
    kind: "fixture" | "probe";
    fixture_id: string | null;
  };
  [key: string]: unknown;
}

export interface CatalogReport {
  claim: DerivedClaim;
  facets: CatalogFacets;
  report: ReportEvidence;
  reportId: string;
  slug: string;
  sourceKey: string;
  sourceIndependence: "fixture" | "independent" | "unverified-anonymous";
  sourcePath: string;
}

export interface CatalogClaim {
  claim: DerivedClaim;
  claimId: string;
  compatibilityKey: string;
  facets: CatalogFacets;
  reportIds: string[];
  sourceCount: number;
  unverifiedAnonymous: boolean;
}

export interface CatalogData {
  catalogVersion: number;
  claims: CatalogClaim[];
  fixtures: CatalogReport[];
  reports: CatalogReport[];
}
