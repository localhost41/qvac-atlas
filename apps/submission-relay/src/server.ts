import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { MAX_REPORT_BYTES } from "@qvac-atlas/submission";

import type { RelayConfig } from "./config.js";
import { createSubmissionHandler, type SubmissionQueue } from "./handler.js";

const SERVER_RESPONSE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function fixedResponse(
  response: ServerResponse,
  status: number,
  code: string,
): void {
  response.writeHead(status, SERVER_RESPONSE_HEADERS);
  response.end(`${JSON.stringify({ error: code })}\n`);
}

async function readBody(
  request: IncomingMessage,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const raw of request) {
    signal.throwIfAborted();
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    length += chunk.byteLength;
    if (length > MAX_REPORT_BYTES) throw new Error("body-size");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export async function startRelayServer(
  config: RelayConfig,
  queue: SubmissionQueue,
): Promise<ReturnType<typeof createServer>> {
  await queue.verifyReadiness(AbortSignal.timeout(10_000));
  const handler = createSubmissionHandler(queue);
  const expectedHost = new URL(config.relayOrigin).host.toLowerCase();
  let active = 0;

  const server = createServer(
    { maxHeaderSize: 8_192, requireHostHeader: true },
    async (incoming, outgoing) => {
      if (active >= config.maxConcurrentRequests) {
        fixedResponse(outgoing, 503, "relay-busy");
        return;
      }
      active += 1;
      const controller = new AbortController();
      const abort = () => controller.abort();
      incoming.once("aborted", abort);
      outgoing.once("close", abort);
      try {
        if (incoming.headers.host?.toLowerCase() !== expectedHost) {
          fixedResponse(outgoing, 400, "bad-host");
          return;
        }
        if (
          typeof incoming.url !== "string" ||
          !incoming.url.startsWith("/") ||
          incoming.url.startsWith("//") ||
          typeof incoming.method !== "string"
        ) {
          fixedResponse(outgoing, 400, "bad-request");
          return;
        }
        if (incoming.method === "GET" && incoming.url === "/healthz") {
          outgoing.writeHead(200, SERVER_RESPONSE_HEADERS);
          outgoing.end('{"status":"ok"}\n');
          return;
        }
        const body = await readBody(incoming, controller.signal);
        const exactBody = new TextDecoder("utf-8", { fatal: true }).decode(
          body,
        );
        const forwardedHeaders = new Headers();
        for (const name of [
          "accept",
          "content-encoding",
          "content-length",
          "content-type",
        ]) {
          const value = incoming.headers[name];
          if (typeof value === "string") forwardedHeaders.set(name, value);
        }
        const request = new Request(new URL(incoming.url, config.relayOrigin), {
          method: incoming.method,
          headers: forwardedHeaders,
          body: body.byteLength === 0 ? undefined : exactBody,
          signal: controller.signal,
        });
        const result = await handler(request);
        outgoing.writeHead(result.status, Object.fromEntries(result.headers));
        outgoing.end(Buffer.from(await result.arrayBuffer()));
      } catch (error) {
        if (!outgoing.headersSent) {
          fixedResponse(
            outgoing,
            error instanceof Error && error.message === "body-size" ? 413 : 400,
            error instanceof Error && error.message === "body-size"
              ? "submission-too-large"
              : "bad-request",
          );
        } else {
          outgoing.destroy();
        }
      } finally {
        incoming.off("aborted", abort);
        outgoing.off("close", abort);
        active -= 1;
      }
    },
  );
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 10;
  server.on("clientError", (_error, socket) => {
    if (socket.writable)
      socket.end(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
  });
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    server.once("error", fail);
    server.listen(config.port, config.listenHost, () => {
      server.off("error", fail);
      resolve();
    });
  });
  return server;
}
