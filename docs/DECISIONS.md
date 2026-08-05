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

## D-017 — V1 real execution is macOS arm64 only

Atlas V1 may execute the real QVAC lifecycle only when the root process observes
Node's exact `darwin` platform and `arm64` architecture. Every other operating
system or architecture refuses before project canonicalization or resolution,
Doctor, cache inspection or mutation, network access, temporary-file creation, and
process spawn. Portable fixture, schema, catalog, and site checks may continue on
the explicitly pinned Linux CI image; that does not make Linux a supported real
probe platform.

Linux, Windows, and non-arm64 macOS real execution are deferred until after V1 and
must not produce compatibility claims. A future Windows implementation still needs
durable descendant containment such as a Job Object and real Windows validation,
but that work is not a V1 launch gate. V1 instead requires focused tests proving
that every unsupported platform/architecture combination fails before effects.

## D-018 — Apple silicon SoC identity scopes V1 GPU claims

V1 production claims require macOS arm64 plus concrete hardware identity. A
CPU-relevant claim requires a concrete CPU vendor and model. A GPU-relevant claim
normally requires a concrete GPU vendor and model; on Apple silicon only, a
concrete Apple SoC model may stand as the integrated-GPU hardware key when Node's
portable collector has no separate GPU inventory. For V1, that model must match
the bounded collector form `Apple M<positive integer>` with an optional `Pro`,
`Max`, or `Ultra` suffix; arbitrary Apple-vendor strings fail closed. The site must
say that the GPU is keyed by Apple SoC identity and must not imply an exact GPU
model, core count, driver, Metal version, or other backend detail.

The genuine macOS collector's `platform.os.version` value comes from Node
`os.release()` and is therefore a Darwin kernel release, not the macOS marketing
version. Public rendering labels it as a kernel release. Changing to a product
version or adding a separate GPU inventory requires a versioned collection,
privacy, schema, and compatibility-key review.

## D-019 — Anonymous submission is an explicit relay to a private review queue

Atlas may reduce the GitHub contribution barrier without adding contributor
accounts. After the final exact report preview and a successful local write, the
CLI may offer one separate, default-no confirmation to submit that exact canonical
JSON to one pinned Atlas relay origin. Declining performs no network request. An
accepted submission performs one bounded request, has no background work or retry,
and never reads credentials from the contributor machine.

The relay is a narrow ingress, not the registry trust root. It revalidates size,
canonical form, schema, semantics, privacy, genuine provenance, publication
consent, and report identity before writing to a configured private GitHub queue.
GitHub supplies the durable queue and duplicate key; Atlas adds no service
database. Queue acceptance does not publish a report, create a compatibility
claim, establish an independent source, or permit the relay to edit protected
catalog/source metadata. A maintainer must still review and promote evidence into
the public append-only registry under D-013.

Every promoted accountless-queue report must use the protected
`unverified-anonymous` independence class and the single reserved
`source:anonymous-relay` key. Catalog validation rejects any other pairing. This
allows reviewed anonymous observations to become public while ensuring that any
number of them appears as one unverified source class but contributes zero sources
to independent reproduction derivation, even when mixed with independent reports.
Only a separately reviewed non-anonymous source may receive an independent source
key.

The relay must fail closed without its server-held GitHub credential, private queue
repository, and host-level abuse controls. It must not log request bodies, client
network addresses, report contents, or GitHub credentials. The public CLI endpoint
stays disabled until a reviewed HTTPS deployment is pinned in source. This decision
supersedes only the earlier blanket prohibition on an API server and automatic
submission in the bounded form above; the prohibitions on accounts, OAuth,
telemetry, databases, silent upload, and automatic public publication remain.

## D-020 — Contribution is one local decision plus one anonymous submission decision

The community-facing contribution path is `npx --yes qvac-atlas@0.3.0 contribute`.
It has no menu and no hidden flags: Atlas presents one combined disclosure for
the local run, then shows a concise allowlisted result summary, saves the exact
canonical JSON privately, and asks exactly `Submit anonymous report? [y/N]`.
`No` or Enter writes the private report and performs zero network requests. `Yes`
performs the single bounded relay request after the local write. An advanced
`--output` option remains available for explicit local destinations.

The summary may show Apple SoC/CPU model, architecture, memory bucket, directly
available GPU inventory (or the explicitly limited Apple-SoC-keyed integrated
GPU label), OS family and kernel release, Node and QVAC versions, profile,
requested and directly observed device, lifecycle outcome, and limitations. It
must never show usernames, hostnames, home paths, serials, network data,
credentials, environment variables, prompts, or arbitrary logs.

The static registry is a first-class user destination, not merely generated
catalog output. Its home page links to browse and contribute actions, supports
search and filters for the allowlisted hardware/software/device/result fields,
and links each card to a shareable exact-report page. `/contribute/` explains
the command, the two decisions, collection exclusions, local-first behavior,
and the private-review-to-public-publication boundary. The site remains static,
reviewed Git data with no accounts, database, analytics, or live API.

## D-021 — Owner-operated launch

The project owner explicitly chose to proceed without naming a separate
independent GitHub reviewer. Atlas therefore retains branch integrity, required
workspace checks, linear history, conversation resolution, administrator
enforcement, and no-force/no-delete controls, but does not require pull-request
approval or a separate Pages environment reviewer.

This is an explicit availability and governance tradeoff, not evidence that an
independent review occurred. The public site and npm release remain gated on the
exact local and CI checks; the relay remains gated on its host and GitHub App
controls.
