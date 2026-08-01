# Current status

Updated: 2026-07-31

## Verified state

- Local Git repository initialized at `/Users/samaroomini/qvac-atlas`.
- V1 scope, provisional contract, non-goals, decision log, task board, and worker protocol exist.
- The protected release line is `main`; current milestone integration occurs on `integration`.
- The first implementation wave is integrated on `integration` through commit
  `d3513c9`.
- The complete workspace passes lint, typecheck, 27 package tests, five runtime
  isolation tests, static build, strict schema compilation, and a frozen-lockfile
  install.
- No external repository, package, deployment, upload, or Discord message has been created.
- The technical-truth verdict is **NARROW**: published QVAC SDK 0.16.0 directly
  exposes actual `cpu|gpu` device class, but not Metal/CUDA/Vulkan backend name.

## Active milestone

M1 — Local probe and registry vertical slice.

## Active work

- ATLAS-008: safe project-local QVAC SDK discovery and import policy is complete.
- ATLAS-009: fixture-driven probe/report pipeline is active on
  `feat/ATLAS-009-probe`.
- ATLAS-010: validated catalog and static registry UI is active on
  `feat/ATLAS-010-registry`.
- ATLAS-015: binding the fail-closed resolver to the real executor is queued after
  the probe adapter boundary lands.
- ATLAS-013: a real QVAC lifecycle run is capacity-gated because this host has
  about 1 GiB free while the QVAC dependency graph plus model requires more than
  4.8 GiB before safety margin.

## Next integration gate

The release captain will bind the selected SmolLM2 profile, implement a complete
fixture-driven probe-to-site path, and keep production claim admission disabled
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
