import { Buffer } from "node:buffer";

import type { AdmittedSubmission, QueueStatus } from "@qvac-atlas/submission";

import type { GitHubCredentialProvider } from "./github-app.js";
import type { SubmissionQueue } from "./handler.js";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";
const MAX_GITHUB_RESPONSE_BYTES = 262_144;
const SHA = /^[a-f0-9]{40}$/u;

export interface GitHubQueueOptions {
  readonly owner: string;
  readonly repository: string;
  readonly repositoryId: number;
  readonly baseBranch: string;
  readonly maxPending: number;
  readonly credentials: GitHubCredentialProvider;
  readonly fetch?: typeof fetch;
}

class GitHubQueueError extends Error {
  constructor() {
    super("github-queue-unavailable");
    this.name = "GitHubQueueError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sha(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value))
    throw new GitHubQueueError();
  return value;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > MAX_GITHUB_RESPONSE_BYTES)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new GitHubQueueError();
  }
  if (response.body === null) throw new GitHubQueueError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_GITHUB_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GitHubQueueError();
      }
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
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GitHubQueueError();
  }
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== "string") throw new GitHubQueueError();
  const compact = value.replaceAll(/\s/gu, "");
  if (
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      compact,
    )
  ) {
    throw new GitHubQueueError();
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.toString("base64") !== compact) throw new GitHubQueueError();
  return bytes;
}

export class GitHubPrivateQueue implements SubmissionQueue {
  readonly #owner: string;
  readonly #repository: string;
  readonly #repositoryId: number;
  readonly #baseBranch: string;
  readonly #maxPending: number;
  readonly #credentials: GitHubCredentialProvider;
  readonly #fetch: typeof fetch;
  #admissionTail: Promise<void> = Promise.resolve();

  constructor(options: GitHubQueueOptions) {
    this.#owner = options.owner;
    this.#repository = options.repository;
    this.#repositoryId = options.repositoryId;
    this.#baseBranch = options.baseBranch;
    this.#maxPending = options.maxPending;
    this.#credentials = options.credentials;
    this.#fetch = options.fetch ?? fetch;
  }

