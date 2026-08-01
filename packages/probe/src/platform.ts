import os from "node:os";

import { scanPrivacy } from "@qvac-atlas/schema";

import type { PlatformEvidence, RedactionCounts } from "./types.js";

export interface PlatformSource {
  platform(): NodeJS.Platform | string;
  release(): string;
  arch(): string;
  cpus(): Array<{ model: string }>;
  totalmem(): number;
  nodeVersion(): string;
}

const nodePlatformSource: PlatformSource = {
  platform: () => os.platform(),
  release: () => os.release(),
  arch: () => os.arch(),
  cpus: () => os.cpus().map(({ model }) => ({ model })),
  totalmem: () => os.totalmem(),
  nodeVersion: () => process.versions.node,
};

const REDACTION_CATEGORY: Readonly<Record<string, keyof RedactionCounts>> = {
  "private-key": "credentials",
  "bearer-token": "credentials",
  jwt: "credentials",
  "known-token": "credentials",
  "credential-url": "credentials",
  "sensitive-assignment": "credentials",
  "high-entropy-string": "credentials",
  email: "identifiers",
  "stable-identifier": "identifiers",
  "forbidden-field-name": "identifiers",
  "ipv4-address": "network",
  "ipv6-address": "network",
  "mac-address": "network",
  "windows-user-path": "paths",
  "posix-user-path": "paths",
  "windows-absolute-path": "paths",
  "windows-unc-path": "paths",
  "posix-absolute-path": "paths",
};

const zeroRedactionCounts = (): RedactionCounts => ({
  credentials: 0,
  identifiers: 0,
  network: 0,
  paths: 0,
});

function safeLabel(value: unknown): {
  value: string;
  redactionCounts: RedactionCounts;
} {
  const redactionCounts = zeroRedactionCounts();
  if (typeof value !== "string") return { value: "unknown", redactionCounts };
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 160);
  if (normalized.length === 0) return { value: "unknown", redactionCounts };
  const categories = new Set<keyof RedactionCounts>();
  for (const finding of scanPrivacy({ value: normalized })) {
    const category = REDACTION_CATEGORY[finding.rule];
    if (category !== undefined) categories.add(category);
  }
  if (categories.size === 0) return { value: normalized, redactionCounts };
  for (const category of categories) redactionCounts[category] = 1;
  return { value: "unknown", redactionCounts };
}

function addRedactionCounts(
  target: RedactionCounts,
  addition: RedactionCounts,
): void {
  for (const category of Object.keys(target) as Array<keyof RedactionCounts>) {
    target[category] = Math.min(100_000, target[category] + addition[category]);
  }
}

function family(value: string): PlatformEvidence["os"]["family"] {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  if (value === "linux") return "linux";
  return "unknown";
}

function architecture(value: string): PlatformEvidence["architecture"] {
  if (value === "arm64") return "arm64";
  if (value === "x64") return "x64";
  return "unknown";
}

function cpuVendor(model: string): string {
  if (/apple/i.test(model)) return "Apple";
  if (/intel/i.test(model)) return "Intel";
  if (/amd|ryzen/i.test(model)) return "AMD";
  if (/arm|cortex/i.test(model)) return "ARM";
  return "unknown";
}

function memoryBucket(bytes: number): PlatformEvidence["memory_bucket"] {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unknown";
  const gib = bytes / 1024 ** 3;
  if (gib < 8) return "under-8-gib";
  if (gib < 16) return "8-15-gib";
  if (gib < 32) return "16-31-gib";
  if (gib < 64) return "32-63-gib";
  return "64-gib-or-more";
}

export function collectPlatform(source: PlatformSource = nodePlatformSource): {
  platform: PlatformEvidence;
  nodeVersion: string;
  redactionCounts: RedactionCounts;
} {
  const release = safeLabel(source.release());
  const model = safeLabel(source.cpus()[0]?.model);
  const nodeVersion = safeLabel(source.nodeVersion());
  const redactionCounts = zeroRedactionCounts();
  addRedactionCounts(redactionCounts, release.redactionCounts);
  addRedactionCounts(redactionCounts, model.redactionCounts);
  addRedactionCounts(redactionCounts, nodeVersion.redactionCounts);
  return {
    platform: {
      os: {
        family: family(String(source.platform())),
        version: release.value,
        build: null,
      },
      architecture: architecture(source.arch()),
      cpu: {
        vendor: cpuVendor(model.value),
        model: model.value,
        family: null,
        feature_flags: [],
      },
      memory_bucket: memoryBucket(source.totalmem()),
      // Node has no safe cross-platform GPU inventory API. Empty means
      // uncollected in this packet, never evidence of CPU execution.
      gpus: [],
    },
    nodeVersion: nodeVersion.value.replace(/^v/, ""),
    redactionCounts,
  };
}
