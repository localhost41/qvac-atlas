# ATLAS-028 — Privacy scanner and redaction integrity

Status: completed

## Scope

Close demonstrated privacy-admission bypasses without weakening schema identity,
canonical report IDs, or the no-value-echo error contract. Propagate truthful
redaction counts from allowlisted platform collection into genuine report assembly.

Allowed paths:

- `packages/schema/src/privacy.js`
- `packages/schema/fixtures/adversarial/**`
- `packages/schema/test/**`
- `packages/probe/src/platform.ts`
- `packages/probe/src/report.ts`
- the minimum probe types/pipeline/tests required to carry redaction counts
- `packages/catalog/test/**` for end-to-end admission rejection

## Acceptance

- Detect bounded full, compressed, bracketed, and zone-qualified IPv6 forms plus
  canonical UUID/stable-ID values anywhere in contributor-controlled strings.
- Replace suffix-wide hash/version entropy exemptions with exact schema-constrained
  pointer exemptions. Free-form OS and driver versions remain scanned.
- A dotted-quad network value cannot bypass scanning merely because it occurs at
  `driver_version`; ambiguous four-part values fail closed.
- Refreshed-ID genuine probe reports containing each canary fail publishable and
  catalog admission without the suspect value appearing in errors.
- Platform values replaced by `unknown` increment the applicable bounded
  `credentials|identifiers|network|paths` counts; assembly must not hardcode zeros.
- Existing safe fixtures remain valid and deterministic.

Run schema, probe, and catalog tests plus formatting and the full workspace gate.