  #repositoryPath(suffix = ""): string {
    return `/repos/${encodeURIComponent(this.#owner)}/${encodeURIComponent(this.#repository)}${suffix}`;
  }

  async #request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.#credentials.token(signal);
    try {
      return await this.#fetch(`${API_ORIGIN}${path}`, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "qvac-atlas-anonymous-relay/0.1",
          "x-github-api-version": API_VERSION,
          ...init.headers,
        },
        redirect: "error",
        signal,
      });
    } catch {
      throw new GitHubQueueError();
    }
  }

  async #json(
    path: string,
    signal: AbortSignal,
    expectedStatus: number,
    init: RequestInit = {},
  ): Promise<unknown> {
    const response = await this.#request(path, signal, init);
    if (response.status !== expectedStatus) {
      await response.body?.cancel().catch(() => undefined);
      throw new GitHubQueueError();
    }
    return boundedJson(response);
  }

  async verifyReadiness(signal: AbortSignal): Promise<void> {
    const repository = record(
      await this.#json(this.#repositoryPath(), signal, 200),
    );
    const permissions = record(repository?.permissions);
    if (
      repository?.id !== this.#repositoryId ||
      repository.full_name !== `${this.#owner}/${this.#repository}` ||
      repository.private !== true ||
      repository.visibility !== "private" ||
      repository.archived !== false ||
      repository.disabled !== false ||
      repository.default_branch !== this.#baseBranch ||
      permissions?.push !== true
    ) {
      throw new GitHubQueueError();
    }
  }

  async #refSha(branch: string, signal: AbortSignal): Promise<string | null> {
    const response = await this.#request(
      this.#repositoryPath(`/git/ref/heads/${branch}`),
      signal,
    );
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new GitHubQueueError();
    }
    const value = record(await boundedJson(response));
    return sha(record(value?.object)?.sha);
  }

  async #commitObject(
    commitSha: string,
    signal: AbortSignal,
  ): Promise<{ parentShas: string[]; treeSha: string }> {
    const value = record(
      await this.#json(
        this.#repositoryPath(`/git/commits/${commitSha}`),
        signal,
        200,
      ),
    );
    const parents = value?.parents;
    if (!Array.isArray(parents)) throw new GitHubQueueError();
    return {
      parentShas: parents.map((parent) => sha(record(parent)?.sha)),
      treeSha: sha(record(value?.tree)?.sha),
    };
  }

  async #blobText(blobSha: string, signal: AbortSignal): Promise<string> {
    const value = record(
      await this.#json(
        this.#repositoryPath(`/git/blobs/${blobSha}`),
        signal,
        200,
      ),
    );
    if (value?.encoding !== "base64") throw new GitHubQueueError();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        decodeBase64(value?.content),
      );
    } catch {
      throw new GitHubQueueError();
    }
  }

  async #pathBlobSha(
    rootTreeSha: string,
    path: string,
    signal: AbortSignal,
  ): Promise<string> {
    const segments = path.split("/");
    let treeSha = rootTreeSha;
    for (const [index, segment] of segments.entries()) {
      const value = record(
        await this.#json(
          this.#repositoryPath(`/git/trees/${treeSha}`),
          signal,
          200,
        ),
      );
      if (value?.truncated !== false || !Array.isArray(value.tree))
        throw new GitHubQueueError();
      const matches = value.tree.filter(
        (entry) => record(entry)?.path === segment,
      );
      if (matches.length !== 1) throw new GitHubQueueError();
      const entry = record(matches[0]);
      if (entry === null) throw new GitHubQueueError();
      const final = index === segments.length - 1;
      if (
        final
          ? entry?.mode !== "100644" || entry.type !== "blob"
          : entry?.mode !== "040000" || entry.type !== "tree"
      ) {
        throw new GitHubQueueError();
      }
      treeSha = sha(entry.sha);
    }
    return treeSha;
  }

  async #verifyQueueCommit(
    commitSha: string,
    path: string,
    exactJson: string,
    signal: AbortSignal,
  ): Promise<void> {
    const commit = await this.#commitObject(commitSha, signal);
    if (commit.parentShas.length !== 1) throw new GitHubQueueError();
    const parentSha = commit.parentShas[0];
    const comparison = record(
      await this.#json(
        this.#repositoryPath(`/compare/${parentSha}...${commitSha}`),
        signal,
        200,
      ),
    );
    const files = comparison?.files;
    const commits = comparison?.commits;
    if (
      comparison?.status !== "ahead" ||
      comparison.ahead_by !== 1 ||
      comparison.total_commits !== 1 ||
      !Array.isArray(commits) ||
      commits.length !== 1 ||
      record(commits[0])?.sha !== commitSha ||
      !Array.isArray(files) ||
      files.length !== 1 ||
      record(files[0])?.filename !== path ||
      record(files[0])?.status !== "added"
    ) {
      throw new GitHubQueueError();
    }
    const blobSha = await this.#pathBlobSha(commit.treeSha, path, signal);
    if ((await this.#blobText(blobSha, signal)) !== exactJson)
      throw new GitHubQueueError();
  }

  async #baseContains(
    path: string,
    exactJson: string,
    signal: AbortSignal,
    ref = this.#baseBranch,
  ): Promise<boolean> {
    const response = await this.#request(
      `${this.#repositoryPath(`/contents/${path}`)}?ref=${encodeURIComponent(ref)}`,
      signal,
    );
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new GitHubQueueError();
    }
    const value = record(await boundedJson(response));
    if (
      value?.type !== "file" ||
      value.encoding !== "base64" ||
      new TextDecoder("utf-8", { fatal: true }).decode(
        decodeBase64(value.content),
      ) !== exactJson
    ) {
      throw new GitHubQueueError();
    }
    return true;
  }

  async #assertCapacity(signal: AbortSignal): Promise<void> {
    const query = new URLSearchParams({ per_page: "100", state: "open" });
    const pulls = await this.#json(
      `${this.#repositoryPath("/pulls")}?${query}`,
      signal,
      200,
    );
    const refs = await this.#json(
      this.#repositoryPath("/git/matching-refs/heads/atlas-anonymous/"),
      signal,
      200,
    );
    if (!Array.isArray(pulls) || !Array.isArray(refs))
      throw new GitHubQueueError();
    const seenRefs = new Set<string>();
    for (const candidate of refs) {
      const entry = record(candidate);
      const ref = entry?.ref;
      if (
        typeof ref !== "string" ||
        !ref.startsWith("refs/heads/atlas-anonymous/sha256-") ||
        ref.length !== "refs/heads/atlas-anonymous/sha256-".length + 64 ||
        !/^[a-f0-9]+$/u.test(
          ref.slice("refs/heads/atlas-anonymous/sha256-".length),
        ) ||
        seenRefs.has(ref)
      ) {
        throw new GitHubQueueError();
      }
      sha(record(entry?.object)?.sha);
      seenRefs.add(ref);
    }
    if (pulls.length >= this.#maxPending || seenRefs.size >= this.#maxPending) {
      throw new GitHubQueueError();
    }
  }

  async #acquireAdmission(signal: AbortSignal): Promise<() => void> {
    const predecessor = this.#admissionTail;
    let resolveSlot: () => void = () => undefined;
    const slot = new Promise<void>((resolve) => {
      resolveSlot = resolve;
    });
    this.#admissionTail = predecessor.then(() => slot);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      resolveSlot();
    };
    if (signal.aborted) {
      release();
      throw new GitHubQueueError();
    }
    let rejectAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new GitHubQueueError());
      signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try {
      await Promise.race([predecessor, aborted]);
      if (signal.aborted) throw new GitHubQueueError();
      return release;
    } catch {
      release();
      throw new GitHubQueueError();
    } finally {
      if (rejectAbort !== undefined)
        signal.removeEventListener("abort", rejectAbort);
    }
  }

  async #findPullRequest(
    branch: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const query = new URLSearchParams({
      base: this.#baseBranch,
      head: `${this.#owner}:${branch}`,
      per_page: "2",
      state: "all",
    });
    const value = await this.#json(
      `${this.#repositoryPath("/pulls")}?${query}`,
      signal,
      200,
    );
    if (!Array.isArray(value) || value.length > 1) throw new GitHubQueueError();
    if (value.length === 0) return null;
    const pull = record(value[0]);
    const head = record(pull?.head);
    const base = record(pull?.base);
    if (
      head?.ref !== branch ||
      base?.ref !== this.#baseBranch ||
      !["open", "closed"].includes(String(pull?.state))
    ) {
      throw new GitHubQueueError();
    }
    return sha(head.sha);
  }

  async #createObject(
    endpoint: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<string> {
    const value = record(
      await this.#json(this.#repositoryPath(endpoint), signal, 201, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    return sha(value?.sha);
  }

  async #createQueueCommit(
    baseSha: string,
    path: string,
    submission: AdmittedSubmission,
    signal: AbortSignal,
  ): Promise<string> {
    const base = await this.#commitObject(baseSha, signal);
    const blobSha = await this.#createObject(
      "/git/blobs",
      { content: submission.exactJson, encoding: "utf-8" },
      signal,
    );
    const treeSha = await this.#createObject(
      "/git/trees",
      {
        base_tree: base.treeSha,
        tree: [{ mode: "100644", path, sha: blobSha, type: "blob" }],
      },
      signal,
    );
    return this.#createObject(
      "/git/commits",
      {
        message: `Queue anonymous Atlas report ${submission.reportId}`,
        parents: [baseSha],
        tree: treeSha,
      },
      signal,
    );
  }

  async #createRef(
    branch: string,
    commitSha: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    const response = await this.#request(
      this.#repositoryPath("/git/refs"),
      signal,
      {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: commitSha,
        }),
      },
    );
    if (response.status === 201) {
      await response.body?.cancel().catch(() => undefined);
      return true;
    }
    if (response.status === 422) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    await response.body?.cancel().catch(() => undefined);
    throw new GitHubQueueError();
  }

  async #createPullRequest(
    branch: string,
    submission: AdmittedSubmission,
    signal: AbortSignal,
  ): Promise<boolean> {
    const response = await this.#request(
      this.#repositoryPath("/pulls"),
      signal,
      {
        method: "POST",
        body: JSON.stringify({
          base: this.#baseBranch,
          body: [
            "Anonymous QVAC Atlas queue item.",
            "",
            "This is private intake, not public evidence admission.",
            "Validate and review before promotion; do not infer source independence.",
          ].join("\n"),
          draft: true,
          head: branch,
          title: `Anonymous Atlas report ${submission.digest.slice(0, 12)}`,
        }),
      },
    );
    if (response.status === 201) {
      await response.body?.cancel().catch(() => undefined);
      return true;
    }
    if (response.status === 422) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    await response.body?.cancel().catch(() => undefined);
    throw new GitHubQueueError();
  }

  async #enqueueUnderAdmissionLock(
    submission: AdmittedSubmission,
    signal: AbortSignal,
  ): Promise<QueueStatus> {
    await this.verifyReadiness(signal);
    const branch = `atlas-anonymous/sha256-${submission.digest}`;
    const path = `submissions/v1/sha256-${submission.digest}.json`;

    if (await this.#baseContains(path, submission.exactJson, signal))
      return "already-queued";

    const existingPull = await this.#findPullRequest(branch, signal);
    if (existingPull !== null) {
      await this.#verifyQueueCommit(
        existingPull,
        path,
        submission.exactJson,
        signal,
      );
      return "already-queued";
    }

    let existingRef = await this.#refSha(branch, signal);
    let refCreated = false;
    if (existingRef === null) {
      await this.#assertCapacity(signal);
      const baseSha = await this.#refSha(this.#baseBranch, signal);
      if (baseSha === null) throw new GitHubQueueError();
      if (
        await this.#baseContains(path, submission.exactJson, signal, baseSha)
      ) {
        return "already-queued";
      }
      const commitSha = await this.#createQueueCommit(
        baseSha,
        path,
        submission,
        signal,
      );
      refCreated = await this.#createRef(branch, commitSha, signal);
      existingRef = refCreated ? commitSha : await this.#refSha(branch, signal);
      if (existingRef === null) throw new GitHubQueueError();
    }
    await this.#verifyQueueCommit(
      existingRef,
      path,
      submission.exactJson,
      signal,
    );

    const racedPull = await this.#findPullRequest(branch, signal);
    if (racedPull !== null) {
      await this.#verifyQueueCommit(
        racedPull,
        path,
        submission.exactJson,
        signal,
      );
      return "already-queued";
    }
    if (!(await this.#createPullRequest(branch, submission, signal))) {
      const finalPull = await this.#findPullRequest(branch, signal);
      if (finalPull === null) throw new GitHubQueueError();
      await this.#verifyQueueCommit(
        finalPull,
        path,
        submission.exactJson,
        signal,
      );
      return "already-queued";
    }
    return refCreated ? "queued" : "already-queued";
  }

  async enqueue(
    submission: AdmittedSubmission,
    signal: AbortSignal,
  ): Promise<QueueStatus> {
    const release = await this.#acquireAdmission(signal);
    try {
      return await this.#enqueueUnderAdmissionLock(submission, signal);
    } finally {
      release();
    }
  }
}
