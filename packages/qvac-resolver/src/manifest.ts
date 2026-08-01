import path from "node:path";

import {
  DEPENDENCY_SECTIONS,
  SDK_LICENSE,
  SDK_MAIN_ENTRY,
  SDK_PACKAGE_EXPORT,
  SDK_PACKAGE_NAME,
  SUPPORTED_SDK_VERSION,
} from "./constants.js";
import {
  isPathContained,
  readBoundedJson,
  requireContainedRegularEntry,
  UnsafeFilesystemShapeError,
} from "./filesystem.js";

export type SdkManifestInspection =
  | {
      kind: "supported";
      version: typeof SUPPORTED_SDK_VERSION;
      entryPath: string;
    }
  | { kind: "unsupported-version"; version: string }
  | { kind: "invalid" };

const STRICT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasDirectSdkDeclaration(
  projectManifest: Record<string, unknown>,
): boolean {
  for (const sectionName of DEPENDENCY_SECTIONS) {
    const section = projectManifest[sectionName];
    if (section === undefined) continue;
    if (!isRecord(section)) throw new UnsafeFilesystemShapeError();
    if (!Object.hasOwn(section, SDK_PACKAGE_NAME)) continue;
    const declared = section[SDK_PACKAGE_NAME];
    if (typeof declared !== "string" || declared.trim().length === 0) {
      throw new UnsafeFilesystemShapeError();
    }
    return true;
  }
  return false;
}

function validateSupportedFingerprint(
  manifest: Record<string, unknown>,
): boolean {
  if (
    manifest["name"] !== SDK_PACKAGE_NAME ||
    manifest["type"] !== "module" ||
    manifest["main"] !== SDK_MAIN_ENTRY ||
    manifest["license"] !== SDK_LICENSE
  ) {
    return false;
  }

  const packageExports = manifest["exports"];
  if (!isRecord(packageExports)) return false;
  const rootExport = packageExports["."];
  if (!isRecord(rootExport)) return false;

  return (
    rootExport["import"] === SDK_MAIN_ENTRY &&
    rootExport["require"] === SDK_MAIN_ENTRY &&
    packageExports["./package"] === SDK_PACKAGE_EXPORT
  );
}

export async function inspectSdkAtRoot(
  sdkRoot: string,
): Promise<SdkManifestInspection> {
  try {
    const manifestPath = path.join(sdkRoot, "package.json");
    const manifest = await readBoundedJson(manifestPath);
    if (manifest["name"] !== SDK_PACKAGE_NAME) return { kind: "invalid" };

    const version = manifest["version"];
    if (
      typeof version !== "string" ||
      version.length > 64 ||
      !STRICT_SEMVER.test(version)
    ) {
      return { kind: "invalid" };
    }
    if (version !== SUPPORTED_SDK_VERSION) {
      return { kind: "unsupported-version", version };
    }
    if (!validateSupportedFingerprint(manifest)) return { kind: "invalid" };

    const entryPath = await requireContainedRegularEntry(
      sdkRoot,
      SDK_MAIN_ENTRY,
    );
    return { kind: "supported", version: SUPPORTED_SDK_VERSION, entryPath };
  } catch {
    return { kind: "invalid" };
  }
}

export async function revalidateSdkBootstrap(
  sdkRoot: string,
  expectedEntry: string,
): Promise<boolean> {
  if (!path.isAbsolute(sdkRoot) || !path.isAbsolute(expectedEntry))
    return false;
  if (!isPathContained(sdkRoot, expectedEntry) || expectedEntry === sdkRoot)
    return false;

  const inspection = await inspectSdkAtRoot(sdkRoot);
  return (
    inspection.kind === "supported" && inspection.entryPath === expectedEntry
  );
}
