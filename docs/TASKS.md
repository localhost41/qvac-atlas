# Task board

Updated: 2026-07-31

| Task | Owner | Model | Status | Depends on | Deliverable |
|---|---|---|---|---|---|
| ATLAS-001 | root | Sol | in progress | — | Repository control plane and initial integration branch |
| ATLAS-002 | runtime worker | Sol | ready | ATLAS-001 | Public-API runtime, model, isolation, and backend feasibility evidence |
| ATLAS-003 | schema worker | Sol | ready | ATLAS-001 | Provisional report schema, claim derivation, and privacy contract |
| ATLAS-004 | scaffold worker | Terra | ready | ATLAS-001 | Workspace, package skeleton, baseline CI, and fixture-driven checks |
| ATLAS-005 | root | Sol | pending | ATLAS-002–004 | Day 1 integration and technical-truth gate status |

## Queue rules

- No work starts without an `ATLAS-*` task and acceptance criteria.
- At most three implementation branches may be active.
- Root owns the serialized integration queue.
- A task cannot remain in progress for more than one worker shift without a commit, documented blocker, or decomposition.
- New scope requires a decision record before implementation.

