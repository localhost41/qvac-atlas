# Decision log

## D-001 — Git-native static product

Atlas V1 stores reviewed reports in Git and builds a static site. There is no application backend, account system, or service database.

## D-002 — Local-only default

`probe` writes locally and uploads nothing. Publication is a separate explicit action after a human-readable preview.

## D-003 — One immutable workload profile

V1 uses one pinned small-LLM lifecycle profile. Once reports reference it, its behavior and artifact hash are immutable.

## D-004 — Evidence before claims

Atlas never infers an actual backend from installed APIs, requested configuration, or hardware presence. Unsupported observation is recorded as `unknown`.

## D-005 — Official QVAC tools are inputs

Atlas calls Doctor, bundle verification, diagnostics, and resource APIs where available. It does not copy their rules or present itself as a replacement.

## D-006 — Repository is project memory

Scope, current state, tasks, decisions, verification, and handoffs must be durable in the repository. Chat messages are notifications, not authoritative state.

## D-007 — Serialized integration

Workers use isolated worktrees and never merge their own changes. A Sol release captain integrates only after task acceptance checks pass.

