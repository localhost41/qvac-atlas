# V1 contract

Status: **versioned V1 contract; fixture foundation implemented, production gated**.

## Product boundary

```text
local probe -> canonical report -> explicit anonymous relay -> private review queue
            -> reviewed Git data -> static registry
```

## Claim states

- `observed-success`: one valid standardized probe completed.
- `reproduced-success`: at least two independent valid reports match the compatibility key.
- `mixed`: matching reports contain both success and failure.
- `observed-failure`: a valid probe captured a defined failure.
- `unknown`: evidence is insufficient, nonstandard, or cannot establish the result.

Doctor success alone cannot produce `observed-success`. A requested GPU backend with observed CPU execution is fallback evidence, not GPU success. Public issue evidence may corroborate failure but never counts as a probe-verified success.

## Compatibility key

Claims are scoped to:

- QVAC SDK version.
- Probe version.
- Immutable workload profile version and artifact hash.
- OS family/kernel release and architecture for genuine V1 probes.
- Concrete CPU/GPU hardware identity. On Apple silicon, the concrete SoC model is
  the integrated-GPU key when no separate GPU inventory is available; it does not
  claim an exact GPU core count or backend name.
- Requested and directly observed backend.

No success is inferred across QVAC versions.

## Probe phases

```text
disclose-and-consent
discover-qvac
collect-allowlisted-system-data
run-doctor
run-verification-if-applicable
resolve-pinned-profile
confirm-download-if-required
spawn-isolated-runner
qvac-import
worker-start
model-load
inference
clean-shutdown
normalize
sanitize
validate
preview
write
confirm-anonymous-submission
submit-once-if-confirmed
```

All runtime phases have deadlines. Failure finalization retains only structured phase results, exit metadata, requested backend, directly observed backend, and a bounded sanitized failure excerpt.

## Report principles

- JSON Schema is normative. Runtime schema and semantic validation is mandatory;
  TypeScript assembly types are generated from that schema and guarded by a
  full-schema digest plus a byte-for-byte drift check.
- Reports have separate schema, probe, QVAC, and profile versions.
- Unknown and skipped are explicit; absence is not interpreted as failure.
- Canonical JSON is deterministic across supported operating systems.
- Accepted reports are append-only; corrections supersede rather than mutate.
- Claim-producing statuses are derived from structured evidence.
- Contributor HTML, scripts, styles, or arbitrary Markdown are never rendered.

## Privacy boundary

Collection is allowlist-first. Never collect environment values, tokens, cookies, auth headers, usernames, home directories, hostnames, organization names, network addresses, serial numbers, stable machine identifiers, process lists, shell history, arbitrary prompts, generated content, full configs, full logs, or absolute model paths.

The hardware/OS combination may itself be identifying. Publication therefore requires an explicit preview and separate consent.

Anonymous relay submission is a second explicit, default-no decision after the
exact preview and local write. It sends only the already-previewed canonical report
to one source-pinned HTTPS origin. It never retries in the background, never sends
fixtures, and never makes queued evidence public without maintainer promotion.

## Resolved feasibility boundary

- V1 real execution targets macOS arm64, Node 22, and exact project-local
  `@qvac/sdk` 0.16.0 only. Every other operating system or architecture refuses
  before project resolution, Doctor, cache or network activity, temporary-file
  creation, or process spawn. Cross-platform fixture and static-build checks do
  not expand that production boundary.
- The source-verified candidate is SmolLM2 360M Instruct Q8, pinned by revision,
  386,404,992-byte size, SHA-256, and Apache-2.0 license. It is not claim-eligible
  until a local hash-verified lifecycle succeeds.
- Published QVAC 0.16.0 directly reports only actual `cpu|gpu` device class for LLM
  completion, not Metal, CUDA, Vulkan, OpenCL, or another exact backend name.
- V1 claim derivation requires concrete hardware identity. CPU evidence requires a
  concrete vendor/model; GPU evidence requires a concrete GPU inventory or the
  reviewed Apple-silicon SoC identity rule in D-018.
- `heartbeat()` is the worker-start boundary; terminal nonempty completion plus
  `stats.backendDevice` is the inference/device observation boundary.
- Atlas never installs QVAC. Its contained candidate-model acquisition path
  discloses size, license, destination, cache behavior, immutable source, and hash
  before explicit consent, then verifies the local bytes. The implementation is
  unreachable in the shipped CLI while the release gate remains hardcoded false.
- The dormant local-model bridge consumes one verified pinned-artifact capability
  into an opaque single-use executor grant. Only exact frozen path/size/hash/type
  material crosses a private parent-to-child IPC bootstrap; the supervised child
  fully verifies it before local-path load, confirms QVAC reports that exact local
  model, and fully verifies it again after unload and close. This bridge is wired
  only to the CLI-private hardcoded-false composition. It does not admit a
  production profile, create a claim, upload a report, or make real execution
  available through the shipped CLI.
