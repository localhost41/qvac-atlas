import { createHash } from "node:crypto";
import {
  canonicalize,
  compatibilityKey,
  deriveAggregateClaim,
  deriveReportClaim,
  usesAppleSiliconSocGpuIdentity,
  validatePublishableReport,
} from "@qvac-atlas/schema";

const GENUINE_SOURCE_KEY = /^source:[a-f0-9]{32}$/;
const ANONYMOUS_SOURCE_KEY = "source:anonymous-relay";
const FIXTURE_SOURCE_KEY = /^fixture:[a-z0-9][a-z0-9._-]{0,79}$/;
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(`Catalog admission failed: ${message}`);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateSource(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    fail("source metadata must be an object");
  }
  const keys = Object.keys(source).sort();
  const expectedKeys =
    source.kind === "genuine"
      ? ["independence", "kind", "lifecycle", "path", "report", "sourceKey"]
      : ["kind", "path", "report", "sourceKey"];
  if (canonicalize(keys) !== canonicalize(expectedKeys)) {
    fail("source metadata has an unsupported field");
  }
  if (!["fixture", "genuine"].includes(source.kind))
    fail("source kind is invalid");
  if (
    (source.kind === "genuine" &&
      !["independent", "unverified-anonymous"].includes(source.independence)) ||
    (source.kind === "genuine" &&
      source.independence === "independent" &&
      !GENUINE_SOURCE_KEY.test(source.sourceKey)) ||
    (source.kind === "genuine" &&
      source.independence === "unverified-anonymous" &&
      source.sourceKey !== ANONYMOUS_SOURCE_KEY) ||
    (source.kind === "fixture" && !FIXTURE_SOURCE_KEY.test(source.sourceKey))
  ) {
    fail("sourceKey is invalid for its source kind");
  }
  if (typeof source.path !== "string" || source.path.length === 0)
    fail("source path is invalid");

  if (source.kind === "genuine") {
    if (
      source.lifecycle === null ||
      typeof source.lifecycle !== "object" ||
      Array.isArray(source.lifecycle)
    ) {
      fail("genuine source lifecycle must be an object");
    }
    const lifecycleKeys = Object.keys(source.lifecycle).sort();
    const lifecycleExpected =
      source.lifecycle.state === "superseded"
        ? ["replacementPath", "state"]
        : ["state"];
    if (canonicalize(lifecycleKeys) !== canonicalize(lifecycleExpected))
      fail("genuine source lifecycle has an unsupported field");
    if (!["active", "superseded", "withdrawn"].includes(source.lifecycle.state))
      fail("genuine source lifecycle state is invalid");
    if (
      source.lifecycle.state === "superseded" &&
      (typeof source.lifecycle.replacementPath !== "string" ||
        source.lifecycle.replacementPath.length === 0)
    ) {
      fail("superseded source replacement path is invalid");
    }
  }

  const expectedProvenance = source.kind === "fixture" ? "fixture" : "probe";
  if (source.report?.provenance?.kind !== expectedProvenance) {
    fail("trusted source kind does not match report provenance");
  }
}

function validateLifecycle(genuineSources) {
  const byPath = new Map(genuineSources.map((source) => [source.path, source]));
  for (const source of [...genuineSources].sort((left, right) =>
    compareText(left.path, right.path),
  )) {
    if (source.lifecycle.state !== "superseded") continue;
    if (source.lifecycle.replacementPath === source.path)
      fail("a superseded source cannot replace itself");
    const replacement = byPath.get(source.lifecycle.replacementPath);
    if (replacement === undefined)
      fail("a superseded source replacement is missing");
    if (replacement.lifecycle.state !== "active")
      fail("a superseded source replacement must be active");
    if (replacement.sourceKey !== source.sourceKey)
      fail("a superseded source replacement must use the same sourceKey");
    if (replacement.independence !== source.independence)
      fail(
        "a superseded source replacement must use the same independence class",
      );
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
  if (gpus.length > 0) return `${report.platform.cpu.model} · ${gpus}`;
  if (usesAppleSiliconSocGpuIdentity(report)) {
    return `${report.platform.cpu.model} · integrated GPU keyed by Apple SoC identity`;
  }
  return `${report.platform.cpu.model} · GPU inventory not recorded`;
}

function osLabel(report) {
  const { family, version } = report.platform.os;
  const release =
    family === "macos" && report.provenance.kind === "probe"
      ? `${family} · kernel release ${version}`
      : `${family} ${version}`;
  return `${release} · ${report.platform.architecture}`;
}

function gpuLabel(report) {
  const gpus = report.platform.gpus.map((gpu) => gpu.model).filter(Boolean);
  if (gpus.length > 0) return gpus.join(", ");
  return usesAppleSiliconSocGpuIdentity(report)
    ? "integrated Apple GPU (SoC-keyed)"
    : "unknown";
}

function facets(report, outcome) {
  return {
    architecture: report.platform.architecture,
    hardware: hardwareLabel(report),
    memory: report.platform.memory_bucket,
    observedDevice: report.execution.backend_observation.backend ?? "unknown",
    os: osLabel(report),
    outcome,
    qvac: report.qvac.sdk_version ?? "unknown",
    requestedDevice: report.profile.requested_backend,
    gpu: gpuLabel(report),
  };
}

function reportEntry(source, derived) {
  return {
    claim: derived,
    facets: facets(source.report, derived.observation),
    report: source.report,
    reportId: source.report.report_id,
    slug: source.report.report_id.replace(/^sha256:/, ""),
    sourceIndependence:
      source.kind === "genuine" ? source.independence : "fixture",
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
        unverifiedAnonymous: group.some(
          ({ independence }) => independence === "unverified-anonymous",
        ),
      };
    })
    .sort((left, right) => compareText(left.claimId, right.claimId));
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
  validateLifecycle(genuineSources);
  for (const source of genuineSources)
    admittedProfiles(source.report, productionProfiles, "genuine");
  for (const source of fixtureSources)
    admittedProfiles(source.report, fixtureProfiles, "fixture");
  const activeGenuineSources = genuineSources.filter(
    ({ lifecycle }) => lifecycle.state === "active",
  );
  const reports = activeGenuineSources
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
    .sort((left, right) => compareText(left.reportId, right.reportId));
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
    .sort((left, right) => compareText(left.reportId, right.reportId));

  return {
    catalogVersion: 1,
    claims: aggregateEntries(activeGenuineSources, productionProfiles),
    fixtures,
    reports,
  };
}

export function serializeCatalog(catalog) {
  return `${canonicalize(catalog)}\n`;
}
