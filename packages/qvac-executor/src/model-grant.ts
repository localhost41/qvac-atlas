import {
  consumePinnedArtifactForExecutor,
  type ArtifactExecutionMaterial,
} from "@qvac-atlas/model-artifact/executor-bridge";
import type { VerifiedArtifactCapability } from "@qvac-atlas/model-artifact";

const GRANT_TOKEN = Symbol("qvac-atlas-model-execution-grant");
const issuedGrants = new WeakMap<
  QvacModelExecutionGrant,
  ArtifactExecutionMaterial
>();
const consumedGrants = new WeakSet<QvacModelExecutionGrant>();
let issueGrant:
  | ((material: ArtifactExecutionMaterial) => QvacModelExecutionGrant)
  | undefined;

/** Opaque, non-serializable and single-use proof for one verified artifact. */
export class QvacModelExecutionGrant {
  private constructor(token: symbol, material: ArtifactExecutionMaterial) {
    if (token !== GRANT_TOKEN) throw new TypeError("invalid-model-grant");
    issuedGrants.set(this, material);
    Object.freeze(this);
  }

  toJSON(): undefined {
    return undefined;
  }

  static {
    issueGrant = (material) =>
      new QvacModelExecutionGrant(GRANT_TOKEN, material);
  }
}

/** Consume a verified pinned artifact immediately into an opaque executor grant. */
export function createQvacModelExecutionGrant(
  capability: VerifiedArtifactCapability,
): QvacModelExecutionGrant {
  const material = consumePinnedArtifactForExecutor(capability);
  if (issueGrant === undefined) throw new TypeError("grant-issuer-unavailable");
  return issueGrant(material);
}

export function internalIssueSyntheticModelGrant(
  material: ArtifactExecutionMaterial,
): QvacModelExecutionGrant {
  if (issueGrant === undefined) throw new TypeError("grant-issuer-unavailable");
  return issueGrant(
    Object.freeze({
      canonicalPath: material.canonicalPath,
      byteLength: material.byteLength,
      sha256: material.sha256,
      engine: material.engine,
    }),
  );
}

export function internalConsumeIssuedModelGrant(
  value: QvacModelExecutionGrant,
): ArtifactExecutionMaterial | undefined {
  if (consumedGrants.has(value)) return undefined;
  const material = issuedGrants.get(value);
  if (material === undefined) return undefined;
  consumedGrants.add(value);
  return material;
}
