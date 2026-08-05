import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPORT_ID = /^sha256:[a-f0-9]{64}$/;
const GENUINE_SOURCE_KEY = /^source:[a-f0-9]{32}$/;
const ANONYMOUS_SOURCE_KEY = "source:anonymous-relay";
const FIXTURE_SOURCE_KEY = /^fixture:[a-z0-9][a-z0-9._-]{0,79}$/;
const FIXTURE_SOURCE_PATH =
  /^(?:packages\/schema\/fixtures|reports\/fixtures)\/[a-z0-9][a-z0-9._/-]*\.json$/;

function reject(code) {
  throw new Error(`Site release catalog rejected: ${code}`);
}

function requireCatalog(catalog) {
  if (catalog === null || typeof catalog !== "object" || Array.isArray(catalog))
    reject("catalog-not-object");
  if (catalog.catalogVersion !== 1) reject("catalog-version");
  for (const key of ["claims", "fixtures", "reports"]) {
    if (!Array.isArray(catalog[key])) reject(`${key}-not-array`);
  }
}

function reportId(entry, label) {
  if (
    entry === null ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    !REPORT_ID.test(entry.reportId) ||
    entry.report?.report_id !== entry.reportId ||
    entry.slug !== entry.reportId.slice("sha256:".length)
  ) {
    reject(`${label}-identity`);
  }
  return entry.reportId;
}

function hasFixtureReason(entry) {
  return entry?.claim?.reasons?.includes("fixture-evidence") === true;
}

/**
 * Verifies the release-specific fixture/genuine boundary. Full report, registry,
 * and claim validation remains the responsibility of the catalog build and the
 * complete workspace check that run before this assertion.
 */
export function validateSiteReleaseCatalog(catalog) {
  requireCatalog(catalog);
  const fixtureIds = new Set();
  const genuineIds = new Set();
  const genuineEntries = new Map();

  for (const entry of catalog.fixtures) {
    const id = reportId(entry, "fixture");
    if (fixtureIds.has(id)) reject("duplicate-fixture-report");
    fixtureIds.add(id);
    if (
      entry.report?.provenance?.kind !== "fixture" ||
      typeof entry.report?.provenance?.fixture_id !== "string" ||
      entry.report.provenance.fixture_id.length === 0 ||
      !FIXTURE_SOURCE_KEY.test(entry.sourceKey) ||
      entry.sourceIndependence !== "fixture" ||
      !FIXTURE_SOURCE_PATH.test(entry.sourcePath) ||
      entry.claim?.claim !== "unknown" ||
      !hasFixtureReason(entry)
    ) {
      reject("fixture-boundary");
    }
  }

  for (const entry of catalog.reports) {
    const id = reportId(entry, "genuine-report");
    if (genuineIds.has(id)) reject("duplicate-genuine-report");
    if (fixtureIds.has(id)) reject("report-id-crosses-boundary");
    genuineIds.add(id);
    genuineEntries.set(id, entry);
    const expectedPath = `reports/v1/${id.replace(":", "-")}.json`;
    if (
      entry.report?.provenance?.kind !== "probe" ||
      entry.report?.provenance?.fixture_id !== null ||
      !["independent", "unverified-anonymous"].includes(
        entry.sourceIndependence,
      ) ||
      (entry.sourceIndependence === "independent" &&
        !GENUINE_SOURCE_KEY.test(entry.sourceKey)) ||
      (entry.sourceIndependence === "unverified-anonymous" &&
        entry.sourceKey !== ANONYMOUS_SOURCE_KEY) ||
      entry.sourcePath !== expectedPath ||
      hasFixtureReason(entry)
    ) {
      reject("genuine-report-boundary");
    }
  }

  const claimMembership = new Map([...genuineIds].map((id) => [id, 0]));
  for (const claim of catalog.claims) {
    if (
      claim === null ||
      typeof claim !== "object" ||
      Array.isArray(claim) ||
      !Array.isArray(claim.reportIds) ||
      claim.reportIds.length === 0 ||
      hasFixtureReason(claim)
    ) {
      reject("claim-boundary");
    }
    const distinctIds = new Set(claim.reportIds);
    if (distinctIds.size !== claim.reportIds.length)
      reject("claim-duplicate-report");
    const sourceKeys = new Set(
      claim.reportIds.map((id) => genuineEntries.get(id)?.sourceKey),
    );
    const hasAnonymous = claim.reportIds.some(
      (id) =>
        genuineEntries.get(id)?.sourceIndependence === "unverified-anonymous",
    );
    if (
      claim.sourceCount !== sourceKeys.size ||
      claim.unverifiedAnonymous !== hasAnonymous
    ) {
      reject("claim-source-boundary");
    }
    for (const id of claim.reportIds) {
      if (fixtureIds.has(id) || !genuineIds.has(id))
        reject("claim-references-non-genuine-report");
      claimMembership.set(id, (claimMembership.get(id) ?? 0) + 1);
    }
  }
  if ([...claimMembership.values()].some((count) => count !== 1))
    reject("genuine-report-claim-membership");

  return Object.freeze({
    claims: catalog.claims.length,
    fixtures: catalog.fixtures.length,
    reports: catalog.reports.length,
  });
}

async function main() {
  if (process.argv.length !== 3) reject("expected-one-catalog-path");
  const catalog = JSON.parse(await readFile(resolve(process.argv[2]), "utf8"));
  const counts = validateSiteReleaseCatalog(catalog);
  process.stdout.write(
    `Site release catalog boundary passed: ${counts.reports} genuine report(s), ${counts.claims} claim(s), ${counts.fixtures} fixture(s).\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
