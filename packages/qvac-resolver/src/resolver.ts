import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { SDK_PACKAGE_NAME, SUPPORTED_NODE_MAJOR } from "./constants.js";
import {
  isAccessible,
  isPathContained,
  readBoundedJson,
  requireRealDirectory,
} from "./filesystem.js";
import { createResolvedSdkHandle, type ResolvedSdkHandle } from "./handle.js";
import { hasDirectSdkDeclaration, inspectSdkAtRoot } from "./manifest.js";

export type SdkResolutionCode =
  | "qvac-sdk-resolved"
  | "qvac-sdk-absent"
  | "qvac-sdk-version-unsupported"
  | "qvac-sdk-unsafe-or-invalid"
  | "node-version-unsupported";

export type SdkResolutionResult =
  | {
      status: "resolved";
      code: "qvac-sdk-resolved";
      sdkVersion: "0.16.0";
      handle: ResolvedSdkHandle;
    }
  | {
      status: "absent";
      code: "qvac-sdk-absent";
    }
  | {
      status: "unsupported";
      code: "qvac-sdk-version-unsupported";
      sdkVersion: string;
    }
  | {
      status: "unsupported";
      code: "node-version-unsupported";
      nodeMajor: number | null;
    }
  | {
      status: "unsafe-or-invalid";
      code: "qvac-sdk-unsafe-or-invalid";
    };

function currentNodeMajor(): number | null {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  return Number.isSafeInteger(major) ? major : null;
}

function result<T extends SdkResolutionResult>(value: T): T {
  return Object.freeze(value);
}

/**
 * Resolve only an exact physical dependency below the selected project root.
 * This function never invokes Node bare-specifier resolution or a package
 * manager and never imports contributor code.
 */
export async function resolveProjectLocalSdk(
  projectRoot: string,
): Promise<SdkResolutionResult> {
  const nodeMajor = currentNodeMajor();
  if (nodeMajor !== SUPPORTED_NODE_MAJOR) {
    return result({
      status: "unsupported",
      code: "node-version-unsupported",
      nodeMajor,
    });
  }

  try {
    if (typeof projectRoot !== "string" || projectRoot.length === 0) {
      return result({
        status: "unsafe-or-invalid",
        code: "qvac-sdk-unsafe-or-invalid",
      });
    }

    const realProjectRoot = await requireRealDirectory(projectRoot);
    const projectManifest = await readBoundedJson(
      path.join(realProjectRoot, "package.json"),
    );
    if (!hasDirectSdkDeclaration(projectManifest)) {
      return result({ status: "absent", code: "qvac-sdk-absent" });
    }

    const logicalSdkRoot = path.join(
      realProjectRoot,
      "node_modules",
      ...SDK_PACKAGE_NAME.split("/"),
    );
    if (!(await isAccessible(logicalSdkRoot))) {
      const hasPnpLayout =
        (await isAccessible(path.join(realProjectRoot, ".pnp.cjs"))) ||
        (await isAccessible(path.join(realProjectRoot, ".pnp.loader.mjs")));
      return hasPnpLayout
        ? result({
            status: "unsafe-or-invalid",
            code: "qvac-sdk-unsafe-or-invalid",
          })
        : result({ status: "absent", code: "qvac-sdk-absent" });
    }

    const sdkLinkMetadata = await lstat(logicalSdkRoot);
    if (!sdkLinkMetadata.isDirectory() && !sdkLinkMetadata.isSymbolicLink()) {
      return result({
        status: "unsafe-or-invalid",
        code: "qvac-sdk-unsafe-or-invalid",
      });
    }

    const realSdkRoot = await realpath(logicalSdkRoot);
    if (
      realSdkRoot === realProjectRoot ||
      !isPathContained(realProjectRoot, realSdkRoot)
    ) {
      return result({
        status: "unsafe-or-invalid",
        code: "qvac-sdk-unsafe-or-invalid",
      });
    }

    const sdkMetadata = await lstat(realSdkRoot);
    if (!sdkMetadata.isDirectory()) {
      return result({
        status: "unsafe-or-invalid",
        code: "qvac-sdk-unsafe-or-invalid",
      });
    }

    const inspection = await inspectSdkAtRoot(realSdkRoot);
    if (inspection.kind === "unsupported-version") {
      return result({
        status: "unsupported",
        code: "qvac-sdk-version-unsupported",
        sdkVersion: inspection.version,
      });
    }
    if (inspection.kind !== "supported") {
      return result({
        status: "unsafe-or-invalid",
        code: "qvac-sdk-unsafe-or-invalid",
      });
    }

    return result({
      status: "resolved",
      code: "qvac-sdk-resolved",
      sdkVersion: inspection.version,
      handle: createResolvedSdkHandle({
        projectRoot: realProjectRoot,
        sdkRoot: realSdkRoot,
        entryPath: inspection.entryPath,
        sdkVersion: inspection.version,
      }),
    });
  } catch {
    return result({
      status: "unsafe-or-invalid",
      code: "qvac-sdk-unsafe-or-invalid",
    });
  }
}
