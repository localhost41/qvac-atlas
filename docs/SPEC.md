# V1 contract

Status: **provisional until the Day 2 technical-truth gate**.

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

- JSON Schema is normative; language types are generated.
- Reports have separate schema, probe, QVAC, and profile versions.
- Unknown and skipped are explicit; absence is not interpreted as failure.
- Canonical JSON is deterministic across supported operating systems.
- Accepted reports are append-only; corrections supersede rather than mutate.
- Claim-producing statuses are derived from structured evidence.
- Contributor HTML, scripts, styles, or arbitrary Markdown are never rendered.

## Privacy boundary

Collection is allowlist-first. Never collect environment values, tokens, cookies, auth headers, usernames, home directories, hostnames, organization names, network addresses, serial numbers, stable machine identifiers, process lists, shell history, arbitrary prompts, generated content, full configs, full logs, or absolute model paths.

The hardware/OS combination may itself be identifying. Publication therefore requires an explicit preview and separate consent.

## Day 2 unresolved feasibility questions

1. Which current small QVAC model is appropriate, licensed, stable, and acceptably sized?
2. Can public QVAC APIs directly expose the actual inference backend?
3. Which public API boundary reliably proves worker startup?
4. What is the supported Node/QVAC version matrix for V1?
5. What model-download consent and cache behavior can be implemented without mutating user configuration?

