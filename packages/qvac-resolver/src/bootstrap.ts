import { realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SUPPORTED_SDK_VERSION } from "./constants.js";
import { revalidateSdkBootstrap } from "./manifest.js";
import type { SdkBootstrapMessage } from "./launch.js";

export type SdkBootstrapCode =
  | "qvac-bootstrap-unavailable"
  | "qvac-bootstrap-invalid"
  | "qvac-bootstrap-import-failed";

export class SdkBootstrapError extends Error {
  readonly code: SdkBootstrapCode;

  constructor(code: SdkBootstrapCode) {
    super(code);
    this.name = "SdkBootstrapError";
    this.code = code;
  }

  toJSON(): { code: SdkBootstrapCode } {
    return { code: this.code };
  }
}

export interface ReceiveSdkBootstrapOptions {
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBootstrapMessage(value: unknown): value is SdkBootstrapMessage {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = ["entryFileUrl", "sdkRootFileUrl", "sdkVersion", "type"];
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    value["type"] === "qvac-atlas-sdk-bootstrap-v1" &&
    value["sdkVersion"] === SUPPORTED_SDK_VERSION &&
    typeof value["sdkRootFileUrl"] === "string" &&
    typeof value["entryFileUrl"] === "string"
  );
}

function receiveOneMessage(timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off("message", onMessage);
      process.off("disconnect", onDisconnect);
      action();
    };
    const onMessage = (message: unknown): void =>
      finish(() => resolve(message));
    const onDisconnect = (): void =>
      finish(() => reject(new SdkBootstrapError("qvac-bootstrap-unavailable")));
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new SdkBootstrapError("qvac-bootstrap-unavailable")),
        ),
      timeoutMs,
    );
    timer.unref();
    process.once("message", onMessage);
    process.once("disconnect", onDisconnect);
  });
}

/**
 * Child-only bootstrap. It accepts exactly one audited file-URL message,
 * revalidates the package and entry on disk, then imports that exact URL.
 */
export async function receiveSdkBootstrapAndImport(
  options: ReceiveSdkBootstrapOptions = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new SdkBootstrapError("qvac-bootstrap-invalid");
  }

  const message = await receiveOneMessage(timeoutMs);
  if (!isBootstrapMessage(message))
    throw new SdkBootstrapError("qvac-bootstrap-invalid");

  let realSdkRoot: string;
  let realEntry: string;
  try {
    realSdkRoot = await realpath(fileURLToPath(message.sdkRootFileUrl));
    realEntry = await realpath(fileURLToPath(message.entryFileUrl));
    if (
      pathToFileURL(realSdkRoot).href !== message.sdkRootFileUrl ||
      pathToFileURL(realEntry).href !== message.entryFileUrl ||
      !(await revalidateSdkBootstrap(realSdkRoot, realEntry))
    ) {
      throw new SdkBootstrapError("qvac-bootstrap-invalid");
    }
  } catch (error) {
    if (error instanceof SdkBootstrapError) throw error;
    throw new SdkBootstrapError("qvac-bootstrap-invalid");
  }

  try {
    return (await import(pathToFileURL(realEntry).href)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new SdkBootstrapError("qvac-bootstrap-import-failed");
  }
}
