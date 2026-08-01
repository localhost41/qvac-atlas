# ATLAS-022 — Executor protocol adversarial matrix

## Outcome

Expand the dormant executor's negative tests so every parser cap and lifecycle
ordering rule fails closed with path-free, schema-valid inconclusive evidence.

## Allowed scope

- `packages/qvac-executor/test/**`
- executor test fixtures only
- a production-code change only when a new test reproduces a concrete defect; any
  such change must be separately identified in the handoff

Do not wire the executor into the probe or CLI, add a production grant issuer,
install QVAC, or download a model.

## Required matrix

- malformed primitive and object messages
- extra/missing keys and unsafe values
- duplicate, skipped, reordered, and post-terminal phase events
- duplicate/early/late backend events
- noncontiguous and invalid sequences
- per-message, aggregate-byte, and event-count overflow
- hangs before and during each lifecycle phase plus the overall deadline
- root exit/code/signal combinations before, during, and after terminal phases

## Acceptance

Every case must prove the parent settles within bounded test time, returned values
contain no canary/path, `StructuredRunnerAdapter` accepts only fixed Atlas-owned
evidence, and an assembled fixture report passes `validateLocalReport`. Run the
executor and resolver suites plus `git diff --check`.
