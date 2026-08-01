const TEST_GRANT_TOKEN = Symbol("qvac-atlas-test-model-grant");
const issuedGrants = new WeakSet<QvacModelExecutionGrant>();
const consumedGrants = new WeakSet<QvacModelExecutionGrant>();
let issueSyntheticGrant: (() => QvacModelExecutionGrant) | undefined;

/**
 * A deliberately opaque proof that a caller authorized the pinned workload.
 * ATLAS-016A has no production issuer: only the internal synthetic-test entry
 * point can create one.
 */
export class QvacModelExecutionGrant {
  private constructor(token: symbol) {
    if (token !== TEST_GRANT_TOKEN) throw new TypeError("invalid-model-grant");
    issuedGrants.add(this);
    Object.freeze(this);
  }

  toJSON(): undefined {
    return undefined;
  }

  static {
    issueSyntheticGrant = () => new QvacModelExecutionGrant(TEST_GRANT_TOKEN);
  }
}

export function internalIssueSyntheticModelGrant(): QvacModelExecutionGrant {
  if (issueSyntheticGrant === undefined)
    throw new TypeError("grant-issuer-unavailable");
  return issueSyntheticGrant();
}

export function internalConsumeIssuedModelGrant(
  value: QvacModelExecutionGrant,
): boolean {
  if (!issuedGrants.has(value) || consumedGrants.has(value)) return false;
  consumedGrants.add(value);
  return true;
}
