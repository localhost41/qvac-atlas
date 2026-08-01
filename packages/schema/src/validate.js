import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PHASE_ORDER } from "./claims.js";
import { verifyReportId } from "./canonicalize.js";
import { scanPrivacy } from "./privacy.js";

const reportSchema = JSON.parse(readFileSync(new URL("../schemas/report.schema.json", import.meta.url), "utf8"));
const claimSchema = JSON.parse(readFileSync(new URL("../schemas/claim.schema.json", import.meta.url), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(reportSchema);
export const validateDerivedClaim = ajv.compile(claimSchema);

function error(path, code, message) {
  return { path, code, message };
}

function sorted(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function semanticErrors(report) {
  const errors = [];
  if (!verifyReportId(report)) errors.push(error("/report_id", "report-id", "report ID does not match canonical payload"));

  const flags = report.platform.cpu.feature_flags;
  if (!sorted(flags)) errors.push(error("/platform/cpu/feature_flags", "canonical-order", "feature flags must be sorted"));

  const gpuIndexes = report.platform.gpus.map((gpu) => gpu.index);
  if (!sorted(gpuIndexes) || new Set(gpuIndexes).size !== gpuIndexes.length) {
    errors.push(error("/platform/gpus", "canonical-order", "GPUs must have unique ascending indexes"));
  }

  const packageKeys = report.qvac.packages.map((entry) => `${entry.name}@${entry.version}`);
  if (!sorted(packageKeys)) errors.push(error("/qvac/packages", "canonical-order", "QVAC packages must be sorted"));

  const phaseIndexes = report.execution.phases.map((phase) => PHASE_ORDER.indexOf(phase.name));
  if (!sorted(phaseIndexes) || new Set(phaseIndexes).size !== phaseIndexes.length) {
    errors.push(error("/execution/phases", "phase-order", "execution phases must be unique and in lifecycle order"));
  }

  for (const [index, phase] of report.execution.phases.entries()) {
    const requiresDuration = phase.status === "passed" || phase.status === "failed";
    if (requiresDuration !== (phase.duration_ms !== null)) {
      errors.push(error(`/execution/phases/${index}/duration_ms`, "phase-duration", "passed/failed phases require duration; skipped/unknown phases require null"));
    }
  }

  for (const [name, check] of Object.entries({ discovery: report.qvac.discovery, ...report.official_checks })) {
    const requiresDuration = check.status === "passed" || check.status === "failed";
    if (requiresDuration !== (check.duration_ms !== null)) {
      errors.push(error(`/checks/${name}/duration_ms`, "check-duration", "passed/failed checks require duration; skipped/unknown checks require null"));
    }
    const permittedReasons = {
      passed: ["completed"],
      failed: ["failed", "timed-out", "missing-qvac"],
      skipped: ["missing-qvac", "not-applicable", "not-reached"],
      unknown: ["unavailable", "unknown"],
    }[check.status];
    if (!permittedReasons.includes(check.reason)) {
      errors.push(error(`/checks/${name}/reason`, "check-reason", "check reason is inconsistent with its explicit status"));
    }
  }

  if (report.qvac.discovery.reason === "missing-qvac") {
    if (report.qvac.sdk_version !== null || report.qvac.packages.length !== 0) {
      errors.push(error("/qvac", "missing-qvac", "missing QVAC requires a null SDK version and no discovered packages"));
    }
  } else if (report.qvac.discovery.status === "passed" && report.qvac.sdk_version === null) {
    errors.push(error("/qvac/sdk_version", "qvac-version", "successful discovery requires an SDK version"));
  }

  const backend = report.execution.backend_observation;
  if (backend.status === "observed" && backend.backend === "unknown") {
    errors.push(error("/execution/backend_observation/backend", "backend-observation", "an observed backend cannot be unknown"));
  }

  const termination = report.execution.termination;
  if (termination.kind === "clean-exit" && (termination.exit_code !== 0 || termination.signal !== null)) {
    errors.push(error("/execution/termination", "termination", "clean exit requires exit code 0 and no signal"));
  }
  if (termination.kind === "signal" && termination.signal === null) {
    errors.push(error("/execution/termination/signal", "termination", "signal termination requires a signal"));
  }
  if (termination.kind !== "signal" && termination.signal !== null) {
    errors.push(error("/execution/termination/signal", "termination", "only signal termination may include a signal"));
  }
  if (termination.kind === "exit-code" && termination.exit_code === null) {
    errors.push(error("/execution/termination/exit_code", "termination", "exit-code termination requires an exit code"));
  }
  if (!["clean-exit", "exit-code"].includes(termination.kind) && termination.exit_code !== null) {
    errors.push(error("/execution/termination/exit_code", "termination", "this termination kind cannot include an exit code"));
  }
  const completedPhases = report.execution.phases.filter((phase) => phase.status === "passed");
  const expectedLastCompleted = completedPhases.at(-1)?.name ?? null;
  if (termination.last_completed_phase !== expectedLastCompleted) {
    errors.push(error("/execution/termination/last_completed_phase", "termination", "last completed phase must equal the final passed lifecycle phase"));
  }

  const result = report.result;
  if (result.workload_status === "passed") {
    if (!result.completion_observed || result.failure.category !== "none" || termination.kind !== "clean-exit") {
      errors.push(error("/result", "successful-result", "passed workload requires observed completion, no failure, and clean exit"));
    }
  } else if (result.completion_observed) {
    errors.push(error("/result/completion_observed", "completion", "only a passed workload may have observed completion"));
  }
  if (result.failure.category === "none" && result.workload_status !== "passed") {
    errors.push(error("/result/failure/category", "failure", "non-passing workload requires a failure or unknown category"));
  }
  if (result.failure.category !== "none" && result.workload_status === "passed") {
    errors.push(error("/result/failure/category", "failure", "passing workload cannot include a failure"));
  }
  if (result.failure.category === "missing-qvac" && (result.workload_status !== "skipped" || termination.kind !== "not-started")) {
    errors.push(error("/result/failure/category", "missing-qvac", "missing QVAC requires skipped workload and a runner that was not started"));
  }
  if (result.failure.category === "timeout" && termination.kind !== "timeout") {
    errors.push(error("/execution/termination/kind", "failure-termination", "timeout failure requires timeout termination"));
  }
  if (result.failure.category === "worker-crash" && !["signal", "exit-code"].includes(termination.kind)) {
    errors.push(error("/execution/termination/kind", "failure-termination", "worker crash requires signal or exit-code termination"));
  }

  return errors;
}

function schemaErrors() {
  return (validateSchema.errors ?? []).map((entry) => ({
    path: entry.instancePath || "/",
    code: `schema:${entry.keyword}`,
    message: entry.message ?? "schema validation failed",
  }));
}

export function validateReport(report) {
  const schemaValid = validateSchema(report);
  if (!schemaValid) return { valid: false, errors: schemaErrors() };

  const errors = [
    ...semanticErrors(report),
    ...scanPrivacy(report).map((finding) => error(finding.path, `privacy:${finding.rule}`, "report contains forbidden private data")),
  ];
  return { valid: errors.length === 0, errors };
}

export function validatePublishableReport(report) {
  const result = validateReport(report);
  if (result.valid && (!report.consent.publication || !report.consent.fingerprint_acknowledged)) {
    return {
      valid: false,
      errors: [error("/consent", "publication-consent", "publication requires fingerprint acknowledgement and explicit consent")],
    };
  }
  return result;
}

export function assertValidReport(report, { publishable = false } = {}) {
  const result = publishable ? validatePublishableReport(report) : validateReport(report);
  if (!result.valid) {
    const detail = result.errors.map((entry) => `${entry.path} [${entry.code}] ${entry.message}`).join("\n");
    throw new Error(`Invalid QVAC Atlas report:\n${detail}`);
  }
  return report;
}

export { reportSchema, claimSchema };
