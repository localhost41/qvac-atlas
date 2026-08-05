import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

import {
  createAnonymousSubmissionClient,
  type AdmittedSubmission,
} from "@qvac-atlas/submission";

import type { SubmissionQueue } from "../src/handler.js";
import { startRelayServer } from "../src/server.js";
import { eligibleJson } from "./helpers.js";

test("submission client and loopback relay exchange the exact report end to end", async () => {
  const exactJson = await eligibleJson();
  const accepted = new Map<string, AdmittedSubmission>();
  const queue: SubmissionQueue = {
    verifyReadiness: async () => {},
    enqueue: async (submission) => {
      const prior = accepted.get(submission.reportId);
      if (prior !== undefined) {
        assert.equal(prior.exactJson, submission.exactJson);
        return "already-queued";
      }
      accepted.set(submission.reportId, submission);
      return "queued";
    },
  };
  const server = await startRelayServer(
    {
      githubAppId: "1",
      githubInstallationId: 1,
      githubPrivateKeyPem: "unused",
      listenHost: "127.0.0.1",
      maxConcurrentRequests: 2,
      port: 0,
      queueBaseBranch: "main",
      queueMaxPending: 100,
      queueOwner: "owner",
      queueRepository: "queue",
      queueRepositoryId: 1,
      relayOrigin: "https://relay.example",
    },
    queue,
  );
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const port =
      typeof address === "object" && address !== null ? address.port : 0;
    const client = createAnonymousSubmissionClient("https://relay.example", {
      fetch: async (input, init) => {
        const source = new URL(String(input));
        const headers = new Headers(init?.headers);
        headers.set("host", "relay.example");
        return new Promise<Response>((resolve, reject) => {
          const request = httpRequest(
            {
              headers: Object.fromEntries(headers),
              host: "127.0.0.1",
              method: init?.method,
              path: `${source.pathname}${source.search}`,
              port,
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              response.on("end", () =>
                resolve(
                  new Response(Buffer.concat(chunks), {
                    headers: Object.fromEntries(
                      Object.entries(response.headers).flatMap(
                        ([name, value]) =>
                          typeof value === "string" ? [[name, value]] : [],
                      ),
                    ),
                    status: response.statusCode,
                  }),
                ),
              );
            },
          );
          request.once("error", reject);
          init?.signal?.addEventListener(
            "abort",
            () => request.destroy(new Error("aborted")),
            { once: true },
          );
          request.end(String(init?.body ?? ""));
        });
      },
    });
    const first = await client.submit(exactJson, new AbortController().signal);
    const second = await client.submit(exactJson, new AbortController().signal);
    assert.equal(first.status, "queued");
    assert.equal(second.status, "already-queued");
    assert.equal(first.submissionId, second.submissionId);
    assert.equal(accepted.size, 1);
    assert.equal(accepted.get(first.submissionId)?.exactJson, exactJson);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
