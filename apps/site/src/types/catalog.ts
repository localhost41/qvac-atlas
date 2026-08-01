export interface CatalogFacets {
  hardware: string;
  observedDevice: string;
  os: string;
  outcome: string;
  qvac: string;
  requestedDevice: string;
}

export interface DerivedClaim {
  actual_backend_claim: string | null;
  claim: string;
  observation: string;
  reasons: string[];
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
  sourcePath: string;
}

export interface CatalogClaim {
  claim: DerivedClaim;
  claimId: string;
  compatibilityKey: string;
  facets: CatalogFacets;
  reportIds: string[];
  sourceCount: number;
}

export interface CatalogData {
  catalogVersion: number;
  claims: CatalogClaim[];
  fixtures: CatalogReport[];
  reports: CatalogReport[];
}
