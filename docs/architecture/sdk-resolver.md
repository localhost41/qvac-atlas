# Project-local SDK resolver

Status: implemented V1 boundary for Node 22 and `@qvac/sdk` 0.16.0.

## Purpose and trust decision

`packages/qvac-resolver` turns an explicit contributor project root into one of a
small set of path-free outcomes. It does not search for a convenient SDK. A
resolved handle means only that one exact physical installation passed the V1
shape checks; selecting that project still authorizes execution of dependency code
from the project. The isolated child is crash and timeout containment, not a host
security sandbox.

The public resolver supports exactly Node 22 and SDK 0.16.0. Supporting another
runtime, SDK fingerprint, or package layout requires a reviewed versioned change.

## Resolution algorithm

The resolver canonicalizes the supplied root without walking ancestors, reads its
`package.json` with a 1 MiB cap, and requires a direct declaration of `@qvac/sdk`.
It then considers only `<root>/node_modules/@qvac/sdk`.

Before returning a handle it requires:

- a physical SDK directory whose real path remains below the real project root;
- a bounded, non-symlink package manifest with the exact 0.16.0 name, version,
  module type, main, exports, and license fingerprint; and
- a regular `dist/index.js` whose lexical and real locations remain below the SDK
  root and whose final component is not a symlink.

It never uses `require.resolve`, package-manager commands, bare imports, global
search paths, `NODE_PATH`, ancestor installs, or PnP hooks. In-project pnpm links
are accepted because their real package directory remains within the selected
project. External virtual stores and package links fail closed.

## Public result contract

The public entry point exports `resolveProjectLocalSdk`. Its stable outcomes are:

| Status              | Code                           | Meaning                                             |
| ------------------- | ------------------------------ | --------------------------------------------------- |
| `resolved`          | `qvac-sdk-resolved`            | Exact supported installation accepted               |
| `absent`            | `qvac-sdk-absent`              | No direct declaration or physical package           |
| `unsupported`       | `qvac-sdk-version-unsupported` | A different valid semver was found                  |
| `unsupported`       | `node-version-unsupported`     | Runtime is not Node 22                              |
| `unsafe-or-invalid` | `qvac-sdk-unsafe-or-invalid`   | Malformed, mismatched, PnP-only, or escaping layout |

These objects never include local paths. The resolved capability is backed by a
private `WeakMap`, has no enumerable state, and serializes as `undefined`; when it
is a property of a result, JSON serialization omits it. Only the deliberately named
`internalGetSdkBootstrapMaterial` export on the package's `./internal` entry point
reveals its canonical paths. That value must never enter evidence, errors, logs, or
report construction.

## Child launch and bootstrap

`launchResolvedSdkChild` accepts the opaque handle, an audited absolute runner
file, and a fresh temporary working directory supplied by its caller. The final cwd
component must be a real directory, and the canonical cwd plus its ancestors must
contain no project manifest, QVAC config candidate, or default QVAC worker entry.
Canonical parent aliases such as macOS `/var` to `/private/var` are permitted.

The required `beforeBootstrap(child)` boundary runs after the sanitized child is
spawned but before any SDK path is sent. The caller registers IPC, exit, error,
stdio, deadline, and process-tree supervision there, so even an immediate child
response cannot race listener installation. The callback receives only the child
process capability, never SDK path material. If supervision setup throws or the
private bootstrap send fails, launch waits for the child process to exit after
`SIGTERM`, escalates to `SIGKILL` after a bounded grace, and rejects only after the
OS process has been reaped. Caller-owned stdio draining remains part of supervision.

The child receives only an explicit environment allowlist. In particular,
`NODE_OPTIONS`, `NODE_PATH`, `QVAC_CONFIG_PATH`, and `QVAC_WORKER_PATH` cannot
cross the boundary, and `execArgv` is always empty. SDK paths are absent from argv
and environment. After spawn, the parent sends canonical SDK-root and entry file
URLs in a versioned private IPC message; a send failure terminates the child and
returns the path-free `qvac-child-launch-failed` error.

The child `receiveSdkBootstrapAndImport` function accepts exactly that four-field
message, canonicalizes both URLs, repeats the manifest, fingerprint, regular-file,
and containment checks, and imports only the audited absolute entry URL. Invalid
messages, missing IPC, validation failures, and import failures have stable
path-free codes.

## Verification corpus

The package tests build synthetic packages and do not install or import real QVAC.
They cover valid npm and contained pnpm layouts; absent, undeclared, ancestor-only,
`NODE_PATH`-only, and PnP cases; malformed and oversized manifests; wrong package,
version, and export fingerprints; external package and entry symlinks; inherited
loader and QVAC override suppression; canonical temporary paths; and JSON path
leakage. Fast-response, disconnected-IPC, and SIGTERM-resistant runners verify
pre-bootstrap supervision and awaited TERM-to-KILL cleanup. A fixture entry writes
a marker if an unsupported SDK is imported, proving that version detection itself
does not execute contributor code.
