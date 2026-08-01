# Decision log

## D-001 — Git-native static product

Atlas V1 stores reviewed reports in Git and builds a static site. There is no application backend, account system, or service database.

## D-002 — Local-only default

`probe` writes locally and uploads nothing. Publication is a separate explicit action after a human-readable preview.

## D-003 — One immutable workload profile

V1 uses one pinned small-LLM lifecycle profile. Once reports reference it, its behavior and artifact hash are immutable.

## D-004 — Evidence before claims

Atlas never infers an actual backend from installed APIs, requested configuration, or hardware presence. Unsupported observation is recorded as `unknown`.

## D-005 — Official QVAC tools are inputs

Atlas calls Doctor, bundle verification, diagnostics, and resource APIs where available. It does not copy their rules or present itself as a replacement.

## D-006 — Repository is project memory

Scope, current state, tasks, decisions, verification, and handoffs must be durable in the repository. Chat messages are notifications, not authoritative state.

## D-007 — Serialized integration

Workers use isolated worktrees and never merge their own changes. A Sol release captain integrates only after task acceptance checks pass.

## D-008 — QVAC 0.16 evidence is device class, not backend name

Atlas V1 records requested `auto|cpu|gpu` separately from directly observed
`cpu|gpu`. It never converts generic GPU evidence into Metal, CUDA, Vulkan, or
OpenCL. Initial runtime support is Node 22 and exact QVAC SDK 0.16.0 until a real
version/runtime matrix expands it.

## D-009 — Official tools do not authorize installation or config execution

Doctor may run only through an already-resolvable project-local `@qvac/cli`
entrypoint. Atlas never falls back to PATH, global tools, `npx`, or package
installation. Raw Doctor JSON is not report-safe and must be normalized through an
allowlist. Bundle verification is an explicit V1 skip because a local probe has no
contributor deployment bundle and the verifier may load project configuration.

## D-010 — Production claims remain gated after source feasibility

The SmolLM2 360M Q8 artifact is the provisional V1 workload candidate: Apache-2.0,
386,404,992 bytes, immutable revision, and pinned SHA-256. Source and metadata
verification permit implementation to proceed, but the production profile allowlist
remains disabled until a real hash-verified QVAC lifecycle succeeds.

## D-011 — Tool telemetry is disabled

Atlas has no product telemetry, and project tooling must not emit vendor telemetry
during local or CI use. Astro commands run with `ASTRO_TELEMETRY_DISABLED=1`
through a cross-platform wrapper.

## D-012 — Execute only an audited project-local SDK

Atlas never declares or installs QVAC. V1 accepts only a directly declared,
physical, path-contained `@qvac/sdk` 0.16.0 under an explicit project root. It
validates a known package/export fingerprint, imports the audited file URL from a
clean temporary working directory, strips Node/QVAC loader overrides, and treats
every missing, unsafe, or unsupported layout as unknown. Isolation contains crashes
and deadlines; it is not a sandbox for hostile project code.

## D-013 — Git review is the V1 trust root

Atlas can validate report mechanics, consent, privacy, provenance shape, and profile
matching, but it cannot infer that two reports came from independent physical
sources. `sourceKey` and production-profile admission are therefore maintainer
decisions, never contributor evidence. The production allowlist remains empty until
the public repository protects this metadata with named code ownership, required
fresh approval, and branch protection. CI is defense in depth and does not turn an
unreviewed metadata edit into trusted evidence.

## D-014 — Atlas owns production model artifact staging

QVAC SDK 0.16.0's built-in `registry://` path verifies the selected artifact's
size and SHA-256, but it does not give Atlas fail-closed control over all cache
destinations or bind verified bytes atomically to the native addon's later path
open. Atlas therefore cannot use SDK-managed download for a production execution
grant.

A future grant may reference only an Atlas-acquired canonical local file inside an
Atlas-private, quiescent directory. Atlas must disclose the exact immutable source,
Apache-2.0 license, 386,404,992-byte size, destination, and cache behavior before
network activity; obtain explicit consent; enforce bounded acquisition and the
pinned SHA-256; reject symlinks and path escapes; compare QVAC's loaded local path;
and hash again after the lifecycle. This remains a narrow path-based safety model,
not cryptographic proof of the bytes opened by the native addon. It stays dormant
until its own implementation, adversarial review, and real-device gate pass.

## D-015 — The verified artifact crosses only a private supervised bootstrap

ATLAS-020 keeps the local-model bridge dormant and preserves the existing lifecycle
and evidence grammar. A verified-artifact capability may be consumed only into the
executor's existing opaque, single-use grant. The grant material crosses to the
trusted child in a second exact parent-to-child IPC message sent inside the
resolver's established TERM/KILL/reap failure envelope; it never enters argv,
environment, stdout, stderr, child-to-parent events, errors, or reports.

The supervised child, not the caller process, performs a descriptor-safe full hash
immediately before `loadModel`, passes only the canonical absolute local path with
explicit `llamacpp-completion` type, and requires `getLoadedModelInfo` to return the
same model ID, a non-delegated local model, the exact model type, and the exact path.
After unload and close it revalidates the artifact again. Any mismatch is fixed,
path-free, non-claim-producing evidence. ATLAS-020 adds no consent issuer, CLI,
probe wiring, report field, profile approval, download, or real model execution.

## D-016 — Real-mode activation is two directly supervised worker waves

ATLAS-021 may add a dormant real-mode composition path, but acquisition and QVAC
execution do not share a killable coordinator. The root CLI process first owns and
fully reaps one contained artifact-acquisition process. Only an exact successful
handoff can mint the expected pinned capability in the parent. The parent then
immediately converts it to the existing opaque grant and directly supervises the
QVAC process group. This preserves ATLAS-020 containment and avoids orphaning a
separately detached QVAC/Bare group if an outer worker dies.

The acquisition approval is one fresh TTY decision bound to the exact candidate,
fixed cache root, canonical project, audited SDK 0.16 handle, requested GPU
workload, and session nonce. No raw consent issuer is exported. Acquisition uses a
bounded manual official-host redirect policy and an exact nonce-owned staging name
so the parent can attempt descriptor-safe recovery after a hard worker kill without
scanning or deleting unrelated cache entries.

Real reports use probe provenance and the candidate profile, but production profile
admission and `claim_eligible` remain disabled. The complete path stays behind a
hardcoded false release gate until a separate ATLAS-013 physical run and privacy
review succeed.
