# Fourteen-day delivery roadmap

This is the execution map, not a feature wish list. `docs/TASKS.md` owns the live
task state and `docs/STATUS.md` owns verified truth.

| Build day | Outcome | Exit gate |
|---|---|---|
| 1 | Charter, repository control plane, scaffolds | Scope and non-goals committed |
| 2 | Runtime, model, schema, and privacy feasibility | Technical-truth verdict recorded |
| 3 | Project-local QVAC discovery and isolated runner adapter | Missing/unsupported SDK paths deterministic |
| 4 | Allowlisted platform collection and official Doctor adapter | No raw command output enters reports |
| 5 | Consent, download disclosure, report preview/write | One fixture-driven local report validates |
| 6 | Validated Git catalog builder | Invalid or fixture evidence cannot enter claims |
| 7 | Searchable static registry and evidence detail | Every badge links to its exact evidence/limits |
| 8 | Contribution templates and CI admission | Reports validate from a clean frozen install |
| 9 | Crash, timeout, hostile IPC, secret/path corpus | Parent survives and privacy suite stays green |
| 10 | Golden path on supported real hardware | Hash-verified QVAC lifecycle report succeeds |
| 11 | Feature freeze and independent security review | No open release-blocking finding |
| 12 | Small consented beta across distinct devices | Genuine reports remain reviewable and honest |
| 13 | Fixes, documentation, accessibility, performance | Fresh-install rehearsal passes |
| 14 | Release candidate and launch handoff | Human approval for external publish/deploy |

## Worker cadence

- At most three implementation branches run concurrently.
- Every branch has one `ATLAS-*` packet, allowed paths, acceptance commands, and a
  commit-based handoff.
- Sol handles architecture, runtime, security, schema semantics, and release
  integration. Terra handles bounded scaffolding, UI, fixtures, docs, and audits.
- Root serializes integration, regenerates the only lockfile, and runs the complete
  workspace gate after every wave.
- Chat updates are notifications. Decisions, task state, blockers, and verification
  results are committed here before a shift ends.

## Release discipline

No worker may publish a package, create an external repository, deploy a site, post
to Discord, or accept a genuine compatibility claim without explicit human
authorization. Fixture-driven implementation continues while real-device gates are
pending, but fixtures remain visibly non-claims at every layer.
