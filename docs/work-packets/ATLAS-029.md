# ATLAS-029 — Requested-device failure attribution

Status: in progress

## Scope

Correct report, aggregate, and rendered claim semantics when a non-auto requested
device differs from the directly observed device and the workload fails.

Allowed paths:

- `packages/schema/src/claims.js`
- `packages/schema/test/**`
- `packages/catalog/test/**`
- `apps/site/test/**`
- claim-contract documentation and task/status updates owned by root

## Acceptance

- Requested `gpu`, directly observed `cpu`, and an otherwise defined eligible
  failure retains `observation: failure` but derives requested-device
  `claim: unknown`, `actual_backend_claim: null`, and
  `different-backend-observed`.
- The symmetric requested-CPU/observed-GPU case follows the same rule.
- Requested `auto` and same-device defined failures retain existing behavior.
- Aggregation cannot turn only mismatched-device failures into requested-device
  failure or mixed claims.
- A synthetic static card proves requested GPU, observed CPU, failure observation,
  and unknown requested-device claim are presented together without conflation.

Run schema, catalog, site, formatting, and full workspace checks.
