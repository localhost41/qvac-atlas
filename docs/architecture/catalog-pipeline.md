# Catalog pipeline

## Trust boundary

The static registry is a deterministic projection of reviewed Git data:

```text
registry/catalog.json (trusted source metadata and profile allowlists)
  + report JSON (untrusted contributor evidence)
  -> schema + semantic + privacy + publication validation
  -> schema-owned report and aggregate claim derivation
  -> deterministic catalog JSON
  -> static Astro pages
```

`sourceKey`, source classification, and profile admission live in
`registry/catalog.json`; they are never accepted from a report. Genuine report
paths use the cross-platform form `reports/v1/sha256-<64 lowercase hex>.json`,
which must map exactly to the validated `sha256:<same hex>` report ID. Fixtures are confined to
`reports/fixtures/` or the schema package's fixture corpus. Path traversal and a
source-kind/provenance mismatch fail admission.

Every report passes `validatePublishableReport()` before it reaches presentation.
That one gate combines strict JSON Schema validation, canonical report identity,
semantic checks, privacy scanning, fingerprint acknowledgement, and publication
consent. Admission errors expose only paths and rule identifiers, not rejected
values.

## Profile admission

Production and fixture profile allowlists are separate trusted metadata. Every
descriptor must contain the immutable profile identity, requested generic device,
and an explicit `test_only` marker. Production requires `false`; fixtures require
`true`. Duplicate identities and identities appearing in both lists fail closed.

The production allowlist is empty until the real-device gate succeeds. A profile
named by contributor evidence is not made standard by that name. Exact profile and
requested-device matching is applied before calling schema-owned claim derivation.

## Claims and fixture segregation

`@qvac-atlas/schema` exclusively derives report observations and aggregate claims.
The catalog does not accept a contributor-authored badge, status, recommendation,
or display override. Aggregation uses the full compatibility key and requires
distinct trusted `sourceKey` values and report IDs for reproduced success.

Fixture provenance always derives `unknown`. Fixture records are stored in the
catalog's `fixtures` collection, never `reports` or `claims`, and appear only in a
clearly marked fixture lab. They exercise the complete validation and rendering
path without becoming public compatibility evidence.

Duplicate report IDs or report paths fail the build. Corrections therefore require
a new report identity and future trusted supersession metadata rather than silently
replacing evidence.

## Determinism and rendering

The builder sorts configured paths, report IDs, compatibility groups, evidence
links, and claim IDs. Claim IDs are SHA-256 hashes of schema-owned compatibility
keys. Catalog serialization uses the schema package's canonical JSON serializer and
contains no wall-clock build timestamp. Rebuilding from reordered inputs produces
byte-identical output.

Astro generates static HTML only. The filter is a small local script that toggles
already-rendered records; there is no network API, analytics, account state, or
backend. Report fields are interpolated as text and never passed to raw-HTML,
Markdown, style, or script directives. Detail pages show the exact validated JSON
as escaped text together with derivation reasons and evidence limitations.

## Build command

`node scripts/build-catalog.mjs` writes
`apps/site/src/generated/catalog.json`. The generated catalog is checked in so
typechecking is possible from a frozen install. CI must rebuild it and reject a
working-tree diff, ensuring the reviewed registry metadata, reports, and static
input cannot drift.
