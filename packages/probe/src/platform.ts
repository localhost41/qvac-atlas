import os from "node:os";

import { scanPrivacy } from "@qvac-atlas/schema";

import type { PlatformEvidence } from "./types.js";

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

function safeLabel(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 160);
  if (normalized.length === 0 || scanPrivacy({ value: normalized }).length > 0)
    return "unknown";
  return normalized;
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
} {
  const model = safeLabel(source.cpus()[0]?.model);
  return {
    platform: {
      os: {
        family: family(String(source.platform())),
        version: safeLabel(source.release()),
        build: null,
      },
      architecture: architecture(source.arch()),
      cpu: { vendor: cpuVendor(model), model, family: null, feature_flags: [] },
      memory_bucket: memoryBucket(source.totalmem()),
      // Node has no safe cross-platform GPU inventory API. Empty means
      // uncollected in this packet, never evidence of CPU execution.
      gpus: [],
    },
    nodeVersion: safeLabel(source.nodeVersion()).replace(/^v/, ""),
  };
}
