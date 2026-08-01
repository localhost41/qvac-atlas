import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { CheckEvidence } from "./types.js";

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DOCTOR_OUTPUT_BYTES = 256 * 1024;
const DOCTOR_TIMEOUT_MS = 30_000;

interface PackageManifest {
  name?: unknown;
  version?: unknown;
  bin?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
}

export type DoctorLocation =
  | { kind: "resolved"; entryPath: string }
  | {
      kind: "unavailable";
      code: "qvac-cli-not-locally-resolvable" | "qvac-cli-unsafe";
    };

export interface DoctorLocator {
  locate(projectRoot: string): Promise<DoctorLocation>;
}

export interface DoctorExecution {
  exitCode: number | null;
  stdout: string;
  durationMs: number;
  timedOut: boolean;
  overflowed: boolean;
}

export interface DoctorExecutor {
  execute(entryPath: string, projectRoot: string): Promise<DoctorExecution>;
}

export interface DoctorResult {
  evidence: CheckEvidence;
  diagnostic:
    | "doctor-passed"
    | "doctor-reported-failure"
    | "doctor-invalid-output"
    | "doctor-timed-out"
    | "doctor-output-limit"
    | "qvac-cli-not-locally-resolvable"
    | "qvac-cli-unsafe";
}

async function readBoundedJson(filePath: string): Promise<PackageManifest> {
  const info = await stat(filePath);
  if (!info.isFile() || info.size > MAX_MANIFEST_BYTES)
    throw new Error("unsafe manifest");
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("invalid manifest");
  return parsed as PackageManifest;
}

function declaresCli(manifest: PackageManifest): boolean {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    const value = manifest[field];
    if (
      value !== null &&
      typeof value === "object" &&
      Object.hasOwn(value, "@qvac/cli")
    )
      return true;
  }
  return false;
}

function binEntry(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (typeof record.qvac === "string") return record.qvac;
  const candidates = Object.values(record).filter(
    (entry): entry is string => typeof entry === "string",
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

export class ProjectLocalDoctorLocator implements DoctorLocator {
  async locate(projectRoot: string): Promise<DoctorLocation> {
    try {
      const root = await realpath(path.resolve(projectRoot));
      const projectManifest = await readBoundedJson(
        path.join(root, "package.json"),
      );
      if (!declaresCli(projectManifest))
        return { kind: "unavailable", code: "qvac-cli-not-locally-resolvable" };

      const logicalPackageRoot = path.join(
        root,
        "node_modules",
        "@qvac",
        "cli",
      );
      const packageRoot = await realpath(logicalPackageRoot);
      if (!isContained(root, packageRoot))
        return { kind: "unavailable", code: "qvac-cli-unsafe" };

      const manifest = await readBoundedJson(
        path.join(packageRoot, "package.json"),
      );
      if (manifest.name !== "@qvac/cli" || manifest.version !== "0.9.0") {
        return { kind: "unavailable", code: "qvac-cli-unsafe" };
      }
      if (
        manifest.bin === null ||
        typeof manifest.bin !== "object" ||
        Array.isArray(manifest.bin) ||
        Object.keys(manifest.bin).length !== 1 ||
        (manifest.bin as Record<string, unknown>).qvac !== "dist/index.js"
      ) {
        return { kind: "unavailable", code: "qvac-cli-unsafe" };
      }
      const relativeEntry = binEntry(manifest.bin);
      if (relativeEntry === null || path.isAbsolute(relativeEntry))
        return { kind: "unavailable", code: "qvac-cli-unsafe" };

      const entryPath = await realpath(
        path.resolve(packageRoot, relativeEntry),
      );
      if (!isContained(packageRoot, entryPath))
        return { kind: "unavailable", code: "qvac-cli-unsafe" };
      const entryInfo = await stat(entryPath);
      if (!entryInfo.isFile())
        return { kind: "unavailable", code: "qvac-cli-unsafe" };
      await access(entryPath, constants.R_OK);
      return { kind: "resolved", entryPath };
    } catch {
      return { kind: "unavailable", code: "qvac-cli-not-locally-resolvable" };
    }
  }
}

function doctorEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "HOME",
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMPDIR",
    "WINDIR",
  ];
  return Object.fromEntries(
    allowed.flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]],
    ),
  );
}

async function terminateTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
    } catch {
      child.kill(signal);
    }
    return;
  }
  child.kill();
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot === undefined) return;
  const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
  await new Promise<void>((resolve) => {
    const killer = spawn(taskkill, ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => resolve());
    killer.once("close", () => resolve());
  });
}

export class NodeDoctorExecutor implements DoctorExecutor {
  constructor(
    private readonly options: {
      timeoutMs?: number;
      graceMs?: number;
      hardSettleMs?: number;
      maxOutputBytes?: number;
    } = {},
  ) {}

