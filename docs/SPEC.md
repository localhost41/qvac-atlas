# V1 contract

Status: **versioned V1 contract; fixture foundation implemented, production gated**.

## Product boundary

```text
local probe -> canonical report -> reviewed Git data -> static registry
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
- OS family/version and architecture.
- CPU/GPU identity and relevant driver/backend version.
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
```

All runtime phases have deadlines. Failure finalization retains only structured phase results, exit metadata, requested backend, directly observed backend, and a bounded sanitized failure excerpt.

## Report principles

- JSON Schema is normative. Runtime schema and semantic validation is mandatory;
  provisional handwritten TypeScript assembly types remain until ATLAS-017 replaces
  them with schema-derived types and drift checks.
- Reports have separate schema, probe, QVAC, and profile versions.
- Unknown and skipped are explicit; absence is not interpreted as failure.
- Canonical JSON is deterministic across supported operating systems.
- Accepted reports are append-only; corrections supersede rather than mutate.
- Claim-producing statuses are derived from structured evidence.
- Contributor HTML, scripts, styles, or arbitrary Markdown are never rendered.

## Privacy boundary

Collection is allowlist-first. Never collect environment values, tokens, cookies, auth headers, usernames, home directories, hostnames, organization names, network addresses, serial numbers, stable machine identifiers, process lists, shell history, arbitrary prompts, generated content, full configs, full logs, or absolute model paths.

The hardware/OS combination may itself be identifying. Publication therefore requires an explicit preview and separate consent.

## Resolved feasibility boundary

- V1 targets Node 22 and exact project-local `@qvac/sdk` 0.16.0 only.
- The source-verified candidate is SmolLM2 360M Instruct Q8, pinned by revision,
  386,404,992-byte size, SHA-256, and Apache-2.0 license. It is not claim-eligible
  until a local hash-verified lifecycle succeeds.
- Published QVAC 0.16.0 directly reports only actual `cpu|gpu` device class for LLM
  completion, not Metal, CUDA, Vulkan, OpenCL, or another exact backend name.
- `heartbeat()` is the worker-start boundary; terminal nonempty completion plus
  `stats.backendDevice` is the inference/device observation boundary.
- Atlas never installs QVAC. Any future model download requires a separate size,
  license, destination, and cache disclosure plus explicit consent and local hash
  verification. No such production downloader is currently enabled.
