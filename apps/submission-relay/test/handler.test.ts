import assert from "node:assert/strict";
import test from "node:test";

import type { AdmittedSubmission } from "@qvac-atlas/submission";

import {
  createSubmissionHandler,
  type SubmissionQueue,
} from "../src/handler.js";
import { eligibleJson } from "./helpers.js";

function queue(): SubmissionQueue & { calls: AdmittedSubmission[] } {
  const calls: AdmittedSubmission[] = [];
  return {
    calls,
    verifyReadiness: async () => {},
    enqueue: async (submission) => {
      calls.push(submission);
      return "queued";
    },
  };
}

test("valid ingress queues one exact admitted report", async () => {
  const exactJson = await eligibleJson();
  const target = queue();
  const response = await createSubmissionHandler(target)(
    new Request("https://relay.example/v1/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: exactJson,
    }),
  );
  assert.equal(response.status, 202);
  assert.equal(target.calls.length, 1);
  assert.equal(target.calls[0]?.exactJson, exactJson);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await response.json()).sort(), [
    "status",
    "submission_id",
  ]);
});

test("HTTP and report rejection paths have zero queue effects", async () => {
  const exactJson = await eligibleJson();
  const cases: Array<[string, Request, number]> = [
    [
      "wrong path",
      new Request("https://relay.example/v1/other", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: exactJson,
      }),
      404,
    ],
    [
      "query",
      new Request("https://relay.example/v1/submissions?x=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: exactJson,
      }),
      404,
    ],
    ["method", new Request("https://relay.example/v1/submissions"), 405],
    [
      "media",
      new Request("https://relay.example/v1/submissions", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: exactJson,
      }),
      415,
    ],
    [
      "encoding",
      new Request("https://relay.example/v1/submissions", {
        method: "POST",
        headers: {
          "content-encoding": "gzip",
          "content-type": "application/json",
        },
        body: exactJson,
      }),
      415,
    ],
    [
      "noncanonical",
      new Request("https://relay.example/v1/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `${JSON.stringify(JSON.parse(exactJson), null, 2)}\n`,
      }),
      400,
    ],
    [
      "oversized header",
      new Request("https://relay.example/v1/submissions", {
        method: "POST",
        headers: {
          "content-length": "65537",
          "content-type": "application/json",
        },
        body: exactJson,
      }),
      413,
    ],
  ];
  for (const [name, request, expected] of cases) {
    const target = queue();
    const response = await createSubmissionHandler(target)(request);
    assert.equal(response.status, expected, name);
    assert.equal(target.calls.length, 0, name);
    assert.equal((await response.text()).includes(exactJson), false, name);
  }
});

test("queue failures are not reflected in the response", async () => {
  const exactJson = await eligibleJson();
  const canary = "private-github-upstream-detail";
  const response = await createSubmissionHandler({
    verifyReadiness: async () => {},
    enqueue: async () => {
      throw new Error(canary);
    },
  })(
    new Request("https://relay.example/v1/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: exactJson,
    }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes(canary), false);
});
