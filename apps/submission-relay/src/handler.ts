import {
  admitExactSubmission,
  MAX_REPORT_BYTES,
  serializeReceipt,
  SUBMISSION_PATH,
  SubmissionProtocolError,
  type AdmittedSubmission,
  type QueueStatus,
} from "@qvac-atlas/submission";

export interface SubmissionQueue {
  verifyReadiness(signal: AbortSignal): Promise<void>;
  enqueue(
    submission: AdmittedSubmission,
    signal: AbortSignal,
  ): Promise<QueueStatus>;
}

const QUEUE_OPERATION_TIMEOUT_MS = 12_000;

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function jsonError(
  status: number,
  code: string,
  headers?: HeadersInit,
): Response {
  return new Response(`${JSON.stringify({ error: code })}\n`, {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

async function boundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_REPORT_BYTES)
  ) {
    throw new SubmissionProtocolError("body-size");
  }
  if (request.body === null) throw new SubmissionProtocolError("body-invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_REPORT_BYTES)
        throw new SubmissionProtocolError("body-size");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SubmissionProtocolError("body-invalid");
  }
}

export function createSubmissionHandler(queue: SubmissionQueue) {
  return async (request: Request): Promise<Response> => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return jsonError(400, "bad-request");
    }
    if (url.pathname !== SUBMISSION_PATH || url.search !== "")
      return jsonError(404, "not-found");
    if (request.method !== "POST")
      return jsonError(405, "method-not-allowed", { allow: "POST" });
    if (request.headers.has("content-encoding"))
      return jsonError(415, "unsupported-content-encoding");
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
      "application/json"
    ) {
      return jsonError(415, "unsupported-media-type");
    }

    let submission: AdmittedSubmission;
    try {
      submission = admitExactSubmission(await boundedBody(request));
    } catch (error) {
      if (
        error instanceof SubmissionProtocolError &&
        error.code === "body-size"
      ) {
        return jsonError(413, "submission-too-large");
      }
      return jsonError(400, "invalid-submission");
    }

    try {
      const status = await queue.enqueue(
        submission,
        AbortSignal.any([
          request.signal,
          AbortSignal.timeout(QUEUE_OPERATION_TIMEOUT_MS),
        ]),
      );
      return new Response(
        serializeReceipt({ status, submissionId: submission.reportId }),
        { status: 202, headers: BASE_HEADERS },
      );
    } catch {
      return jsonError(503, "queue-unavailable", { "retry-after": "60" });
    }
  };
}
