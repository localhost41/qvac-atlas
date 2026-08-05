import assert from "node:assert/strict";
import test from "node:test";

import {
  admitExactSubmission,
  createAnonymousSubmissionClient,
  serializeReceipt,
  SubmissionClientError,
} from "../src/index.js";
import { eligibleJson } from "./helpers.js";

test("the client sends the exact body once to the pinned route", async () => {
  const exactJson = await eligibleJson();
  const { reportId } = admitExactSubmission(exactJson);
  const calls: Array<[string, RequestInit | undefined]> = [];
  const client = createAnonymousSubmissionClient("https://relay.example", {
    fetch: async (input, init) => {
      calls.push([String(input), init]);
      return new Response(
        serializeReceipt({ status: "queued", submissionId: reportId }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  const receipt = await client.submit(exactJson, new AbortController().signal);
  assert.deepEqual(receipt, { status: "queued", submissionId: reportId });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "https://relay.example/v1/submissions");
  assert.equal(calls[0]?.[1]?.method, "POST");
  assert.equal(calls[0]?.[1]?.body, exactJson);
  assert.equal(calls[0]?.[1]?.redirect, "error");
  assert.deepEqual(calls[0]?.[1]?.headers, {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "qvac-atlas/0.2 anonymous-submission",
  });
});

test("invalid local evidence causes zero fetches", async () => {
  let calls = 0;
  const client = createAnonymousSubmissionClient("https://relay.example", {
    fetch: async () => {
      calls += 1;
      throw new Error("unreachable");
    },
  });
  await assert.rejects(
    client.submit("{}\n", new AbortController().signal),
    (error: unknown) =>
      error instanceof SubmissionClientError && error.code === "invalid-report",
  );
  assert.equal(calls, 0);
});

test("relay failures are fixed, bounded, and never retried", async () => {
  const exactJson = await eligibleJson();
  for (const response of [
    new Response("redirect", { status: 302 }),
    new Response("{}\n", {
      status: 202,
      headers: { "content-type": "text/plain" },
    }),
    new Response("x".repeat(513), {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  ]) {
    let calls = 0;
    const client = createAnonymousSubmissionClient("https://relay.example", {
      fetch: async () => {
        calls += 1;
        return response;
      },
    });
    await assert.rejects(
      client.submit(exactJson, new AbortController().signal),
      SubmissionClientError,
    );
    assert.equal(calls, 1);
  }

  let thrownCalls = 0;
  const unavailable = createAnonymousSubmissionClient("https://relay.example", {
    fetch: async () => {
      thrownCalls += 1;
      throw new Error("private upstream detail");
    },
  });
  await assert.rejects(
    unavailable.submit(exactJson, new AbortController().signal),
    (error: unknown) =>
      error instanceof SubmissionClientError &&
      error.code === "relay-unavailable" &&
      !error.message.includes("private"),
  );
  assert.equal(thrownCalls, 1);
});

test("a stalled response body maps to a deterministic timeout", async () => {
  const exactJson = await eligibleJson();
  let calls = 0;
  const client = createAnonymousSubmissionClient("https://relay.example", {
    timeoutMs: 100,
    fetch: async (_input, init) => {
      calls += 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(new Error("aborted")),
              { once: true },
            );
          },
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  const keepAlive = setTimeout(() => undefined, 250);
  try {
    await assert.rejects(
      client.submit(exactJson, new AbortController().signal),
      (error: unknown) =>
        error instanceof SubmissionClientError && error.code === "timed-out",
    );
    assert.equal(calls, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("only a clean HTTPS origin with no path is accepted", () => {
  for (const origin of [
    "http://relay.example",
    "https://user@relay.example",
    "https://relay.example/path",
    "https://relay.example/?query=1",
  ]) {
    assert.throws(
      () => createAnonymousSubmissionClient(origin),
      SubmissionClientError,
    );
  }
});
