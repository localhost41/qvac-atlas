import {
  admitExactSubmission,
  DEFAULT_SUBMISSION_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  parseReceipt,
  SUBMISSION_PATH,
  SubmissionProtocolError,
  type SubmissionReceipt,
} from "./protocol.js";

export type SubmissionClientErrorCode =
  | "cancelled"
  | "invalid-report"
  | "relay-rejected"
  | "relay-response"
  | "relay-unavailable"
  | "timed-out";

export class SubmissionClientError extends Error {
  readonly code: SubmissionClientErrorCode;

  constructor(code: SubmissionClientErrorCode) {
    super(code);
    this.name = "SubmissionClientError";
    this.code = code;
  }
}

export interface AnonymousSubmissionClient {
  readonly origin: string;
  submit(exactJson: string, signal: AbortSignal): Promise<SubmissionReceipt>;
}

export interface SubmissionClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

function pinnedOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SubmissionClientError("relay-unavailable");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new SubmissionClientError("relay-unavailable");
  }
  return url.origin;
}

async function boundedResponseText(response: Response): Promise<string> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new SubmissionClientError("relay-response");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new SubmissionClientError("relay-response");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
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
    throw new SubmissionClientError("relay-response");
  }
}

export function createAnonymousSubmissionClient(
  relayOrigin: string,
  options: SubmissionClientOptions = {},
): AnonymousSubmissionClient {
  const origin = pinnedOrigin(relayOrigin);
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBMISSION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new SubmissionClientError("relay-unavailable");

  return {
    origin,
    async submit(exactJson, signal) {
      let admitted;
      try {
        admitted = admitExactSubmission(exactJson);
      } catch (error) {
        if (error instanceof SubmissionProtocolError)
          throw new SubmissionClientError("invalid-report");
        throw error;
      }
      if (signal.aborted) throw new SubmissionClientError("cancelled");
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = AbortSignal.any([signal, timeout]);
      let response: Response;
      try {
        response = await fetchFn(`${origin}${SUBMISSION_PATH}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": "qvac-atlas/0.2 anonymous-submission",
          },
          body: exactJson,
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: combined,
        });
      } catch {
        if (signal.aborted) throw new SubmissionClientError("cancelled");
        if (timeout.aborted) throw new SubmissionClientError("timed-out");
        throw new SubmissionClientError("relay-unavailable");
      }
      if (response.status !== 202) {
        await response.body?.cancel().catch(() => undefined);
        throw new SubmissionClientError("relay-rejected");
      }
      if (
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
        "application/json"
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new SubmissionClientError("relay-response");
      }
      let responseText: string;
      try {
        responseText = await boundedResponseText(response);
      } catch (error) {
        if (signal.aborted) throw new SubmissionClientError("cancelled");
        if (timeout.aborted) throw new SubmissionClientError("timed-out");
        if (error instanceof SubmissionClientError) throw error;
        throw new SubmissionClientError("relay-response");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
        return parseReceipt(parsed, admitted.reportId);
      } catch (error) {
        if (error instanceof SubmissionClientError) throw error;
        throw new SubmissionClientError("relay-response");
      }
    },
  };
}
