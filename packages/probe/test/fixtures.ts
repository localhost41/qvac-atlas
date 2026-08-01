import type { PlatformSource } from "../src/platform.js";
import type { ProbeInteraction } from "../src/pipeline.js";
import type { ReportWriter } from "../src/writer.js";

export const deterministicPlatform: PlatformSource = {
  platform: () => "darwin",
  release: () => "24.5.0",
  arch: () => "arm64",
  cpus: () => [{ model: "Apple M3 Pro" }],
  totalmem: () => 18 * 1024 ** 3,
  nodeVersion: () => "22.17.0",
};

export const passingDoctor = {
  run: async () => ({
    evidence: {
      status: "passed" as const,
      reason: "completed" as const,
      duration_ms: 12,
    },
  }),
};

export class RecordingWriter implements ReportWriter {
  writes: Array<{ path: string; bytes: string }> = [];
  async writeExclusive(path: string, bytes: string): Promise<void> {
    this.writes.push({ path, bytes });
  }
}

export class RecordingInteraction implements ProbeInteraction {
  readonly calls: string[] = [];
  readonly previews: Array<{ kind: "draft" | "final"; json: string }> = [];

  constructor(
    private readonly fingerprint = true,
    private readonly publication: boolean | null = true,
    private readonly write = true,
  ) {}

  async disclose(): Promise<void> {
    this.calls.push("disclose");
  }
  async acknowledgeFingerprint(): Promise<boolean> {
    this.calls.push("fingerprint");
    return this.fingerprint;
  }
  async preview(json: string, kind: "draft" | "final"): Promise<void> {
    this.calls.push(`preview:${kind}`);
    this.previews.push({ kind, json });
  }
  async choosePublication(): Promise<boolean | null> {
    this.calls.push("publication");
    return this.publication;
  }
  async confirmLocalWrite(): Promise<boolean> {
    this.calls.push("write-consent");
    return this.write;
  }
}
