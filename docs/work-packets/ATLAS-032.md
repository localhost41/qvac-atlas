# ATLAS-032 — History-wide append-only proof

Status: queued

## Scope

Strengthen exact Git history validation so an accepted report cannot be modified,
deleted, renamed, or type/mode-changed in an intermediate commit and restored at
the final target.

Allowed paths:

- `packages/catalog/src/append-only.js`
- `packages/catalog/test/append-only.test.js`
- `scripts/validate-contribution.mjs`
- `.github/workflows/ci.yml` only if exact revision wiring must change
- append-only architecture/maintainer documentation

## Acceptance

- For every relevant introduced parent-child edge, a trusted-base report present
  at its trusted blob/mode/type identity remains identical in the child.
- Linear multi-commit pushes and PR merge histories reject intermediate modify,
  delete, rename, symlink/type, or mode drift even if the target restores the
  endpoint bytes.
- A PR branch forked before a later base report does not falsely need that report
  until the synthetic merge/base edge introduces it.
- Traversal is bounded, deterministic, exact-revision-based, path-free in errors,
  and fails closed on unavailable or ambiguous history.
- Existing endpoint, dirty-tree, nonancestor, all-zero, and canonical-addition
  protections remain intact.

Run all adversarial synthetic Git tests, exact contribution audits, formatting,
and the full workspace gate.
