# Project-local QVAC SDK resolution boundary

Status: V1 policy verified against published `@qvac/sdk` 0.16.0 and Node 22.

## Decision

Atlas stays lightweight and never declares, installs, updates, or resolves a global
QVAC SDK. V1 supports only Node 22, exact `@qvac/sdk` 0.16.0, and a conventional
physical dependency directly declared by the selected contributor project.

The project root is explicit (defaulting only to the exact current directory). The
probe does not walk ancestors. It reads bounded JSON from `<root>/package.json` and
requires `@qvac/sdk` in a dependency section before looking at the exact logical
path `<root>/node_modules/@qvac/sdk`.

Yarn PnP, ancestor-only installs, global modules, `NODE_PATH`, external links, and
external pnpm virtual stores are unsupported in V1. Unsupported layout is missing
evidence, not hardware failure.

## Fail-closed resolution

Before any import, the resolver must:

1. `realpath` the project root without searching upward.
2. Read at most 1 MiB of the root `package.json` as JSON, never executable config.
3. Require a direct dependency declaration and the exact physical SDK path.
4. `realpath` the SDK and require it to remain contained by the real project root.
5. Read a bounded SDK manifest and validate the known 0.16.0 fingerprint: package
   name, exact version, module type, main entry, root import/require export, package
   export, and expected license.
6. Resolve `exports["."].import` lexically inside the SDK root, then require its real
   target to be a regular contained file rather than a final symlink.
7. Send that audited entry to the child over private bootstrap IPC, never argv,
   environment, structured evidence, errors, or report JSON.
8. Have the child repeat containment checks immediately before importing the file
   URL to reduce time-of-check/time-of-use exposure.

The resolver does not call `require.resolve`: bare-specifier resolution can walk
ancestors and global search locations. The isolated child imports only the audited
absolute file URL.

## Execution boundary

The child runs from a fresh Atlas temporary directory. Its environment allowlist
must remove `NODE_PATH`, `NODE_OPTIONS`, `QVAC_CONFIG_PATH`, and
`QVAC_WORKER_PATH`; `fork` must set `execArgv: []`. This prevents inherited Node
loaders and project-local QVAC config/worker overrides from being selected by
accident.

Selecting a project root authorizes execution of that project's SDK dependency.
Manifest checks establish adapter shape, not package authenticity. A counterfeit or
modified dependency can still execute arbitrary JavaScript/native code and access
the host. Atlas process isolation is crash and timeout containment, not a security
sandbox; disclosure and consent must say so.

## Status semantics

- No direct declaration or physical package: `qvac-sdk-absent`, runtime skipped,
  overall unknown.
- PnP, external link, manifest mismatch, entry escape, or malformed package:
  `qvac-sdk-unsafe-or-invalid`, runtime skipped, overall unknown.
- A version other than 0.16.0: `qvac-sdk-version-unsupported`, detected semver may
  be recorded, runtime skipped, overall unknown.
- Import dependency failure after structural validation: invalid installation,
  overall unknown—not a hardware compatibility failure.
- Runtime evidence may affect compatibility claims only after exact supported SDK
  import and the public worker lifecycle begins.

## Required acceptance corpus

The production resolver must cover valid npm and in-project pnpm layouts plus
absent, undeclared, ancestor-only, `NODE_PATH`-only, PnP, malformed/oversized
manifests, wrong name/version, external SDK symlinks, entry escape, export mismatch,
hostile project config, custom worker entry, inherited loader injection, and report
path leakage. Atlas package manifests and lockfiles must contain no QVAC SDK
dependency, peer dependency, or optional dependency.

