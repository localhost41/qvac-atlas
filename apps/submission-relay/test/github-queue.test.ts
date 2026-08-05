import assert from "node:assert/strict";
import test from "node:test";

import { GitHubPrivateQueue } from "../src/github-queue.js";
import { eligibleSubmission, jsonResponse } from "./helpers.js";

const BASE = "a".repeat(40);
const BASE_PARENT = "9".repeat(40);
const BASE_TREE = "b".repeat(40);
const BLOB = "c".repeat(40);
const TREE = "d".repeat(40);
const SUBMISSIONS_TREE = "e".repeat(40);
const V1_TREE = "f".repeat(40);
const COMMIT = "1".repeat(40);

class FakeGitHub {
  readonly calls: Array<{ body: any; method: string; path: string }> = [];
  readonly owner = "atlas-owner";
  readonly repository = "private-queue";
  readonly repositoryId = 789;
  private = true;
  corruptComparison = false;
  baseParents: Array<{ sha: string }> = [{ sha: BASE_PARENT }];
  partialRefs = 0;
  pending = 0;
  ref: string | null = null;
  pull: { head: string; state: "open" | "closed" } | null = null;
  exactJson = "";
  queuePath = "";

  fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body =
      init?.body === undefined ? null : JSON.parse(String(init.body));
    this.calls.push({ body, method, path: `${url.pathname}${url.search}` });
    const root = `/repos/${this.owner}/${this.repository}`;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${"t".repeat(24)}`,
    );

    if (url.pathname === root && method === "GET") {
      return jsonResponse({
        archived: false,
        default_branch: "main",
        disabled: false,
        full_name: `${this.owner}/${this.repository}`,
        id: this.repositoryId,
        permissions: { push: true },
        private: this.private,
        visibility: this.private ? "private" : "public",
      });
    }
    if (url.pathname.startsWith(`${root}/contents/`) && method === "GET")
      return jsonResponse({}, 404);
    if (url.pathname === `${root}/pulls` && method === "GET") {
      if (!url.searchParams.has("head"))
        return jsonResponse(
          Array.from(
            {
              length: this.pending + (this.pull?.state === "open" ? 1 : 0),
            },
            () => ({}),
          ),
        );
      const currentBranch = `atlas-anonymous/${this.queuePath.split("/").at(-1)?.replace(".json", "")}`;
      return jsonResponse(
        this.pull === null ||
          url.searchParams.get("head") !== `${this.owner}:${currentBranch}`
          ? []
          : [
              {
                base: { ref: "main" },
                head: {
                  ref: currentBranch,
                  sha: this.pull.head,
                },
                state: this.pull.state,
              },
            ],
      );
    }
    if (url.pathname === `${root}/git/ref/heads/main` && method === "GET")
      return jsonResponse({ object: { sha: BASE } });
    if (
      url.pathname === `${root}/git/matching-refs/heads/atlas-anonymous/` &&
      method === "GET"
    ) {
      return jsonResponse([
        ...Array.from({ length: this.partialRefs }, (_, index) => ({
          object: { sha: "2".repeat(40) },
          ref: `refs/heads/atlas-anonymous/sha256-${index.toString(16).padStart(64, "0")}`,
        })),
        ...(this.ref === null
          ? []
          : [
              {
                object: { sha: this.ref },
                ref: `refs/heads/atlas-anonymous/${this.queuePath.split("/").at(-1)?.replace(".json", "")}`,
              },
            ]),
      ]);
    }
    if (
      url.pathname.startsWith(`${root}/git/ref/heads/atlas-anonymous/`) &&
      method === "GET"
    ) {
      const currentBranch = `atlas-anonymous/${this.queuePath.split("/").at(-1)?.replace(".json", "")}`;
      const requestedBranch = url.pathname.slice(
        `${root}/git/ref/heads/`.length,
      );
      return this.ref === null || requestedBranch !== currentBranch
        ? jsonResponse({}, 404)
        : jsonResponse({ object: { sha: this.ref } });
    }
    if (url.pathname === `${root}/git/commits/${BASE}` && method === "GET")
      return jsonResponse({
        parents: this.baseParents,
        tree: { sha: BASE_TREE },
      });
    if (url.pathname === `${root}/git/blobs` && method === "POST") {
      this.exactJson = body.content;
      return jsonResponse({ sha: BLOB }, 201);
    }
    if (url.pathname === `${root}/git/trees` && method === "POST") {
      this.queuePath = body.tree[0].path;
      assert.deepEqual(body.tree[0], {
        mode: "100644",
        path: this.queuePath,
        sha: BLOB,
        type: "blob",
      });
      return jsonResponse({ sha: TREE }, 201);
    }
    if (url.pathname === `${root}/git/commits` && method === "POST") {
      assert.deepEqual(body.parents, [BASE]);
      assert.equal(body.tree, TREE);
      return jsonResponse({ sha: COMMIT }, 201);
    }
    if (url.pathname === `${root}/git/refs` && method === "POST") {
      if (this.ref !== null) return jsonResponse({}, 422);
      this.ref = body.sha;
      return jsonResponse({}, 201);
    }
    if (url.pathname === `${root}/git/commits/${COMMIT}` && method === "GET")
      return jsonResponse({ parents: [{ sha: BASE }], tree: { sha: TREE } });
    if (
      url.pathname === `${root}/compare/${BASE}...${COMMIT}` &&
      method === "GET"
    )
      return jsonResponse({
        ahead_by: 1,
        commits: [{ sha: COMMIT }],
        files: this.corruptComparison
          ? [
              { filename: this.queuePath, status: "added" },
              { filename: "hostile.txt", status: "added" },
            ]
          : [{ filename: this.queuePath, status: "added" }],
        status: "ahead",
        total_commits: 1,
      });
    if (url.pathname === `${root}/git/trees/${TREE}` && method === "GET")
      return jsonResponse({
        tree: [
          {
            mode: "040000",
            path: "submissions",
            sha: SUBMISSIONS_TREE,
            type: "tree",
          },
        ],
        truncated: false,
      });
    if (
      url.pathname === `${root}/git/trees/${SUBMISSIONS_TREE}` &&
      method === "GET"
    )
      return jsonResponse({
        tree: [{ mode: "040000", path: "v1", sha: V1_TREE, type: "tree" }],
        truncated: false,
      });
    if (url.pathname === `${root}/git/trees/${V1_TREE}` && method === "GET")
      return jsonResponse({
        tree: [
          {
            mode: "100644",
            path: this.queuePath.split("/").at(-1),
            sha: BLOB,
            type: "blob",
          },
        ],
        truncated: false,
      });
    if (url.pathname === `${root}/git/blobs/${BLOB}` && method === "GET")
      return jsonResponse({
        content: Buffer.from(this.exactJson).toString("base64"),
        encoding: "base64",
      });
    if (url.pathname === `${root}/pulls` && method === "POST") {
      assert.equal(body.draft, true);
      if (this.pull !== null) return jsonResponse({}, 422);
      this.pull = { head: this.ref ?? COMMIT, state: "open" };
      return jsonResponse({}, 201);
    }
    throw new Error(
      `unhandled fake GitHub request: ${method} ${url.pathname}${url.search}`,
    );
  };
}

function queue(github: FakeGitHub, maxPending = 100): GitHubPrivateQueue {
  return new GitHubPrivateQueue({
    baseBranch: "main",
    credentials: { token: async () => "t".repeat(24) },
    fetch: github.fetch as typeof fetch,
    maxPending,
    owner: github.owner,
    repository: github.repository,
    repositoryId: github.repositoryId,
  });
}

test("one report creates one exact atomic ref and draft PR", async () => {
  const github = new FakeGitHub();
  const submission = await eligibleSubmission();
  assert.equal(
    await queue(github).enqueue(submission, new AbortController().signal),
    "queued",
  );
  assert.equal(github.exactJson, submission.exactJson);
  assert.equal(github.ref, COMMIT);
  assert.equal(github.pull?.head, COMMIT);
  assert.equal(
    github.calls.some(
      ({ method, path }) => method === "PATCH" || path.includes("force"),
    ),
    false,
  );
});

test("a freshly initialized root base commit accepts the first submission", async () => {
  const github = new FakeGitHub();
  github.baseParents = [];
  assert.equal(
    await queue(github).enqueue(
      await eligibleSubmission(),
      new AbortController().signal,
    ),
    "queued",
  );
  assert.equal(github.ref, COMMIT);
  assert.equal(github.pull?.head, COMMIT);
});

test("concurrent enqueue races converge through ref and PR conflicts", async () => {
  const github = new FakeGitHub();
  const submission = await eligibleSubmission();
  const statuses = await Promise.all([
    queue(github).enqueue(submission, new AbortController().signal),
    queue(github).enqueue(submission, new AbortController().signal),
  ]);

  assert.deepEqual(statuses.sort(), ["already-queued", "queued"]);
  assert.equal(github.ref, COMMIT);
  assert.equal(github.pull?.head, COMMIT);
  assert.equal(
    github.calls.filter(
      ({ method, path }) => method === "POST" && path.endsWith("/git/refs"),
    ).length,
    2,
  );
});

test("concurrent distinct submissions cannot exceed the local pending cap", async () => {
  const github = new FakeGitHub();
  const target = queue(github, 1);
  const outcomes = await Promise.allSettled([
    target.enqueue(
      await eligibleSubmission("2026-08-04T00:00:00.000Z"),
      new AbortController().signal,
    ),
    target.enqueue(
      await eligibleSubmission("2026-08-04T00:00:01.000Z"),
      new AbortController().signal,
    ),
  ]);

  assert.equal(
    outcomes.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  assert.equal(
    outcomes.filter(({ status }) => status === "rejected").length,
    1,
  );
  assert.equal(
    github.calls.filter(
      ({ method, path }) => method === "POST" && path.endsWith("/git/refs"),
    ).length,
    1,
  );
  assert.equal(
    github.calls.filter(
      ({ method, path }) =>
        method === "GET" && path.includes("/git/matching-refs/"),
    ).length,
    2,
  );
});

test("open, closed, and deleted-head replays converge without another item", async () => {
  const github = new FakeGitHub();
  const submission = await eligibleSubmission();
  const target = queue(github);
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "queued",
  );
  const creations = () =>
    github.calls.filter(
      ({ method, path }) => method === "POST" && path.endsWith("/git/refs"),
    ).length;
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "already-queued",
  );
  github.pull = { head: COMMIT, state: "closed" };
  github.ref = null;
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "already-queued",
  );
  assert.equal(creations(), 1);
});

test("a partial ref is verified and reconciled only on explicit replay", async () => {
  const github = new FakeGitHub();
  const submission = await eligibleSubmission();
  const target = queue(github);
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "queued",
  );
  github.pull = null;
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "already-queued",
  );
  assert.notEqual(github.pull, null);
});

test("public repository drift and extra-file commits fail closed", async () => {
  const submission = await eligibleSubmission();
  const publicRepo = new FakeGitHub();
  publicRepo.private = false;
  await assert.rejects(
    queue(publicRepo).enqueue(submission, new AbortController().signal),
    /github-queue-unavailable/,
  );
  assert.equal(
    publicRepo.calls.some(({ method }) => method !== "GET"),
    false,
  );

  const corrupt = new FakeGitHub();
  const target = queue(corrupt);
  assert.equal(
    await target.enqueue(submission, new AbortController().signal),
    "queued",
  );
  corrupt.corruptComparison = true;
  await assert.rejects(
    target.enqueue(submission, new AbortController().signal),
    /github-queue-unavailable/,
  );
});

test("the pending queue cap fails before Git object effects", async () => {
  const github = new FakeGitHub();
  github.pending = 1;
  await assert.rejects(
    queue(github, 1).enqueue(
      await eligibleSubmission(),
      new AbortController().signal,
    ),
    /github-queue-unavailable/,
  );
  assert.equal(
    github.calls.some(
      ({ method, path }) => method === "POST" && path.includes("/git/"),
    ),
    false,
  );
});

test("all 100 partial refs are counted toward the pending cap", async () => {
  const github = new FakeGitHub();
  github.partialRefs = 100;
  await assert.rejects(
    queue(github, 100).enqueue(
      await eligibleSubmission(),
      new AbortController().signal,
    ),
    /github-queue-unavailable/,
  );
  assert.equal(
    github.calls.some(
      ({ method, path }) => method === "POST" && path.includes("/git/"),
    ),
    false,
  );
});
