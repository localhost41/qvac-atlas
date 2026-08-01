import { createHash } from "node:crypto";

function assertJsonValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    if (Object.is(value, -0)) throw new TypeError(`${path} contains negative zero`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) throw new TypeError(`${path}.${key} is undefined`);
      assertJsonValue(child, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`${path} is not a JSON value`);
}

function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, order(value[key])]),
    );
  }
  return value;
}

/**
 * Atlas canonical JSON uses UTF-8 JSON, lexicographically sorted object keys,
 * preserved array order, and no insignificant whitespace. The schema restricts
 * claim-producing numbers to integers, avoiding cross-runtime float ambiguity.
 */
export function canonicalize(value) {
  assertJsonValue(value);
  return JSON.stringify(order(value));
}

export function reportPayload(report) {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("report must be an object");
  }
  const payload = structuredClone(report);
  delete payload.report_id;
  // Publication consent governs transport/review, not the observed evidence.
  // Fingerprint acknowledgement remains covered because it is part of the
  // evidence-collection disclosure contract.
  if (payload.consent !== null && typeof payload.consent === "object") {
    delete payload.consent.publication;
  }
  return payload;
}

export function calculateReportId(report) {
  const digest = createHash("sha256").update(canonicalize(reportPayload(report)), "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function withReportId(report) {
  const copy = structuredClone(report);
  copy.report_id = calculateReportId(copy);
  return copy;
}

export function verifyReportId(report) {
  return typeof report?.report_id === "string" && report.report_id === calculateReportId(report);
}
