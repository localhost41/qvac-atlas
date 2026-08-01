# ATLAS-030 — Trusted evidence lifecycle

Status: completed

## Scope

Implement the contract that accepted reports are append-only while ordinary
corrections supersede and ordinary withdrawals delist rather than mutate evidence.
Secret-bearing incidents remain a separate host-authority history-remediation path;
there is no contributor-controlled bypass.

Allowed paths:

- `registry/catalog.json`
- `packages/catalog/src/**`
- `packages/catalog/test/**`
- generated catalog types and site pages/tests only as required by a versioned
  catalog shape
- contributor, architecture, and incident documentation

## Acceptance

- Trusted metadata has an exact, versioned `active|superseded|withdrawn` lifecycle.
  Every retained genuine report remains mapped exactly once and append-only.
- Only active genuine reports enter current report pages, compatibility groups,
  source counts, and claims. Retired reports cannot create success, failure, mixed,
  or reproduced status.
- A superseded report names one existing active genuine replacement with the same
  opaque source-independence key. Self-reference, dangling targets, cross-source
  replacement, chains/cycles, fixture retirement, and unsupported fields fail
  closed and deterministically.
- Current generated output may expose only a minimal non-sensitive retirement
  record; it must not republish retired report hardware, paths, source keys, or raw
  report JSON.
- Genuine source keys use a documented opaque repository-scoped format and cannot
  contain names, emails, organizations, PR numbers, report IDs, or device IDs.
- Ordinary correction/withdrawal and exceptional secret-remediation procedures are
  documented without weakening exact-history CI.
- Tests prove inactive evidence exclusion, replacement integrity, deterministic
  output, and fixture isolation.

Do not add a UI/API switch, contributor field, environment bypass, or history
mutation command. Run catalog/site tests, contribution audits, generated drift,
formatting, and the full workspace gate.
