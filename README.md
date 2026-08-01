# QVAC Atlas

QVAC Atlas is an evidence-backed hardware compatibility registry for QVAC.

The V1 workflow is deliberately narrow:

```text
consented local probe
  -> sanitized, versioned JSON report
  -> reviewed Git contribution
  -> static compatibility registry
```

Atlas is not a replacement for `qvac doctor`. It uses official QVAC diagnostics as evidence, then records whether one pinned workload actually started, which backend was directly observed, and whether it completed.

## Project status

The fixture-driven vertical slice is implemented: consent ordering, report
validation, a fail-closed project-local SDK resolver, deterministic Git admission,
and the static registry all pass the workspace gate. The CLI deliberately exposes
only synthetic scenarios today.

Real QVAC execution, model download, production-profile admission, genuine claims,
publishing, and deployment remain disabled. A real lifecycle needs an existing
project-local QVAC SDK, enough disk for its multi-gigabyte dependency graph and the
386,404,992-byte pinned model, then explicit human review. Do not describe the
current fixture registry as hardware compatibility evidence.

See [`docs/PROJECT.md`](docs/PROJECT.md) for the immutable V1 boundary and [`docs/STATUS.md`](docs/STATUS.md) for the current verified state.

## Verify the repository

Use Node 22 and the pinned pnpm version:

```bash
pnpm install --frozen-lockfile
node scripts/validate-contribution.mjs
pnpm check
node scripts/build-catalog.mjs
git diff --exit-code -- apps/site/src/generated/catalog.json
```