  async execute(
    entryPath: string,
    projectRoot: string,
  ): Promise<DoctorExecution> {
    const started = Date.now();
    return await new Promise<DoctorExecution>((resolve) => {
      const child = spawn(process.execPath, [entryPath, "doctor", "--json"], {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        env: doctorEnvironment(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let timedOut = false;
      let overflowed = false;
      let settled = false;
      let stopping = false;
      let forceTimer: NodeJS.Timeout | undefined;
      let settleTimer: NodeJS.Timeout | undefined;

      const finish = (exitCode: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceTimer !== undefined) clearTimeout(forceTimer);
        if (settleTimer !== undefined) clearTimeout(settleTimer);
        resolve({
          exitCode,
          stdout: Buffer.concat(chunks).toString("utf8"),
          durationMs: Math.min(Date.now() - started, 3_600_000),
          timedOut,
          overflowed,
        });
      };
      const stop = async (reason: "timeout" | "overflow"): Promise<void> => {
        if (stopping || settled) return;
        stopping = true;
        if (reason === "timeout") timedOut = true;
        else overflowed = true;
        await terminateTree(child, "SIGTERM");
        forceTimer = setTimeout(
          () => void terminateTree(child, "SIGKILL"),
          this.options.graceMs ?? 250,
        );
        forceTimer.unref();
        settleTimer = setTimeout(
          () => finish(null),
          this.options.hardSettleMs ?? 1_500,
        );
        settleTimer.unref();
      };
      const timer = setTimeout(
        () => void stop("timeout"),
        this.options.timeoutMs ?? DOCTOR_TIMEOUT_MS,
      );
      timer.unref();

      child.stdout?.on("data", (chunk: Buffer) => {
        if (overflowed) return;
        bytes += chunk.length;
        if (bytes > (this.options.maxOutputBytes ?? MAX_DOCTOR_OUTPUT_BYTES)) {
          void stop("overflow");
          return;
        }
        chunks.push(chunk);
      });
      child.stderr?.resume();

      child.once("error", () => finish(null));
      child.once("close", (code) => {
        // Sweep the process group even after nominal root exit so a probe tool
        // cannot leave a descendant behind.
        void terminateTree(child, "SIGKILL");
        finish(code);
      });
    });
  }
}

function normalizeDoctor(execution: DoctorExecution): DoctorResult {
  const duration = Math.max(
    0,
    Math.min(Math.trunc(execution.durationMs), 3_600_000),
  );
  if (execution.timedOut) {
    return {
      evidence: {
        status: "failed",
        reason: "timed-out",
        duration_ms: duration,
      },
      diagnostic: "doctor-timed-out",
    };
  }
  if (execution.overflowed) {
    return {
      evidence: { status: "unknown", reason: "unavailable", duration_ms: null },
      diagnostic: "doctor-output-limit",
    };
  }
  try {
    const parsed: unknown = JSON.parse(execution.stdout);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("invalid");
    const report = parsed as Record<string, unknown>;
    if (
      !exactDoctorKeys(report, [
        "ok",
        "platform",
        "arch",
        "nodeVersion",
        "sections",
      ])
    )
      throw new Error("invalid");
    const ok = report.ok;
    if (
      typeof ok !== "boolean" ||
      typeof report.platform !== "string" ||
      typeof report.arch !== "string" ||
      typeof report.nodeVersion !== "string" ||
      !Array.isArray(report.sections)
    )
      throw new Error("invalid");
    const sectionIds = new Set([
      "runtime",
      "hardware",
      "targets",
      "tools",
      "project",
    ]);
    if (report.sections.length !== sectionIds.size) throw new Error("invalid");
    let containsFailure = false;
    for (const rawSection of report.sections) {
      if (
        rawSection === null ||
        typeof rawSection !== "object" ||
        Array.isArray(rawSection)
      )
        throw new Error("invalid");
      const section = rawSection as Record<string, unknown>;
      if (
        !exactDoctorKeys(section, ["id", "title", "checks"]) ||
        !sectionIds.delete(String(section.id)) ||
        typeof section.title !== "string" ||
        !Array.isArray(section.checks) ||
        section.checks.length === 0
      )
        throw new Error("invalid");
      for (const rawCheck of section.checks) {
        if (
          rawCheck === null ||
          typeof rawCheck !== "object" ||
          Array.isArray(rawCheck)
        )
          throw new Error("invalid");
        const check = rawCheck as Record<string, unknown>;
        const required = ["id", "label", "status", "severity"];
        const permitted = new Set([...required, "value", "detail", "hint"]);
        if (
          !required.every((key) => Object.hasOwn(check, key)) ||
          Object.keys(check).some((key) => !permitted.has(key))
        )
          throw new Error("invalid");
        if (
          typeof check.id !== "string" ||
          typeof check.label !== "string" ||
          !["pass", "warn", "fail", "skip", "info"].includes(
            String(check.status),
          ) ||
          !["required", "recommended", "informational"].includes(
            String(check.severity),
          )
        )
          throw new Error("invalid");
        for (const optional of ["value", "detail", "hint"])
          if (
            check[optional] !== undefined &&
            typeof check[optional] !== "string"
          )
            throw new Error("invalid");
        if (check.status === "fail") containsFailure = true;
      }
    }
    if (sectionIds.size !== 0 || ok === containsFailure)
      throw new Error("invalid");
    if (ok === true && execution.exitCode === 0) {
      return {
        evidence: {
          status: "passed",
          reason: "completed",
          duration_ms: duration,
        },
        diagnostic: "doctor-passed",
      };
    }
    if (
      ok === false &&
      (execution.exitCode === 0 || execution.exitCode === 1)
    ) {
      return {
        evidence: { status: "failed", reason: "failed", duration_ms: duration },
        diagnostic: "doctor-reported-failure",
      };
    }
  } catch {
    // Raw output is deliberately discarded below.
  }
  return {
    evidence: { status: "unknown", reason: "unavailable", duration_ms: null },
    diagnostic: "doctor-invalid-output",
  };
}

function exactDoctorKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return (
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0")
  );
}

export class ProjectLocalDoctorAdapter {
  constructor(
    private readonly locator: DoctorLocator = new ProjectLocalDoctorLocator(),
    private readonly executor: DoctorExecutor = new NodeDoctorExecutor(),
  ) {}

  async run(projectRoot: string): Promise<DoctorResult> {
    const location = await this.locator.locate(projectRoot);
    if (location.kind === "unavailable") {
      return {
        evidence: {
          status: "unknown",
          reason: "unavailable",
          duration_ms: null,
        },
        diagnostic: location.code,
      };
    }
    return normalizeDoctor(
      await this.executor.execute(location.entryPath, projectRoot),
    );
  }
}
