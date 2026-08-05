import { canonicalize, validatePublishableReport } from "@qvac-atlas/schema";

export const SUBMISSION_PATH = "/v1/submissions";
export const MAX_REPORT_BYTES = 65_536;
export const MAX_RESPONSE_BYTES = 512;
export const DEFAULT_SUBMISSION_TIMEOUT_MS = 15_000;

const REPORT_ID = /^sha256:[a-f0-9]{64}$/u;

export const SUBMISSION_PROFILE = Object.freeze({
  artifact_sha256:
    "48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201",
  id: "atlas-smollm2-360m-lifecycle",
  requested_backend: "gpu",
  version: "1.0.0-candidate.1",
});

export type QueueStatus = "queued" | "already-queued";

export interface AdmittedSubmission {
  readonly exactJson: string;
  readonly report: Record<string, unknown>;
  readonly reportId: string;
  readonly digest: string;
}

export interface SubmissionReceipt {
  readonly status: QueueStatus;
  readonly submissionId: string;
}

export class SubmissionProtocolError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SubmissionProtocolError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

export function isSubmissionEligibleReport(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.profile)) return false;
  const profile = value.profile;
  return (
    exactKeys(profile, [
      "artifact_sha256",
      "id",
      "requested_backend",
      "version",
    ]) &&
    profile.id === SUBMISSION_PROFILE.id &&
    profile.version === SUBMISSION_PROFILE.version &&
    profile.artifact_sha256 === SUBMISSION_PROFILE.artifact_sha256 &&
    profile.requested_backend === SUBMISSION_PROFILE.requested_backend
  );
}

export function admitExactSubmission(exactJson: string): AdmittedSubmission {
  if (typeof exactJson !== "string")
    throw new SubmissionProtocolError("body-invalid");
  const size = Buffer.byteLength(exactJson, "utf8");
  if (size === 0 || size > MAX_REPORT_BYTES)
    throw new SubmissionProtocolError("body-size");

  let parsed: unknown;
  try {
    parsed = JSON.parse(exactJson);
  } catch {
    throw new SubmissionProtocolError("body-json");
  }
  if (!isRecord(parsed)) throw new SubmissionProtocolError("report-shape");

  let canonical: string;
  try {
    canonical = `${canonicalize(parsed)}\n`;
  } catch {
    throw new SubmissionProtocolError("body-json");
  }
  if (exactJson !== canonical)
    throw new SubmissionProtocolError("body-noncanonical");

  const validation = validatePublishableReport(parsed);
  if (!validation.valid) throw new SubmissionProtocolError("report-invalid");
  if (!isSubmissionEligibleReport(parsed))
    throw new SubmissionProtocolError("report-profile");

  const provenance = parsed.provenance;
  if (
    !isRecord(provenance) ||
    provenance.kind !== "probe" ||
    provenance.fixture_id !== null
  ) {
    throw new SubmissionProtocolError("report-not-genuine");
  }
  const reportId = parsed.report_id;
  if (typeof reportId !== "string" || !REPORT_ID.test(reportId))
    throw new SubmissionProtocolError("report-id");

  return {
    exactJson,
    report: parsed,
    reportId,
    digest: reportId.slice("sha256:".length),
  };
}

export function serializeReceipt(receipt: SubmissionReceipt): string {
  if (
    !["queued", "already-queued"].includes(receipt.status) ||
    !REPORT_ID.test(receipt.submissionId)
  ) {
    throw new SubmissionProtocolError("receipt-invalid");
  }
  return `${canonicalize({
    status: receipt.status,
    submission_id: receipt.submissionId,
  })}\n`;
}

export function parseReceipt(
  value: unknown,
  expectedReportId: string,
): SubmissionReceipt {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "submission_id"]) ||
    !["queued", "already-queued"].includes(String(value.status)) ||
    value.submission_id !== expectedReportId
  ) {
    throw new SubmissionProtocolError("receipt-invalid");
  }
  return {
    status: value.status as QueueStatus,
    submissionId: value.submission_id,
  };
}
