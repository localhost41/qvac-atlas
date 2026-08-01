import type { AtlasReport as SchemaAtlasReport } from "@qvac-atlas/schema/report";

export type AtlasReport = SchemaAtlasReport;
export type CheckEvidence = AtlasReport["qvac"]["discovery"];
export type CheckStatus = CheckEvidence["status"];
export type CheckReason = CheckEvidence["reason"];
export type PlatformEvidence = AtlasReport["platform"];
export type QvacEvidence = AtlasReport["qvac"];
export type ProfileEvidence = AtlasReport["profile"];
export type RequestedDevice = ProfileEvidence["requested_backend"];
export type LifecyclePhase = AtlasReport["execution"]["phases"][number]["name"];
export type DeviceClass = Exclude<
  AtlasReport["execution"]["backend_observation"]["backend"],
  null | "unknown"
>;
export type RunnerEvidence = AtlasReport["execution"] & {
  result: AtlasReport["result"];
};
export type RedactionCounts = AtlasReport["privacy"]["redaction_counts"];
