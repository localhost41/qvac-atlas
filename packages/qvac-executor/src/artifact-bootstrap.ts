import { isAbsolute, normalize } from "node:path";

import { PINNED_MODEL_CANDIDATE } from "@qvac-atlas/model-artifact";
import type { ArtifactExecutionMaterial } from "@qvac-atlas/model-artifact/executor-bridge";

const ARTIFACT_BOOTSTRAP_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function isExactSdkBootstrap(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "type",
      "sdkRootFileUrl",
      "entryFileUrl",
      "sdkVersion",
    ]) &&
    value.type === "qvac-atlas-sdk-bootstrap-v1" &&
    value.sdkVersion === "0.16.0" &&
    typeof value.sdkRootFileUrl === "string" &&
    typeof value.entryFileUrl === "string"
  );
}

function parseArtifactBootstrap(
  value: unknown,
): ArtifactExecutionMaterial | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "type",
      "canonicalPath",
      "byteLength",
      "sha256",
      "engine",
    ]) ||
    value.type !== "qvac-atlas-model-artifact-v1" ||
    typeof value.canonicalPath !== "string" ||
    value.canonicalPath.length > 4_096 ||
    !isAbsolute(value.canonicalPath) ||
    normalize(value.canonicalPath) !== value.canonicalPath ||
    !Number.isSafeInteger(value.byteLength) ||
    Number(value.byteLength) < 1 ||
    Number(value.byteLength) > PINNED_MODEL_CANDIDATE.byteLength ||
    typeof value.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    value.engine !== "llamacpp-completion"
  ) {
    return undefined;
  }
  return Object.freeze({
    canonicalPath: value.canonicalPath,
    byteLength: Number(value.byteLength),
    sha256: value.sha256,
    engine: value.engine,
  });
}

/** Install synchronously; ignore the one exact SDK bootstrap and accept one artifact. */
export function receiveArtifactBootstrap(): Promise<ArtifactExecutionMaterial> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sdkIgnored = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off("message", onMessage);
      process.off("disconnect", onDisconnect);
      action();
    };
    const fail = (): void =>
      finish(() => reject(new Error("artifact-bootstrap-invalid")));
    const onMessage = (message: unknown): void => {
      if (!sdkIgnored && isExactSdkBootstrap(message)) {
        sdkIgnored = true;
        return;
      }
      const material = parseArtifactBootstrap(message);
      if (material === undefined) fail();
      else finish(() => resolve(material));
    };
    const onDisconnect = (): void => fail();
    const timer = setTimeout(fail, ARTIFACT_BOOTSTRAP_TIMEOUT_MS);
    timer.unref();
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
  });
}
