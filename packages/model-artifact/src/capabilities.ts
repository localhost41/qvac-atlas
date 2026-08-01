import type { ModelArtifactCandidate } from "./candidate.js";

const CONSENT_TOKEN = Symbol("atlas-artifact-consent");
const ARTIFACT_TOKEN = Symbol("atlas-verified-artifact");

interface ConsentMaterial {
  readonly candidateId: string;
  readonly privateRoot: string;
}

interface ArtifactMaterial {
  readonly canonicalPath: string;
  readonly candidate: ModelArtifactCandidate;
}

const consentMaterial = new WeakMap<
  ArtifactAcquisitionConsent,
  ConsentMaterial
>();
const consumedConsent = new WeakSet<ArtifactAcquisitionConsent>();
const artifactMaterial = new WeakMap<
  VerifiedArtifactCapability,
  ArtifactMaterial
>();
const consumedArtifacts = new WeakSet<VerifiedArtifactCapability>();

let issueConsent:
  ((material: ConsentMaterial) => ArtifactAcquisitionConsent) | undefined;
let issueArtifact:
  ((material: ArtifactMaterial) => VerifiedArtifactCapability) | undefined;

/** Opaque, non-serializable and single-use authorization to acquire one candidate. */
export class ArtifactAcquisitionConsent {
  private constructor(token: symbol, material: ConsentMaterial) {
    if (token !== CONSENT_TOKEN)
      throw new TypeError("invalid-artifact-consent");
    consentMaterial.set(this, material);
    Object.freeze(this);
  }

  toJSON(): undefined {
    return undefined;
  }

  static {
    issueConsent = (material) =>
      new ArtifactAcquisitionConsent(CONSENT_TOKEN, material);
  }
}

/** Opaque proof of a fully verified local artifact. */
export class VerifiedArtifactCapability {
  private constructor(token: symbol, material: ArtifactMaterial) {
    if (token !== ARTIFACT_TOKEN)
      throw new TypeError("invalid-artifact-capability");
    artifactMaterial.set(this, material);
    Object.freeze(this);
  }

  toJSON(): undefined {
    return undefined;
  }

  static {
    issueArtifact = (material) =>
      new VerifiedArtifactCapability(ARTIFACT_TOKEN, material);
  }
}

export function internalIssueConsent(
  material: ConsentMaterial,
): ArtifactAcquisitionConsent {
  if (issueConsent === undefined)
    throw new TypeError("consent-issuer-unavailable");
  return issueConsent(Object.freeze({ ...material }));
}

export function internalConsumeConsent(
  value: unknown,
  expected: ConsentMaterial,
): value is ArtifactAcquisitionConsent {
  if (!(value instanceof ArtifactAcquisitionConsent)) return false;
  const material = consentMaterial.get(value);
  if (
    material === undefined ||
    consumedConsent.has(value) ||
    material.candidateId !== expected.candidateId ||
    material.privateRoot !== expected.privateRoot
  ) {
    return false;
  }
  consumedConsent.add(value);
  return true;
}

export function internalIssueArtifact(
  material: ArtifactMaterial,
): VerifiedArtifactCapability {
  if (issueArtifact === undefined)
    throw new TypeError("artifact-issuer-unavailable");
  return issueArtifact(Object.freeze({ ...material }));
}

export function internalInspectArtifact(
  value: unknown,
): ArtifactMaterial | undefined {
  return value instanceof VerifiedArtifactCapability
    ? artifactMaterial.get(value)
    : undefined;
}

export function internalConsumeArtifact(
  value: unknown,
): ArtifactMaterial | undefined {
  if (!(value instanceof VerifiedArtifactCapability)) return undefined;
  const material = artifactMaterial.get(value);
  if (material === undefined || consumedArtifacts.has(value)) return undefined;
  consumedArtifacts.add(value);
  return material;
}
