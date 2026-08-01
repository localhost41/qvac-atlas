const HANDLE_TOKEN = Symbol("qvac-atlas-resolved-sdk");

export interface InternalSdkBootstrapMaterial {
  projectRoot: string;
  sdkRoot: string;
  entryPath: string;
  sdkVersion: string;
}

const materialByHandle = new WeakMap<
  ResolvedSdkHandle,
  InternalSdkBootstrapMaterial
>();

/**
 * An intentionally opaque capability proving that the resolver accepted one
 * exact SDK installation. Its path material is neither enumerable nor JSON
 * serializable.
 */
export class ResolvedSdkHandle {
  constructor(token: symbol, material: InternalSdkBootstrapMaterial) {
    if (token !== HANDLE_TOKEN)
      throw new TypeError("ResolvedSdkHandle cannot be constructed");
    materialByHandle.set(this, Object.freeze({ ...material }));
    Object.freeze(this);
  }

  get sdkVersion(): string {
    return requireMaterial(this).sdkVersion;
  }

  toJSON(): undefined {
    return undefined;
  }
}

function requireMaterial(
  handle: ResolvedSdkHandle,
): InternalSdkBootstrapMaterial {
  const material = materialByHandle.get(handle);
  if (!material) throw new TypeError("Invalid ResolvedSdkHandle");
  return material;
}

export function createResolvedSdkHandle(
  material: InternalSdkBootstrapMaterial,
): ResolvedSdkHandle {
  return new ResolvedSdkHandle(HANDLE_TOKEN, material);
}

/**
 * Internal execution boundary. This is the only API that deliberately reveals
 * audited absolute paths. Never pass its return value to report construction.
 */
export function internalGetSdkBootstrapMaterial(
  handle: ResolvedSdkHandle,
): Readonly<InternalSdkBootstrapMaterial> {
  return requireMaterial(handle);
}
