import { createHash } from "node:crypto";
import {
  canonicalize,
  compatibilityKey,
  deriveAggregateClaim,
  deriveReportClaim,
  validatePublishableReport,
} from "@qvac-atlas/schema";

const SOURCE_KEY = /^[a-z0-9][a-z0-9:._/-]{0,127}$/;
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(`Catalog admission failed: ${message}`);
}

function validateSource(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    fail("source metadata must be an object");
  }
  const keys = Object.keys(source).sort();
  if (
    canonicalize(keys) !== canonicalize(["kind", "path", "report", "sourceKey"])
  ) {
    fail("source metadata has an unsupported field");
  }
  if (!SOURCE_KEY.test(source.sourceKey)) fail("sourceKey is invalid");
  if (!["fixture", "genuine"].includes(source.kind))
    fail("source kind is invalid");
  if (typeof source.path !== "string" || source.path.length === 0)
    fail("source path is invalid");

  const expectedProvenance = source.kind === "fixture" ? "fixture" : "probe";
  if (source.report?.provenance?.kind !== expectedProvenance) {
    fail("trusted source kind does not match report provenance");
  }
}

function profileIdentity(profile) {
  return `${profile.id}@${profile.version}:${profile.artifact_sha256}`;
}

function validateProfileList(profiles, expectedTestOnly, label) {
  if (!Array.isArray(profiles)) fail(`${label} profiles must be an array`);
  const identities = new Set();
  for (const profile of profiles) {
    if (
      profile === null ||
      typeof profile !== "object" ||
      Array.isArray(profile)
    ) {
      fail(`${label} profile must be an object`);
    }
    const keys = Object.keys(profile).sort();
    const expectedKeys = [
      "artifact_sha256",
      "id",
      "requested_backend",
      "test_only",
      "version",
    ];
    if (canonicalize(keys) !== canonicalize(expectedKeys))
      fail(`${label} profile has an unsupported field`);
    if (
      !PROFILE_ID.test(profile.id) ||
      !SEMVER.test(profile.version) ||
      !SHA256.test(profile.artifact_sha256) ||
      !["auto", "cpu", "gpu"].includes(profile.requested_backend)
    ) {
      fail(`${label} profile descriptor is invalid`);
    }
    if (profile.test_only !== expectedTestOnly)
      fail(`${label} profile has the wrong test_only boundary`);
    const identity = profileIdentity(profile);
    if (identities.has(identity)) fail(`duplicate ${label} profile identity`);
    identities.add(identity);
  }
  return identities;
}

function matchingProfiles(report, profiles) {
  return profiles.filter(
    (profile) =>
      profileIdentity(profile) === profileIdentity(report.profile) &&
      profile.requested_backend === report.profile.requested_backend,
  );
}

function admittedProfiles(report, profiles, label) {
  const matches = matchingProfiles(report, profiles);
  if (matches.length !== 1)
    fail(`${label} report must match exactly one trusted profile`);
  return matches;
}

function hardwareLabel(report) {
  const gpus = report.platform.gpus.map((gpu) => gpu.model).join(", ");
  return gpus.length > 0
    ? `${report.platform.cpu.model} · ${gpus}`
    : `${report.platform.cpu.model} · no GPU recorded`;
}

function osLabel(report) {
  return `${report.platform.os.family} ${report.platform.os.version} · ${report.platform.architecture}`;
}

function facets(report, outcome) {
  return {
    hardware: hardwareLabel(report),
    observedDevice: report.execution.backend_observation.backend ?? "unknown",
    os: osLabel(report),
    outcome,
    qvac: report.qvac.sdk_version ?? "unknown",
    requestedDevice: report.profile.requested_backend,
  };
}

function reportEntry(source, derived) {
  return {
    claim: derived,
    facets: facets(source.report, derived.observation),
    report: source.report,
    reportId: source.report.report_id,
    slug: source.report.report_id.replace(/^sha256:/, ""),
    sourceKey: source.sourceKey,
    sourcePath: source.path,
  };
}

function claimId(key) {
  return `claim-${createHash("sha256").update(key, "utf8").digest("hex")}`;
}

function aggregateEntries(entries, standardProfiles) {
  const groups = new Map();
  for (const entry of entries) {
    const key = compatibilityKey(entry.report);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const aggregate = deriveAggregateClaim(group, {
        standardProfiles: matchingProfiles(group[0].report, standardProfiles),
      });
      const reports = group.map(({ report }) => report.report_id).sort();
      return {
        claim: aggregate,
        claimId: claimId(key),
        compatibilityKey: key,
        facets: facets(group[0].report, aggregate.observation),
        reportIds: reports,
        sourceCount: new Set(group.map(({ sourceKey }) => sourceKey)).size,
      };
    })
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

/**
 * Builds presentation data exclusively from publishable reports. `sourceKey`
 * and source classification are trusted registry metadata, never report input.
 */
export function buildCatalog({
  sources,
  productionProfiles = [],
  fixtureProfiles = [],
}) {
  if (!Array.isArray(sources)) fail("sources must be an array");
  const productionIdentities = validateProfileList(
    productionProfiles,
    false,
    "production",
  );
  const fixtureIdentities = validateProfileList(
    fixtureProfiles,
    true,
    "fixture",
  );
  for (const identity of productionIdentities) {
    if (fixtureIdentities.has(identity))
      fail("profile identity crosses production and fixture boundaries");
  }
  const reportIds = new Set();
  const paths = new Set();

  const admitted = sources.map((source) => {
    validateSource(source);
    if (paths.has(source.path)) fail("duplicate report path");
    paths.add(source.path);

    const validation = validatePublishableReport(source.report);
    if (!validation.valid) {
      const codes = validation.errors
        .map(({ code, path }) => `${path}:${code}`)
        .sort();
      fail(`report is not publishable (${codes.join(", ")})`);
    }
    if (reportIds.has(source.report.report_id)) fail("duplicate report ID");
    reportIds.add(source.report.report_id);
    return source;
  });

  const genuineSources = admitted.filter(({ kind }) => kind === "genuine");
  const fixtureSources = admitted.filter(({ kind }) => kind === "fixture");
  for (const source of genuineSources)
    admittedProfiles(source.report, productionProfiles, "genuine");
  for (const source of fixtureSources)
    admittedProfiles(source.report, fixtureProfiles, "fixture");
  const reports = genuineSources
    .map((source) =>
      reportEntry(
        source,
        deriveReportClaim(source.report, {
          standardProfiles: admittedProfiles(
            source.report,
            productionProfiles,
            "genuine",
          ),
        }),
      ),
    )
    .sort((left, right) => left.reportId.localeCompare(right.reportId));
  const fixtures = fixtureSources
    .map((source) =>
      reportEntry(
        source,
        deriveReportClaim(source.report, {
          standardProfiles: admittedProfiles(
            source.report,
            fixtureProfiles,
            "fixture",
          ),
        }),
      ),
    )
    .sort((left, right) => left.reportId.localeCompare(right.reportId));

  return {
    catalogVersion: 1,
    claims: aggregateEntries(genuineSources, productionProfiles),
    fixtures,
    reports,
  };
}

export function serializeCatalog(catalog) {
  return `${canonicalize(catalog)}\n`;
}
