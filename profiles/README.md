# Workload profiles

QVAC Atlas claims are valid only for an immutable, reviewed workload profile. A
profile identity is the tuple of `id`, semantic `version`, and artifact SHA-256.
Changing behavior or the artifact requires a new version. Reports never inherit
compatibility across profile versions.

ATLAS-002 established a provisional small, licensed, pinned artifact and a public
API that directly observes the generic `cpu` or `gpu` completion backend. The
production V1 profile is nevertheless not declared until the conforming macOS
arm64 physical-validation record and independent privacy review are accepted,
repository trust is active, and profile admission receives its own protected human
review. This prevents feasible candidate metadata from accidentally becoming a
compatibility standard.

`fixtures/atlas-small-llm-lifecycle-test.json` is test-only and must never be
included in the production profile allowlist or displayed as genuine evidence.

QVAC's public completion evidence distinguishes `cpu` and `gpu`; it does not prove
Metal, CUDA, or Vulkan execution. Those APIs may appear as inventory/capabilities,
but never as Atlas's observed backend.
