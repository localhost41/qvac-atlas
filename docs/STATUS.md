# Current status

Updated: 2026-07-31

## Verified state

- Local Git repository initialized at `/Users/samaroomini/qvac-atlas`.
- V1 scope, provisional contract, non-goals, decision log, task board, and worker protocol exist.
- The protected release line is `main`; current milestone integration occurs on `integration`.
- The second implementation wave is integrated on `integration` through commit
  `eeb12fc`.
- The complete workspace passes lint, typecheck, 97 package tests, five runtime
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
- ATLAS-012: independent adversarial reviews of the integrated boundaries are active.
- ATLAS-012A/B/C: the reviews' SDK-child handoff, catalog filesystem/path, and
  claim-evidence/privacy findings are in isolated remediation branches.
- ATLAS-015: the exact project-local SDK resolver and opaque child-bootstrap grant
  are integrated; no production user command consumes the grant yet.
- ATLAS-016: real executor binding is queued after the adversarial findings are
  reconciled.
- ATLAS-013: a real QVAC lifecycle run is capacity-gated because this host has
  about 1 GiB free while the QVAC dependency graph plus model requires more than
  4.8 GiB before safety margin.

## Next integration gate

The release captain will integrate contribution admission, close the independent
adversarial findings, and then bind the opaque resolver grant to a bounded production
executor. Production claim admission and user-facing real execution stay disabled
until a hash-verified real lifecycle succeeds.

## Known risks

- Exact graphics backend name is not public evidence; UI/schema must say only CPU
  or GPU device class.
- The standardized model is a 386,404,992-byte Apache-2.0 artifact; download and
  cache behavior still need real validation.
- Windows process-tree cleanup needs a Job Object or equivalent verified design.
- Real launch evidence requires volunteer physical devices; CI runners are not GPU compatibility evidence.
- QVAC SDK 0.16.0 has a multi-gigabyte native dependency footprint, so Atlas must
  resolve an existing project-local SDK and never silently install it.
- Source independence and production-profile approval are human trust decisions,
  not properties CI can derive from contributor JSON. The production allowlist is
  empty, and release remains blocked until the eventual host repository enforces
  maintainer ownership and protected review for that metadata.
