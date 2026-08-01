import { writeFile } from "node:fs/promises";

export interface ReportWriter {
  writeExclusive(outputPath: string, exactBytes: string): Promise<void>;
}

export class LocalReportWriter implements ReportWriter {
  async writeExclusive(outputPath: string, exactBytes: string): Promise<void> {
    await writeFile(outputPath, exactBytes, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
}
