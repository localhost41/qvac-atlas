# Task board

Updated: 2026-08-01

| Task       | Owner               | Model            | Status           | Depends on                      | Deliverable                                                                                                 |
| ---------- | ------------------- | ---------------- | ---------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ATLAS-001  | root                | Sol              | completed        | —                               | Repository control plane and initial integration branch                                                     |
| ATLAS-002  | runtime worker      | Sol              | completed        | ATLAS-001                       | Public-API runtime, model, isolation, and backend feasibility evidence                                      |
| ATLAS-003  | schema worker       | Sol              | completed        | ATLAS-001                       | Provisional report schema, claim derivation, and privacy contract                                           |
| ATLAS-004  | scaffold worker     | Terra            | completed        | ATLAS-001                       | Workspace, package skeleton, baseline CI, and fixture-driven checks                                         |
| ATLAS-005  | root                | Sol              | completed        | ATLAS-002–004                   | First-wave integration and NARROW technical-truth verdict                                                   |
| ATLAS-006  | review worker       | Terra            | completed        | ATLAS-004                       | Independent scaffold review and Astro telemetry correction                                                  |
| ATLAS-007  | review worker       | Terra            | completed        | ATLAS-002                       | Official Doctor and bundle-verification adapter research                                                    |
| ATLAS-008  | runtime worker      | Sol              | completed        | ATLAS-002                       | Safe project-local QVAC SDK resolution and version boundary                                                 |
| ATLAS-009  | CLI worker          | Sol              | completed        | ATLAS-003, ATLAS-008            | Consent, collection, Doctor adapter, isolated fixture runner, preview, and local report write               |
| ATLAS-010  | registry worker     | Terra            | completed        | ATLAS-003                       | Validated catalog builder and evidence-driven static registry UI                                            |
| ATLAS-011  | contribution worker | Terra            | completed        | ATLAS-003, ATLAS-010            | Report admission audit, PR template, CI validation, and trusted source metadata                             |
| ATLAS-012  | security reviewers  | Sol              | completed        | ATLAS-009–011                   | Adversarial integration, privacy, process, resolver, and claim review                                       |
| ATLAS-012A | resolver worker     | Sol              | completed        | ATLAS-012                       | Close child-listener and bounded cleanup races in the SDK bootstrap handoff                                 |
| ATLAS-012B | catalog worker      | Terra            | completed        | ATLAS-012                       | Descriptor-safe reads, canonical source boundaries, and end-to-end injection coverage                       |
| ATLAS-012C | schema worker       | Sol              | completed        | ATLAS-012                       | Central V1 claim-evidence and path-free genuine-report gate                                                 |
| ATLAS-013  | real-device gate    | root + volunteer | pending physical | ATLAS-021D                      | Human-approved, commit-pinned Node 22/macOS physical-validation protocol and lifecycle/privacy verdict      |
| ATLAS-014  | Windows gate        | volunteer        | pending hardware | ATLAS-009                       | Real Windows process containment and lifecycle validation                                                   |
| ATLAS-015  | resolver worker     | Sol              | completed        | ATLAS-008                       | Fail-closed SDK resolver, opaque grant, and isolated-child bootstrap                                        |
| ATLAS-016  | architecture worker | Sol              | completed        | ATLAS-009, ATLAS-012, ATLAS-015 | Production-executor architecture and consent-boundary work packet                                           |
| ATLAS-016A | runtime worker      | Sol              | completed        | ATLAS-016                       | Dormant resolver-to-executor lifecycle with synthetic SDK, process-group containment, and hostile tests     |
| ATLAS-016B | research worker     | Terra            | completed        | ATLAS-016                       | Tag-scoped local-artifact, download, cache, hash, and cleanup evidence for a future production model grant  |
| ATLAS-016C | quality worker      | Sol              | completed        | ATLAS-016A                      | Independent terminal-state, containment, privacy, and schema-validity audit of the dormant executor         |
| ATLAS-017  | schema worker       | Sol              | completed        | ATLAS-003, ATLAS-012            | Replace provisional handwritten report types with schema-derived types and drift checks                     |
| ATLAS-018  | release captain     | Sol + human      | pending          | ATLAS-011, ATLAS-012            | Configure and verify protected maintainer ownership for profile and source-independence metadata            |
| ATLAS-019  | artifact worker     | Sol              | completed        | ATLAS-016B                      | Dormant consent-capability and private artifact acquisition/validation package; no probe or CLI wiring      |
| ATLAS-020  | executor worker     | Sol              | completed        | ATLAS-019                       | Bind a consumed verified local-artifact grant to the isolated child, loaded-path check, and post-run hash   |
| ATLAS-021  | release captain     | Sol              | pending physical | ATLAS-020                       | Dormant real-mode activation program; hard-gated and claim-ineligible until ATLAS-013                       |
| ATLAS-021A | artifact worker     | Sol              | completed        | ATLAS-020                       | Manual redirect authority, crash-recoverable staging, and contained acquisition child                       |
| ATLAS-021B | probe worker        | Sol              | completed        | ATLAS-021A                      | Genuine candidate report assembly and dependency-inverted real consent/state pipeline                       |
| ATLAS-021C | CLI worker          | Sol              | completed        | ATLAS-021B                      | Concrete cwd resolver/Doctor/artifact/executor wiring behind a hardcoded false release gate                 |
| ATLAS-021D | quality workers     | Sol + Terra      | completed        | ATLAS-021C                      | Independent activation, containment, privacy, UX, and reproducibility acceptance                            |
| ATLAS-022  | quality worker      | Terra            | completed        | ATLAS-016A                      | Expanded hostile IPC, cap, ordering, post-terminal, and phase-timeout regression matrix                     |
| ATLAS-023  | metadata worker     | Terra            | completed        | ATLAS-021D                      | Replace stale unimplemented-consent candidate prose without changing status, version, eligibility, or pins  |
| ATLAS-024  | admission worker    | Sol              | completed        | ATLAS-011, ATLAS-012B           | Base-revision append-only genuine-report enforcement in local audit and CI, with adversarial tests          |
| ATLAS-025  | site worker         | Terra            | completed        | ATLAS-010, ATLAS-012C           | Accessible aggregate claim-state rendering and complete public state-matrix tests                           |
| ATLAS-026  | docs worker         | Terra            | completed        | ATLAS-011                       | Fixture-only submission status, incident/removal guidance, and automated contributor-doc checks             |
| ATLAS-027  | release captain     | Sol              | completed        | ATLAS-021D                      | Truthful zero-effect CLI help, removal of dead scaffold surfaces, and implementation-status copy cleanup    |
| ATLAS-028  | privacy worker      | Sol              | completed        | ATLAS-012C, ATLAS-021B          | IPv6, UUID, version-field, IPv4, and redaction-count privacy hardening with end-to-end rejection tests      |
| ATLAS-029  | claim worker        | Sol              | completed        | ATLAS-012C, ATLAS-025           | Preserve failed fallback observation without misattributing failure to the requested device                 |
| ATLAS-030  | catalog worker      | Sol              | completed        | ATLAS-024, ATLAS-026            | Trusted active/superseded/withdrawn evidence lifecycle that excludes retired reports from current claims    |
| ATLAS-031  | operations worker   | Terra            | completed        | ATLAS-021D, ATLAS-026           | Exact Node-22 toolchain, one-command local readiness, activation checklist, and incident/admission runbooks |
| ATLAS-032  | quality worker      | Sol              | completed        | ATLAS-024                       | History-wide append-only proof that rejects intermediate mutation, deletion, or type/mode drift             |

## Queue rules

- No work starts without an `ATLAS-*` task and acceptance criteria.
- At most three implementation branches may be active.
- Root owns the serialized integration queue.
- A task cannot remain in progress for more than one worker shift without a commit, documented blocker, or decomposition.
- New scope requires a decision record before implementation.
- A blocked real-device gate does not stop fixture-driven implementation, but no
  genuine report or platform support claim may bypass it.
