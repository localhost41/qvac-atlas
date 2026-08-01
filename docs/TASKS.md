# Task board

Updated: 2026-07-31

| Task | Owner | Model | Status | Depends on | Deliverable |
|---|---|---|---|---|---|
| ATLAS-001 | root | Sol | completed | — | Repository control plane and initial integration branch |
| ATLAS-002 | runtime worker | Sol | completed | ATLAS-001 | Public-API runtime, model, isolation, and backend feasibility evidence |
| ATLAS-003 | schema worker | Sol | completed | ATLAS-001 | Provisional report schema, claim derivation, and privacy contract |
| ATLAS-004 | scaffold worker | Terra | completed | ATLAS-001 | Workspace, package skeleton, baseline CI, and fixture-driven checks |
| ATLAS-005 | root | Sol | completed | ATLAS-002–004 | First-wave integration and NARROW technical-truth verdict |
| ATLAS-006 | review worker | Terra | completed | ATLAS-004 | Independent scaffold review and Astro telemetry correction |
| ATLAS-007 | review worker | Terra | completed | ATLAS-002 | Official Doctor and bundle-verification adapter research |
| ATLAS-008 | runtime worker | Sol | in progress | ATLAS-002 | Safe project-local QVAC SDK resolution and version boundary |
| ATLAS-009 | CLI worker | Sol | pending | ATLAS-003, ATLAS-008 | Consent, collection, Doctor adapter, isolated runner, preview, and local report write |
| ATLAS-010 | registry worker | Terra | pending | ATLAS-003 | Validated catalog builder and evidence-driven static registry UI |
| ATLAS-011 | contribution worker | Terra | pending | ATLAS-003, ATLAS-010 | Report admission, PR template, CI validation, and trusted source metadata |
| ATLAS-012 | security reviewer | Sol | pending | ATLAS-009–011 | Adversarial integration, privacy, process, and claim review |
| ATLAS-013 | real-device gate | root + volunteer | pending capacity | ATLAS-009 | Hash-verified Node 22/macOS QVAC lifecycle run |
| ATLAS-014 | Windows gate | volunteer | pending hardware | ATLAS-009 | Real Windows process containment and lifecycle validation |

## Queue rules

- No work starts without an `ATLAS-*` task and acceptance criteria.
- At most three implementation branches may be active.
- Root owns the serialized integration queue.
- A task cannot remain in progress for more than one worker shift without a commit, documented blocker, or decomposition.
- New scope requires a decision record before implementation.
- A blocked real-device gate does not stop fixture-driven implementation, but no
  genuine report or platform support claim may bypass it.
