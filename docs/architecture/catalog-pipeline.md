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

Registry metadata version 2 owns `sourceKey`, independence classification,
genuine-source lifecycle, and profile admission; none is accepted from a report. Genuine report
paths use the cross-platform form `reports/v1/sha256-<64 lowercase hex>.json`,
which must map exactly to the validated `sha256:<same hex>` report ID. Fixtures are
confined to `reports/fixtures/` or the schema package's fixture corpus. Source paths
must be bounded canonical repository-relative POSIX paths. Empty, `.`, `..`,
backslash, absolute, non-ASCII, and otherwise ambiguous segments fail before
filesystem access. The canonical final report file must remain beneath the
canonical physical allowed directory; lexical prefixes alone never grant trust. A
source-kind/provenance mismatch also fails admission.

Every report passes `validatePublishableReport()` before it reaches presentation.
That one gate combines strict JSON Schema validation, canonical report identity,
semantic checks, privacy scanning, fingerprint acknowledgement, and publication
consent. Admission errors expose only paths and rule identifiers, not rejected
values.

Claim derivation additionally passes every genuine report through one schema-owned
V1 evidence evaluator. A success requires Node 22, passed QVAC discovery, exact
`@qvac/sdk` 0.16.0 evidence, exactly one trusted profile, the five complete passed
lifecycle phases, directly observed generic `cpu|gpu` execution after inference,
and clean shutdown/termination. A defined failure requires that same runtime and
profile boundary plus a present failed phase, all prior phases passed, no later
attempted phase, and correlated failure category, phase, and termination. Missing,
unsupported, unsafe, or incomplete evidence remains `unknown`; aggregate claims
reuse the same report evaluator and cannot promote it.

`workload-failed` may correlate with a nonzero exit or a clean process exit because
the QVAC API can directly return a workload error. Worker crashes still require a
signal/nonzero exit, timeouts require timeout termination, and spawn failures
require spawn-error termination.

Genuine reports cannot retain a failure excerpt. Fixtures may retain synthetic
excerpts to exercise rendering, but production runner IPC accepts only `null`.
Privacy scanning also rejects generic POSIX, drive-letter, and UNC absolute paths
as defense in depth.

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
Accountless reports are bound to `unverified-anonymous` and the single reserved
`source:anonymous-relay` key, so any number contributes at most one source.

Fixture provenance always derives `unknown`. Fixture records are stored in the
catalog's `fixtures` collection, never `reports` or `claims`, and appear only in a
clearly marked fixture lab. They exercise the complete validation and rendering
path without becoming public compatibility evidence.

Duplicate report IDs or report paths fail the build. Corrections therefore require
a new report identity and trusted supersession metadata rather than silently
replacing evidence.

## Genuine evidence lifecycle

Every genuine source has exactly one trusted lifecycle object:

- `{"state":"active"}` includes the report in current report pages and claim
  aggregation.
- `{"state":"superseded","replacementPath":"reports/v1/sha256-….json"}`
  retires a corrected report in favor of one directly named active genuine report.
- `{"state":"withdrawn"}` delists ordinary withdrawn evidence without deleting its
  append-only report.

A replacement must exist, be active, and use the same opaque source-independence
key. Self-reference, cross-source replacement, chains, cycles, dangling targets,
unknown states, extra fields, and fixture lifecycle fields fail closed. All retained
genuine reports, including retired reports, still pass the complete report,
profile, path, tracking, and append-only admission gates.

Reviewed independent-source evidence uses `source:<32 lowercase hex>`, an opaque
repository-scoped 128-bit token assigned by maintainers. It must not encode or be
derived from a name, account, email, organization, PR/report number, or
hardware/device identifier. Accountless evidence instead requires the exact
`source:anonymous-relay` key and is visibly labeled unverified; catalog validation
rejects cross-class key pairing. Fixture keys remain separately namespaced under
`fixture:` and cannot satisfy the genuine key contract.

Only active genuine sources cross the presentation boundary; generated output has
no retirement collection. It never republishes a retired report's hardware, report
JSON, source path, or report ID. A source key shared with an active replacement
appears only on that active evidence, never as a retirement record. Retired reports
are absent from static detail routes, compatibility groups, report counts, source
counts, and claims. The trusted Git metadata remains the audit record.

## Exact append-only history

Exact history admission checks every introduced parent-child edge for reports
already trusted at the explicit base. A target that restores the base blob after an
intermediate modification, deletion, type change, or mode change still fails. A
topic fork older than a newly accepted base report is not expected to contain that
report until the merge edge introduces it. Traversal is bounded and never guesses
refs or merge bases.

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

Aggregate cards keep three schema-derived concepts visibly separate: the
requested-device claim, aggregate observation, and actual-device evidence. They
also show the member reports' observations so a valid fallback remains visible
even though the requested-device aggregate claim is `unknown`, and show reviewed
report and trusted-source counts. Fixture cards use an explicit non-claim label and
never borrow genuine aggregate language. Text labels accompany every visual state;
color is never the only distinction.

## Filesystem snapshot boundary

Configuration, reports, generated catalog data, and contribution-audit reports are
read through one opened file descriptor. Atlas rejects a static final-component
symlink, opens with `O_NOFOLLOW` where the platform exposes it, validates the opened
descriptor as the same regular file observed during canonical containment checks,
and caps bytes during the descriptor read rather than trusting a preliminary file
size. It then verifies descriptor identity, size, modification/change timestamps,
the current path identity, and canonical containment again. Controlled growth,
in-place mutation, path replacement, parent escape, and symlink tests exercise
these failure paths.

This protects the CI/review use case and ensures a path replacement cannot redirect
the bytes being validated after open. It is not a transactional filesystem
snapshot. A process with write access could theoretically mutate an inode and
restore all observable metadata within an extremely narrow window, or exploit a
filesystem that provides unstable inode/timestamp semantics. Atlas therefore also
depends on the reviewed Git checkout being quiescent during validation; running the
catalog against an actively hostile mutable filesystem is outside V1's guarantee.

## Build command

`node scripts/build-catalog.mjs` writes
`apps/site/src/generated/catalog.json`. The generated catalog is checked in so
typechecking is possible from a frozen install. CI must rebuild it and reject a
working-tree diff, ensuring the reviewed registry metadata, reports, and static
input cannot drift.
