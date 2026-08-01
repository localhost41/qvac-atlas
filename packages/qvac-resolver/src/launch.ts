import { fork, type ChildProcess } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  INHERITED_ENV_ALLOWLIST,
  QVAC_CONFIG_CANDIDATES,
} from "./constants.js";
import { isAccessible, requireRealDirectory } from "./filesystem.js";
import {
  internalGetSdkBootstrapMaterial,
  type ResolvedSdkHandle,
} from "./handle.js";

export type SdkChildLaunchCode =
  | "qvac-child-runner-invalid"
  | "qvac-child-cwd-unsafe"
  | "qvac-child-launch-failed";

export class SdkChildLaunchError extends Error {
  readonly code: SdkChildLaunchCode;

  constructor(code: SdkChildLaunchCode) {
    super(code);
    this.name = "SdkChildLaunchError";
    this.code = code;
  }

  toJSON(): { code: SdkChildLaunchCode } {
    return { code: this.code };
  }
}

export interface LaunchResolvedSdkChildOptions {
  handle: ResolvedSdkHandle;
  runnerPath: string;
  tempCwd: string;
  sourceEnv?: NodeJS.ProcessEnv;
}

export interface SdkBootstrapMessage {
  type: "qvac-atlas-sdk-bootstrap-v1";
  sdkRootFileUrl: string;
  entryFileUrl: string;
  sdkVersion: string;
}

export function createSanitizedChildEnvironment(
  sourceEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = Object.create(null) as NodeJS.ProcessEnv;
  for (const name of INHERITED_ENV_ALLOWLIST) {
    const value = sourceEnv[name];
    if (typeof value === "string") sanitized[name] = value;
  }
  return sanitized;
}

async function requireRegularRunner(runnerPath: string): Promise<string> {
  try {
    if (!path.isAbsolute(runnerPath)) {
      throw new SdkChildLaunchError("qvac-child-runner-invalid");
    }
    const linkMetadata = await lstat(runnerPath);
    if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
      throw new SdkChildLaunchError("qvac-child-runner-invalid");
    }
    return await realpath(runnerPath);
  } catch {
    throw new SdkChildLaunchError("qvac-child-runner-invalid");
  }
}

async function hasUnsafeCwdArtifact(directory: string): Promise<boolean> {
  if (await isAccessible(path.join(directory, "package.json"))) return true;
  for (const candidate of QVAC_CONFIG_CANDIDATES) {
    if (await isAccessible(path.join(directory, candidate))) return true;
  }
  return isAccessible(path.join(directory, "qvac", "worker.entry.mjs"));
}

async function requireCleanTemporaryCwd(tempCwd: string): Promise<string> {
  try {
    if (!path.isAbsolute(tempCwd)) {
      throw new SdkChildLaunchError("qvac-child-cwd-unsafe");
    }
    const linkMetadata = await lstat(tempCwd);
    if (linkMetadata.isSymbolicLink() || !linkMetadata.isDirectory()) {
      throw new SdkChildLaunchError("qvac-child-cwd-unsafe");
    }
    const realTempCwd = await requireRealDirectory(tempCwd);

    let cursor = realTempCwd;
    for (;;) {
      if (await hasUnsafeCwdArtifact(cursor)) {
        throw new SdkChildLaunchError("qvac-child-cwd-unsafe");
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    return realTempCwd;
  } catch {
    throw new SdkChildLaunchError("qvac-child-cwd-unsafe");
  }
}

/**
 * Launch a pre-audited runner with no inherited loader/config hooks. The SDK
 * location is transmitted after spawn over the private IPC channel, never in
 * argv or the environment.
 */
export async function launchResolvedSdkChild(
  options: LaunchResolvedSdkChildOptions,
): Promise<ChildProcess> {
  try {
    const runnerPath = await requireRegularRunner(options.runnerPath);
    const tempCwd = await requireCleanTemporaryCwd(options.tempCwd);
    const material = internalGetSdkBootstrapMaterial(options.handle);
    const message: SdkBootstrapMessage = {
      type: "qvac-atlas-sdk-bootstrap-v1",
      sdkRootFileUrl: pathToFileURL(material.sdkRoot).href,
      entryFileUrl: pathToFileURL(material.entryPath).href,
      sdkVersion: material.sdkVersion,
    };

    const child = fork(runnerPath, [], {
      cwd: tempCwd,
      env: createSanitizedChildEnvironment(options.sourceEnv),
      execArgv: [],
      serialization: "json",
      silent: true,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.send(message, (error) => {
          if (!error) {
            resolve();
            return;
          }
          reject(new SdkChildLaunchError("qvac-child-launch-failed"));
        });
      });
    } catch {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
      throw new SdkChildLaunchError("qvac-child-launch-failed");
    }
    return child;
  } catch (error) {
    if (error instanceof SdkChildLaunchError) throw error;
    throw new SdkChildLaunchError("qvac-child-launch-failed");
  }
}
