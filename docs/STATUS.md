# Current status

Updated: 2026-08-01

## Verified state

- Local Git repository initialized at `/Users/samaroomini/qvac-atlas`.
- V1 scope, provisional contract, non-goals, decision log, task board, and worker protocol exist.
- The protected release line is `main`; current milestone integration occurs on `integration`.
- The dormant executor, hostile-protocol matrix, private-artifact foundation, and
  verified-artifact executor bridge are integrated on `integration` through commit
  `275cf3d`.
- The complete workspace passes lint, typecheck, 286 package tests, five runtime
  isolation tests, static build, strict schema compilation, deterministic catalog
  regeneration, and a frozen-lockfile install.
- No external repository, package, deployment, upload, or Discord message has been created.
- The technical-truth verdict is **NARROW**: published QVAC SDK 0.16.0 directly
  exposes actual `cpu|gpu` device class, but not Metal/CUDA/Vulkan backend name.

## Active milestone

M1 — Local probe and registry vertical slice.

## Active work

- ATLAS-009: the consented fixture-driven probe/report pipeline is integrated.
- ATLAS-010: the validated catalog and static evidence registry are integrated.
- ATLAS-011: contribution admission, pull-request, and read-only CI workflows are
  integrated.
- ATLAS-012/A/B/C: independent reviews and the resulting SDK-child, filesystem,
  path, privacy, injection, and claim-evidence remediations are integrated.
- ATLAS-015: the exact project-local SDK resolver and opaque child-bootstrap grant
  are integrated; no production user command consumes the grant yet.
- ATLAS-016: the real-executor architecture is complete.
- ATLAS-016A/C: the dormant synthetic-SDK executor/supervisor and independent
  adversarial review are integrated. The executor is not imported by the probe or
  CLI; its synthetic issuer remains private, and its public grant wrapper accepts
  only a consumed capability for the exact pinned verified artifact.
- ATLAS-016B: tag-scoped model artifact/cache/hash research is integrated. Its
  verdict permits only Atlas-managed private staging; SDK-managed `registry://`
  download is blocked for a production grant.
- ATLAS-017: schema-derived TypeScript report types and full-schema drift checks
  are integrated.
- ATLAS-019: dormant Atlas-private artifact acquisition and validation is
  integrated, with explicit consent capability, exact pinned HTTPS source,
  descriptor rehashing, and atomic no-clobber publication. It remains absent from
  the probe, CLI, and claim pipeline.
- ATLAS-020: the dormant verified-artifact executor bridge is complete. It binds
  one exact pinned capability to an opaque single-use grant, sends only exact
  material through a second supervised private bootstrap, verifies before local
  load, confirms the SDK-reported loaded path, and revalidates after close. It adds
  no acquisition consent issuer, user command, report field, profile approval, or
  claim path.
- ATLAS-021A: the dormant `./contained` artifact transaction is complete. It owns
  the fixed account cache root, finite manual HTTPS redirects, reserve checks,
  nonce-exact staging/recovery, and a directly supervised fully reaped acquisition
  child. It remains absent from probe and CLI and performs no real model fetch.
- ATLAS-022: the expanded hostile executor-protocol matrix is integrated.
- ATLAS-013: a real QVAC lifecycle run is capacity-gated because this host has
  about 1 GiB free while the QVAC dependency graph plus model requires more than
  4.8 GiB before safety margin.

## Next integration gate

ATLAS-021 is implementing the explicit real-mode disclosure, contained acquisition,
and local report sequence in four serialized packets. The shipped CLI gate remains
hardcoded off. Production claim admission and user-facing real execution stay
disabled until a hash-verified ATLAS-013 lifecycle and privacy review succeed.

## Known risks

- Exact graphics backend name is not public evidence; UI/schema must say only CPU
  or GPU device class.
- The standardized model is a 386,404,992-byte Apache-2.0 artifact. Atlas-private
  acquisition and cache behavior are implemented against synthetic byte sources
  but still need real validation. QVAC-managed registry downloading is not an
  accepted production path.
- QVAC passes a model path to its native addon after verification; a private,
  quiescent Atlas directory narrows but cannot cryptographically eliminate the
  verify-to-open interval.
- Windows process-tree cleanup needs a Job Object or equivalent verified design.
- Real launch evidence requires volunteer physical devices; CI runners are not GPU compatibility evidence.
- QVAC SDK 0.16.0 has a multi-gigabyte native dependency footprint, so Atlas must
  resolve an existing project-local SDK and never silently install it.
- Source independence and production-profile approval are human trust decisions,
  not properties CI can derive from contributor JSON. The production allowlist is
  empty, and release remains blocked until the eventual host repository enforces
  maintainer ownership and protected review for that metadata.
