export const SUPPORTED_NODE_MAJOR = 22;
export const SUPPORTED_SDK_VERSION = "0.16.0";
export const MAX_MANIFEST_BYTES = 1024 * 1024;

export const SDK_PACKAGE_NAME = "@qvac/sdk";
export const SDK_MAIN_ENTRY = "./dist/index.js";
export const SDK_PACKAGE_EXPORT = "./package.json";
export const SDK_LICENSE = "Apache-2.0";

export const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

export const INHERITED_ENV_ALLOWLIST = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "windir",
] as const;

export const FORBIDDEN_CHILD_ENV = [
  "NODE_PATH",
  "NODE_OPTIONS",
  "QVAC_CONFIG_PATH",
  "QVAC_WORKER_PATH",
] as const;

export const QVAC_CONFIG_CANDIDATES = [
  "qvac.config.ts",
  "qvac.config.mjs",
  "qvac.config.js",
  "qvac.config.json",
] as const;
