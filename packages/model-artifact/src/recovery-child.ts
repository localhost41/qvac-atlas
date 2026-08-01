import { isAbsolute, normalize } from "node:path";
import { internalRecoverOwnedStaging } from "./recovery.js";

interface RecoveryRequest {
  readonly privateRoot: string;
  readonly sessionNonce: string;
}

function validRequest(value: unknown): value is RecoveryRequest {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "privateRoot,sessionNonce") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.privateRoot === "string" &&
    request.privateRoot.length <= 4_096 &&
    isAbsolute(request.privateRoot) &&
    normalize(request.privateRoot) === request.privateRoot &&
    typeof request.sessionNonce === "string" &&
    /^[0-9a-f]{48}$/.test(request.sessionNonce)
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

let received = false;
let completed = false;
process.on("message", (message: unknown) => {
  if (received || !validRequest(message)) {
    void send({ kind: "result", status: "error" }).finally(() => {
      completed = true;
      process.exit(1);
    });
    return;
  }
  received = true;
  void internalRecoverOwnedStaging(message)
    .then(async () => {
      await send({ kind: "result", status: "success" });
      completed = true;
      process.disconnect?.();
    })
    .catch(async () => {
      await send({ kind: "result", status: "error" }).catch(() => undefined);
      process.exitCode = 1;
      completed = true;
      process.disconnect?.();
    });
});

process.once("disconnect", () => {
  if (!completed) process.exit(1);
});
