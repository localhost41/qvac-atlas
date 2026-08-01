import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { withReportId } from "@qvac-atlas/schema";
import {
  auditContributions,
  buildCatalogFromFiles,
  serializeCatalog,
} from "../src/index.js";

async function schemaFixture(name = "success.json") {
  return JSON.parse(
    await readFile(
      new URL(`../../schema/fixtures/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

function asProbe(report) {
  const copy = structuredClone(report);
  copy.provenance = { kind: "probe", fixture_id: null };
  return withReportId(copy);
}

function productionProfile(report, overrides = {}) {
  return {
    id: report.profile.id,
    version: report.profile.version,
    artifact_sha256: report.profile.artifact_sha256,
    requested_backend: report.profile.requested_backend,
    test_only: false,
    ...overrides,
  };
}

function reportPath(report) {
  return `reports/v1/${report.report_id.replace(":", "-")}.json`;
}

async function writeJson(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value)}\n`, "utf8");
}

async function repository({
  report,
  sources = [],
  productionProfiles = [],
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "qvac-atlas-contribution-"));
  await mkdir(join(root, "reports", "v1"), { recursive: true });
  await mkdir(join(root, "apps", "site", "src", "generated"), {
    recursive: true,
  });
  await writeFile(join(root, "reports", "v1", ".gitkeep"), "", "utf8");
  if (report !== undefined) await writeJson(root, reportPath(report), report);
  await writeJson(root, "registry/catalog.json", {
    version: 1,
    productionProfiles,
    fixtureProfiles: [],
    sources,
  });
  return root;
}

async function writeGenerated(root) {
  const catalog = await buildCatalogFromFiles({
    root,
    configPath: "registry/catalog.json",
  });
  await writeFile(
    join(root, "apps", "site", "src", "generated", "catalog.json"),
    serializeCatalog(catalog),
    "utf8",
  );
}

function metadata(report, path = reportPath(report)) {
  return { kind: "genuine", path, sourceKey: "review:fixture-source" };
}

test("a canonical tracked report and its one trusted source pass the audit", async () => {
  const report = asProbe(await schemaFixture());
  const path = reportPath(report);
  const root = await repository({
    report,
    sources: [metadata(report)],
    productionProfiles: [productionProfile(report)],
  });
  await writeGenerated(root);

  const result = await auditContributions({
    root,
    trackedPaths: new Set([path]),
    untrackedPaths: [],
  });
  assert.deepEqual(result, { fixtureReports: 0, genuineReports: 1, claims: 1 });
});

test("a registry source without a report is rejected as orphaned", async () => {
  const report = asProbe(await schemaFixture());
  const root = await repository({
    sources: [metadata(report)],
    productionProfiles: [productionProfile(report)],
  });

  await assert.rejects(
    auditContributions({ root, trackedPaths: new Set(), untrackedPaths: [] }),
    /genuine registry source has no versioned report file/,
  );
});

test("an unlisted versioned report is rejected", async () => {
  const report = asProbe(await schemaFixture());
  const path = reportPath(report);
  const root = await repository({ report });

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    /versioned report is not listed/,
  );
});

test("duplicate registry entries for one report are rejected", async () => {
  const report = asProbe(await schemaFixture());
  const path = reportPath(report);
  const root = await repository({
    report,
    sources: [
      metadata(report),
      { ...metadata(report), sourceKey: "review:other" },
    ],
    productionProfiles: [productionProfile(report)],
  });

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    /listed more than once/,
  );
});

test("a filename that does not map to report_id is rejected", async () => {
  const report = asProbe(await schemaFixture());
  const wrongPath =
    "reports/v1/sha256-0000000000000000000000000000000000000000000000000000000000000000.json";
  const root = await repository({
    sources: [metadata(report, wrongPath)],
    productionProfiles: [productionProfile(report)],
  });
  await writeJson(root, wrongPath, report);
  await writeFile(
    join(root, "apps", "site", "src", "generated", "catalog.json"),
    "{}\n",
    "utf8",
  );

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([wrongPath]),
      untrackedPaths: [],
    }),
    /filename does not match report ID/,
  );
});

test(
  "symlinked report evidence is rejected",
  { skip: process.platform === "win32" },
  async () => {
    const report = asProbe(await schemaFixture());
    const path = reportPath(report);
    const root = await repository({
      sources: [metadata(report)],
      productionProfiles: [productionProfile(report)],
    });
    const outside = join(
      await mkdtemp(join(tmpdir(), "qvac-atlas-report-")),
      "report.json",
    );
    await writeFile(outside, `${JSON.stringify(report)}\n`, "utf8");
    await symlink(outside, join(root, path));

    await assert.rejects(
      auditContributions({
        root,
        trackedPaths: new Set([path]),
        untrackedPaths: [],
      }),
      /outside the report naming contract|must be a regular file/,
    );
  },
);

test("schema-invalid evidence is rejected", async () => {
  const report = asProbe(await schemaFixture());
  report.untrusted = true;
  const adjusted = withReportId(report);
  const path = reportPath(adjusted);
  const root = await repository({
    report: adjusted,
    sources: [metadata(adjusted)],
    productionProfiles: [productionProfile(adjusted)],
  });

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    /schema:additionalProperties/,
  );
});

test("privacy-invalid evidence is rejected without echoing the value", async () => {
  const report = asProbe(await schemaFixture());
  const canary = "AKIAIOSFODNN7EXAMPLE";
  report.platform.cpu.model = canary;
  const adjusted = withReportId(report);
  const path = reportPath(adjusted);
  const root = await repository({
    report: adjusted,
    sources: [metadata(adjusted)],
    productionProfiles: [productionProfile(adjusted)],
  });

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    (error) => {
      assert.match(error.message, /privacy:known-token/);
      assert.doesNotMatch(error.message, new RegExp(canary));
      return true;
    },
  );
});

test("test-only profiles cannot cross into genuine admission", async () => {
  const report = asProbe(await schemaFixture());
  const path = reportPath(report);
  const root = await repository({
    report,
    sources: [metadata(report)],
    productionProfiles: [productionProfile(report, { test_only: true })],
  });

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    /production profile has the wrong test_only boundary/,
  );
});

test("untracked reports and deterministic catalog drift are rejected", async () => {
  const report = asProbe(await schemaFixture());
  const path = reportPath(report);
  const root = await repository({
    report,
    sources: [metadata(report)],
    productionProfiles: [productionProfile(report)],
  });
  await writeGenerated(root);

  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set(),
      untrackedPaths: [path],
    }),
    /untracked genuine report/,
  );

  await writeFile(
    join(root, "apps", "site", "src", "generated", "catalog.json"),
    "{}\n",
    "utf8",
  );
  await assert.rejects(
    auditContributions({
      root,
      trackedPaths: new Set([path]),
      untrackedPaths: [],
    }),
    /deterministic catalog rebuild differs/,
  );
});
