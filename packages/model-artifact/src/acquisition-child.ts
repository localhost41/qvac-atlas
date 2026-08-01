import { isAbsolute, normalize } from "node:path";
import { PINNED_MODEL_CANDIDATE } from "./candidate.js";
import { internalIssueConsent } from "./capabilities.js";
import { ArtifactError, type ArtifactErrorCode } from "./errors.js";
import { internalAcquireArtifact } from "./service.js";

const NETWORK_POLICY = "official-huggingface-finite-v1";
const NONCE_PATTERN = /^[0-9a-f]{48}$/;

interface AcquisitionRequest {
  readonly privateRoot: string;
  readonly sessionNonce: string;
  readonly timeoutMs: number;
  readonly networkPolicy: typeof NETWORK_POLICY;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function validRequest(value: unknown): value is AcquisitionRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    !exactKeys(value, [
      "networkPolicy",
      "privateRoot",
      "sessionNonce",
      "timeoutMs",
    ])
  ) {
    return false;
  }
  const request = value as Record<string, unknown>;
  return (
    typeof request.privateRoot === "string" &&
    request.privateRoot.length <= 4_096 &&
    isAbsolute(request.privateRoot) &&
    normalize(request.privateRoot) === request.privateRoot &&
    typeof request.sessionNonce === "string" &&
    NONCE_PATTERN.test(request.sessionNonce) &&
    Number.isSafeInteger(request.timeoutMs) &&
    Number(request.timeoutMs) >= 1 &&
    Number(request.timeoutMs) <= 60 * 60 * 1_000 &&
    request.networkPolicy === NETWORK_POLICY
  );
}

function send(message: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.send === undefined || !process.connected) {
      reject(new Error("ipc-unavailable"));
      return;
    }
    process.send(message, (error) =>
      error === null ? resolve() : reject(error),
    );
  });
}

async function run(request: AcquisitionRequest): Promise<void> {
  const controller = new AbortController();
  activeController = controller;
  process.once("SIGTERM", () => controller.abort());
  await send({ kind: "state", token: "accepted" });
  let cache: "hit" | "miss" | undefined;
  const consent = internalIssueConsent({
    candidateId: PINNED_MODEL_CANDIDATE.id,
    privateRoot: request.privateRoot,
  });
  await internalAcquireArtifact({
    privateRoot: request.privateRoot,
    consent,
    candidate: PINNED_MODEL_CANDIDATE,
    sessionNonce: request.sessionNonce,
    enforceCapacity: true,
    timeoutMs: request.timeoutMs,
    signal: controller.signal,
    byteSource: async (context) =>
      (await import("./service.js")).internalPinnedHttpsByteSource(context),
    hooks: {
      afterCacheCheck: async (hit) => {
        cache = hit ? "hit" : "miss";
        await send({ kind: "state", token: hit ? "cache-hit" : "cache-miss" });
      },
      afterCapacityCheck: async () => {
        await send({ kind: "state", token: "capacity-ok" });
      },
      afterStagingOpen: async () => {
        await send({ kind: "state", token: "staging-open" });
      },
      afterHardLink: async () => {
        await send({ kind: "state", token: "hard-linked" });
      },
      afterStagingUnlink: async () => {
        await send({ kind: "state", token: "staging-unlinked" });
      },
      afterDirectorySync: async () => {
        await send({ kind: "state", token: "directory-synced" });
      },
    },
  });
  if (cache === undefined) throw new ArtifactError("artifact-worker-failed");
  await send({ kind: "state", token: "ready" });
  await send({ kind: "result", status: "success", cache });
}

let received = false;
let completed = false;
let activeController: AbortController | undefined;
process.on("message", (message: unknown) => {
  if (received || !validRequest(message)) {
    void send({
      kind: "result",
      status: "error",
      code: "artifact-worker-protocol-invalid",
    }).finally(() => {
      completed = true;
      process.exit(1);
    });
    return;
  }
  received = true;
  void run(message)
    .then(() => {
      completed = true;
      process.disconnect?.();
    })
    .catch(async (error: unknown) => {
      const code: ArtifactErrorCode =
        error instanceof ArtifactError ? error.code : "artifact-worker-failed";
      await send({ kind: "result", status: "error", code }).catch(
        () => undefined,
      );
      process.exitCode = 1;
      completed = true;
      process.disconnect?.();
    });
});

process.once("disconnect", () => {
  if (completed) return;
  activeController?.abort();
  setTimeout(() => process.exit(1), 250);
});
