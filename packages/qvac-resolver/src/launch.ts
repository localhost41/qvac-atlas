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
  beforeBootstrap: (child: ChildProcess) => void | Promise<void>;
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

const BOOTSTRAP_TERM_GRACE_MS = 250;
const BOOTSTRAP_KILL_SETTLE_MS = 2_000;

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function observeExit(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      child.off("exit", finish);
      child.off("error", onError);
      resolve();
    };
    const onError = (): void => {
      // A process that never spawned has nothing to terminate or reap. Send and
      // kill errors for a live pid do not satisfy cleanup.
      if (child.pid === undefined) finish();
    };
    child.once("exit", finish);
    child.on("error", onError);
  });
}

async function settlesWithin(
  settled: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      settled.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The child has not received contributor SDK code when this runs. Wait for the
 * process to be reaped after TERM, escalate to KILL after a bounded grace, and
 * never expose the child back to the caller on a failed launch.
 */
async function terminateFailedBootstrap(
  child: ChildProcess,
  settled: Promise<void>,
): Promise<void> {
  if (!hasExited(child)) {
    try {
      child.kill("SIGTERM");
    } catch {
      // A concurrent exit is settled by the observer below.
    }
  }
  if (await settlesWithin(settled, BOOTSTRAP_TERM_GRACE_MS)) return;

  if (!hasExited(child)) {
    try {
      child.kill("SIGKILL");
    } catch {
      // A concurrent exit is settled by the observer below.
    }
  }
  if (!(await settlesWithin(settled, BOOTSTRAP_KILL_SETTLE_MS))) {
    throw new SdkChildLaunchError("qvac-child-launch-failed");
  }
}

/**
 * Launch a pre-audited runner with no inherited loader/config hooks. The SDK
 * location is transmitted after spawn over the private IPC channel, never in
 * argv or the environment. `beforeBootstrap` completes before that send so the
 * caller cannot miss fast IPC, exit, error, or stream events.
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
    const settled = observeExit(child);
    try {
      await options.beforeBootstrap(child);
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
      await terminateFailedBootstrap(child, settled);
      throw new SdkChildLaunchError("qvac-child-launch-failed");
    }
    return child;
  } catch (error) {
    if (error instanceof SdkChildLaunchError) throw error;
    throw new SdkChildLaunchError("qvac-child-launch-failed");
  }
}
