import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";

import type { AdmittedSubmission } from "@qvac-atlas/submission";

import type { SubmissionQueue } from "../src/handler.js";
import { startRelayServer } from "../src/server.js";
import { eligibleJson } from "./helpers.js";

interface SocketResult {
  readonly body: string;
  readonly status: number;
}

function send(
  port: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
): Promise<SocketResult> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/submissions",
        method: "POST",
        headers: {
          host: "relay.example",
          "content-type": "application/json",
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            status: response.statusCode ?? 0,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end(body);
  });
}

test("the Node adapter admits exact bytes and rejects host/UTF-8/size attacks", async () => {
  const exactJson = await eligibleJson();
  const submissions: AdmittedSubmission[] = [];
  let readiness = 0;
  const queue: SubmissionQueue = {
    verifyReadiness: async () => {
      readiness += 1;
    },
    enqueue: async (submission) => {
      submissions.push(submission);
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
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const port =
      typeof address === "object" && address !== null ? address.port : 0;

    const accepted = await send(port, exactJson, {
      authorization: "Bearer must-not-cross",
      cookie: "must-not-cross=true",
      "x-forwarded-for": "203.0.113.1",
    });
    assert.equal(accepted.status, 202);
    assert.equal(submissions[0]?.exactJson, exactJson);
    assert.equal(readiness, 1);

    const wrongHost = await send(port, exactJson, { host: "attacker.example" });
    assert.equal(wrongHost.status, 400);
    const invalidUtf8 = await send(port, Buffer.from([0xff]));
    assert.equal(invalidUtf8.status, 400);
    const oversized = await send(port, Buffer.alloc(65_537, 0x20));
    assert.equal(oversized.status, 413);
    assert.equal(submissions.length, 1);
    assert.equal(wrongHost.body.includes(exactJson), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
