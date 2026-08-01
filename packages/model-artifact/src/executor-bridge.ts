import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import type { Stats } from "node:fs";

import { PINNED_MODEL_CANDIDATE } from "./candidate.js";
import {
  type VerifiedArtifactCapability,
  internalConsumeArtifact,
} from "./capabilities.js";
import { ArtifactError } from "./errors.js";
import {
  assertFileStable,
  assertRootStable,
  hashExactDescriptor,
  openExistingPrivateRoot,
  openRegularPrivateFile,
} from "./filesystem.js";

export interface ArtifactExecutionMaterial {
  readonly canonicalPath: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly engine: "llamacpp-completion";
}

interface ExecutionSnapshot {
  readonly root: Stats;
  readonly file: Stats;
}

const executionSnapshots = new WeakMap<
  ArtifactExecutionMaterial,
  ExecutionSnapshot
>();

function sameSnapshot(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

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

function isMaterialShape(value: unknown): value is ArtifactExecutionMaterial {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["canonicalPath", "byteLength", "sha256", "engine"])
  )
    return false;
  return (
    typeof value.canonicalPath === "string" &&
    value.canonicalPath.length <= 4_096 &&
    isAbsolute(value.canonicalPath) &&
    normalize(value.canonicalPath) === value.canonicalPath &&
    basename(value.canonicalPath) !== "." &&
    basename(value.canonicalPath) !== ".." &&
    Number.isSafeInteger(value.byteLength) &&
    Number(value.byteLength) > 0 &&
    Number(value.byteLength) <= PINNED_MODEL_CANDIDATE.byteLength &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    value.engine === "llamacpp-completion"
  );
}

/** Consume one verified pinned capability into executor-private frozen material. */
export function consumePinnedArtifactForExecutor(
  capability: VerifiedArtifactCapability,
): ArtifactExecutionMaterial {
  try {
    const consumed = internalConsumeArtifact(capability);
    if (
      !isRecord(consumed) ||
      !hasExactKeys(consumed, ["canonicalPath", "candidate"]) ||
      typeof consumed.canonicalPath !== "string" ||
      consumed.candidate !== PINNED_MODEL_CANDIDATE ||
      consumed.canonicalPath !==
        join(
          dirname(consumed.canonicalPath),
          String(consumed.candidate.filename),
        )
    ) {
      throw new ArtifactError("artifact-execution-capability-invalid");
    }
    const material: ArtifactExecutionMaterial = {
      canonicalPath: consumed.canonicalPath,
      byteLength: Number(consumed.candidate.byteLength),
      sha256: String(consumed.candidate.sha256),
      engine: "llamacpp-completion",
    };
    if (!isMaterialShape(material))
      throw new ArtifactError("artifact-execution-capability-invalid");
    return Object.freeze(material);
  } catch {
    throw new ArtifactError("artifact-execution-capability-invalid");
  }
}

/** Child-only, read-only descriptor-safe validation reused before and after QVAC. */
export async function validateArtifactExecutionMaterial(
  value: ArtifactExecutionMaterial,
): Promise<void> {
  let root: Awaited<ReturnType<typeof openExistingPrivateRoot>> | undefined;
  try {
    if (!isMaterialShape(value))
      throw new ArtifactError("artifact-execution-validation-failed");
    const material = value;
    root = await openExistingPrivateRoot(dirname(material.canonicalPath));
    await assertRootStable(root);
    if (
      join(root.canonicalRoot, basename(material.canonicalPath)) !==
      material.canonicalPath
    )
      throw new ArtifactError("artifact-execution-validation-failed");
    const opened = await openRegularPrivateFile(
      material.canonicalPath,
      "artifact-execution-validation-failed",
    );
    try {
      if (opened.snapshot.size !== material.byteLength)
        throw new ArtifactError("artifact-execution-validation-failed");
      const digest = await hashExactDescriptor(
        opened.handle,
        material.byteLength,
        "artifact-execution-validation-failed",
      );
      if (digest !== material.sha256)
        throw new ArtifactError("artifact-execution-validation-failed");
      await assertFileStable(
        material.canonicalPath,
        opened.handle,
        opened.snapshot,
        "artifact-execution-validation-failed",
      );
      await assertRootStable(root);
      const prior = executionSnapshots.get(material);
      if (prior === undefined) {
        executionSnapshots.set(material, {
          root: root.snapshot,
          file: opened.snapshot,
        });
      } else {
        executionSnapshots.delete(material);
        if (
          !sameSnapshot(prior.root, root.snapshot) ||
          !sameSnapshot(prior.file, opened.snapshot)
        ) {
          throw new ArtifactError("artifact-execution-validation-failed");
        }
      }
    } finally {
      await opened.handle.close().catch(() => undefined);
    }
  } catch {
    throw new ArtifactError("artifact-execution-validation-failed");
  } finally {
    await root?.handle.close().catch(() => undefined);
  }
}
