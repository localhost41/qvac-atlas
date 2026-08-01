import { userInfo } from "node:os";
import { join } from "node:path";
import {
  PINNED_MODEL_CANDIDATE,
  createPinnedArtifactDisclosure,
  type ArtifactDisclosure,
} from "./candidate.js";
import {
  type VerifiedArtifactCapability,
  internalConsumeConsent,
  internalIssueConsent,
} from "./capabilities.js";
import {
  internalFreshSessionNonce,
  internalRunAcquisitionSupervisor,
} from "./contained-internal.js";
import { ArtifactError } from "./errors.js";

const CONTAINED_TIMEOUT_MS = 30 * 60 * 1_000;

export interface ContainedPinnedArtifactOptions {
  readonly signal?: AbortSignal;
  readonly decide: (
    disclosure: ArtifactDisclosure,
  ) => boolean | Promise<boolean>;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Performs one disclosure-bound decision and one fully contained acquisition.
 * No consent token, runner choice, source response, path result, or cleanup
 * primitive crosses this API.
 */
export async function acquireContainedPinnedArtifact(
  options: ContainedPinnedArtifactOptions,
): Promise<VerifiedArtifactCapability> {
  let privateRoot: string;
  let signal: AbortSignal | undefined;
  let decide: ContainedPinnedArtifactOptions["decide"];
  try {
    privateRoot = join(userInfo().homedir, ".qvac-atlas-models");
    signal = options.signal;
    decide = options.decide;
    if (
      (signal !== undefined && !(signal instanceof AbortSignal)) ||
      typeof decide !== "function"
    ) {
      throw new ArtifactError("artifact-request-invalid");
    }
  } catch {
    throw new ArtifactError("artifact-request-invalid");
  }
  const disclosure = createPinnedArtifactDisclosure(privateRoot);
  if (isAborted(signal)) {
    throw new ArtifactError("artifact-acquisition-aborted");
  }
  let approved: boolean;
  try {
    approved = (await decide(disclosure)) === true;
  } catch {
    throw new ArtifactError("artifact-consent-required");
  }
  if (!approved) throw new ArtifactError("artifact-consent-required");
  if (isAborted(signal)) {
    throw new ArtifactError("artifact-acquisition-aborted");
  }
  let sessionNonce: string;
  try {
    const consent = internalIssueConsent({
      candidateId: disclosure.candidate.id,
      privateRoot,
    });
    if (
      !internalConsumeConsent(consent, {
        candidateId: PINNED_MODEL_CANDIDATE.id,
        privateRoot,
      })
    ) {
      throw new ArtifactError("artifact-consent-required");
    }
    sessionNonce = internalFreshSessionNonce();
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError("artifact-worker-failed");
  }
  return internalRunAcquisitionSupervisor({
    privateRoot,
    sessionNonce,
    timeoutMs: CONTAINED_TIMEOUT_MS,
    signal,
  });
}
