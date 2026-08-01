# ATLAS-019 — Private artifact acquisition foundation

## Outcome

Implement a dormant workspace package that can acquire and validate the exact
SmolLM2 candidate into an Atlas-private directory only after consuming an opaque,
single-use consent capability. It must not be wired into the probe or CLI and must
not make the candidate claim-eligible.

## Allowed scope

- `packages/model-artifact/**`
- a package importer in `pnpm-lock.yaml` must be left for root to regenerate
- architecture documentation specific to the artifact boundary
- narrowly required workspace configuration

Do not edit the probe, CLI, report schema, catalog, candidate eligibility, or
production profile allowlist. Do not install QVAC, fetch the real model, or create a
real cache during development.

## Required boundary

- Pin the immutable HTTPS source, revision, filename, `386404992`-byte size,
  SHA-256, and Apache-2.0 license in one typed candidate definition.
- Expose a pure disclosure object before any filesystem mutation or network call.
- Require an opaque single-use acquisition-consent capability. The only issuer in
  this packet is an unexported synthetic-test helper; adding UI consent later must
  require a separate packet.
- Use an injected byte source in tests. Production acquisition code may support
  the exact pinned HTTPS source, but no acceptance test may contact the network.
- Create private directories/files, reject symlinks and non-regular targets, cap
  bytes before overflow, stream SHA-256, require exact size/hash, fsync and publish
  by a same-filesystem atomic no-clobber operation, and clean recognized partial
  files on every failure under D-014's private, quiescent-directory assumption. A
  hard-link publication followed by removal of the private staging name is
  acceptable on the POSIX-only V1 boundary when final link count is revalidated as
  one; overwriting rename is not. Node's pathname unlink cannot prove protection
  against a hostile same-UID writer racing the final identity check.
- Reuse an existing artifact only after descriptor-safe regular-file, containment,
  size, and full-hash validation. Never trust a filename or cached metadata alone.
- Return only an opaque, single-use verified-artifact capability. Paths and digests
  may be inspected only through an internal test surface and must never serialize.
- Fixed public failures must not contain source URLs, filesystem paths, response
  bodies, or raw exceptions.

## Acceptance

- Tests cover refusal before I/O, valid acquisition/cache hit, truncation,
  overflow, wrong hash, thrown source, atomic cleanup, target collision,
  symlink/non-regular inputs, permissions, capability forgery/reuse, and path-free
  errors.
- A static dependency/wiring test proves the package remains absent from the probe
  and CLI.
- Package test, typecheck, lint, `git diff --check`, and the complete workspace gate
  pass without a real network request or model download.
