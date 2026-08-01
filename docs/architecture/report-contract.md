# Report contract

Status: provisional for schema `1.0.0` pending the technical-truth gate.

## Authority and boundaries

`packages/schema/schemas/report.schema.json` is the normative report contract.
Generated language types and UI models must follow it; they do not extend it. The
schema uses `additionalProperties: false` at every object boundary so a collector,
contributor, or pull request cannot add undocumented data.

A report is immutable evidence from one execution. It deliberately contains no
public claim, badge, score, recommendation, troubleshooting advice, contributor
identity, or arbitrary metadata. The registry derives claims from validated
evidence. Accepted corrections create a new report and supersession metadata in a
trusted registry layer rather than modifying the original report.

The contract has four separate version dimensions:

- `schema_version` controls the serialized contract.
- `probe_version` identifies collection and isolation behavior.
- `qvac.sdk_version` identifies the QVAC SDK actually discovered.
- `profile.id`, `profile.version`, and `profile.artifact_sha256` identify the
  immutable workload.

An additive optional schema change increments the schema minor version. A changed
meaning, required field, enum meaning, or representation increments the major
version. Consumers reject unknown majors. No result carries forward to a new QVAC,
probe, schema, or workload profile version.

## Evidence model

The schema records these evidence groups:

- Publication consent and explicit hardware-fingerprint acknowledgement.
- Coarsened, allowlisted OS, architecture, CPU, memory, and GPU inventory.
- Node and exact discovered QVAC package versions.
- Structured outcomes of official Doctor and conditional bundle verification.
- An immutable workload profile and requested device.
- Ordered lifecycle phases, bounded integer durations, isolated-process
  termination, and directly observed completion device.
- Workload completion or a bounded, structured failure.
- Sanitizer policy/version and redaction counts, never redacted values.

QVAC's current public evidence boundary is intentionally represented as:

```text
requested_backend = auto | cpu | gpu
observed backend  = cpu | gpu | unknown | null
```

An OS GPU API or installed driver can be inventory or capability evidence, but it
does not prove which backend executed. Atlas must not translate generic `gpu`
completion evidence into Metal, CUDA, or Vulkan.

## Explicit states

Phase/check states are:

- `passed`: the phase ran and met its contract; an integer duration is required.
- `failed`: the phase ran and produced a defined failure; a duration is required.
- `skipped`: the phase intentionally did not run; duration must be `null`.
- `unknown`: available evidence cannot establish the state; duration must be
  `null`.

Skipped and unknown are never interpreted as success or failure. Missing QVAC is a
useful local observation but cannot become a compatibility claim because no exact
QVAC version executed.

Backend observation has its own state. Only `status: observed`, a non-unknown
`cpu|gpu` backend, and one of the allowlisted direct methods is claim-producing.
Hardware presence, requested configuration, Doctor output, or inference timing
cannot fill this field by inference.

## Deterministic canonicalization and identity

`canonicalize()` accepts JSON values only and:

1. Sorts object keys lexicographically.
2. Preserves array order.
3. Emits UTF-8 JSON with no insignificant whitespace.
4. Rejects `undefined`, non-finite numbers, negative zero, class instances, and
   other non-JSON values.

The schema uses integers for claim-producing measurements, avoiding float
serialization differences. Semantically unordered collections are required to use
deterministic order: CPU feature flags lexicographically, GPUs by unique ascending
index, QVAC packages by `name@version`, and phases in lifecycle order.

`report_id` is:

```text
sha256:<hex SHA-256 of canonical JSON after removing report_id and consent.publication>
```

Publication consent is transport/review metadata, so toggling it does not change the
evidence identity. Fingerprint acknowledgement remains covered. The ID covers the
timestamp, collected evidence, provenance, fingerprint acknowledgement, and privacy
metadata. Changing any of them changes the ID. Reordering object keys does not.
Report files are UTF-8 JSON; canonicalization is performed on the parsed value, so
platform line endings do not affect identity.

## Derived observations and claims

Report-level derivation returns two concepts:

- `observation`: `success`, `fallback`, `failure`, or `inconclusive`.
- `claim`: `observed-success`, `observed-failure`, or `unknown`.

Aggregate registry derivation may additionally return `reproduced-success` or
`mixed`.

The rules are deliberately conservative:

| Evidence | Observation | Requested-device claim | Actual-device evidence |
|---|---|---|---|
| Standard workload completed; requested device directly observed | success | observed-success | observed-success |
| Standard workload completed; a different device directly observed | fallback | unknown | observed-success |
| Standard workload on an exact QVAC version produced a defined runtime failure | failure | observed-failure | none |
| Missing QVAC, skipped work, unknown result, unobserved backend, or nonstandard profile | inconclusive | unknown | none |

Doctor success alone is never sufficient. A completed GPU request observed on CPU
is useful fallback evidence but not GPU success.

`reproduced-success` requires at least two successful reports with different
trusted registry `sourceKey` values and different report IDs. Source independence
is not stored in, or accepted from, contributor-authored report JSON. `mixed`
requires compatible success and failure evidence. Aggregate functions reject
reports with different compatibility keys.

Any report with `provenance.kind: fixture` always derives `unknown`, never an
observed success or failure. Fixture reports cannot contribute to reproduced or
mixed aggregate claims, regardless of their otherwise valid evidence fields.

## Compatibility key

The provisional compatibility key includes exact:

- Probe version and QVAC SDK version.
- Profile identity, version, artifact hash, and requested device.
- OS, architecture, CPU, memory bucket, GPU inventory, and driver details.
- Directly observed generic completion backend.

It excludes report ID, timestamp, consent, failure text, redaction counts, and
provenance. A site may offer broader search facets, but it must not merge those
facets into a stronger compatibility claim.

## Profile admission

Production claim derivation receives a trusted allowlist of immutable profile
descriptors. A report cannot make its own profile standard merely by naming it.
`profiles/fixtures/atlas-small-llm-lifecycle-test.json` exists only for contract
tests. The production V1 profile remains absent until ATLAS-002 verifies its
artifact, license, download boundary, QVAC API, and direct backend observation.

## Validation layers

Publication requires all of the following:

1. Strict JSON Schema 2020-12 validation.
2. Canonical report-ID verification.
3. Semantic ordering, duration, discovery, termination, and completion checks.
4. Defense-in-depth privacy scanning.
5. Explicit publication and fingerprint consent.
6. Claim derivation against a trusted production profile allowlist.
7. Human review before Git-backed acceptance.

The schema validator returns paths, rule identifiers, and generic messages. It does
not echo suspect values into CI logs.
