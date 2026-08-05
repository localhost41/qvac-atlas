export const PACKAGE_NAME = "qvac-atlas";
export const PACKAGE_VERSION = "0.2.0";
export const PACKAGE_FILENAME = `${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz`;

export const BUNDLE_FILENAMES = Object.freeze([
  "bin.js",
  "child-runner.js",
  "acquisition-child.js",
  "recovery-child.js",
]);

export const SCHEMA_FILENAMES = Object.freeze([
  "report.schema.json",
  "claim.schema.json",
]);

export const PACKAGE_FILES = Object.freeze([
  "bundle",
  "schemas",
  "README.md",
  "LICENSE",
  "NOTICE",
]);

export const PACKAGE_HOMEPAGE =
  "https://github.com/localhost41/qvac-atlas#readme";
export const PACKAGE_REPOSITORY = Object.freeze({
  type: "git",
  url: "git+https://github.com/localhost41/qvac-atlas.git",
});
export const PACKAGE_BUGS = Object.freeze({
  url: "https://github.com/localhost41/qvac-atlas/issues",
});
export const PACKAGE_KEYWORDS = Object.freeze([
  "qvac",
  "compatibility",
  "hardware",
  "local-first",
]);

export const BUNDLED_RUNTIME_PACKAGES = new Map([
  ["ajv", "8.18.0"],
  ["ajv-formats", "3.0.1"],
  ["fast-deep-equal", "3.1.3"],
  ["fast-uri", "3.1.5"],
  ["json-schema-traverse", "1.0.0"],
]);
