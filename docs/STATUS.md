# Current status

Updated: 2026-07-31

## Verified state

- Local Git repository initialized at `/Users/samaroomini/qvac-atlas`.
- V1 scope, provisional contract, non-goals, decision log, task board, and worker protocol exist.
- The protected release line is `main`; current milestone integration occurs on `integration`.
- Three isolated implementation worktrees are active for runtime feasibility, schema/privacy, and workspace scaffolding.
- No external repository, package, deployment, upload, or Discord message has been created.
- Day 1 implementation has not yet passed the technical-truth gate.

## Active milestone

M0 — Charter and technical feasibility.

## Active work

- ATLAS-001: completed the repository control plane.
- ATLAS-002: runtime/model/backend feasibility is in progress on `feat/ATLAS-002-runtime`.
- ATLAS-003: report/privacy contract is in progress on `feat/ATLAS-003-schema`.
- ATLAS-004: workspace/CI skeleton is in progress on `feat/ATLAS-004-scaffold`.

## Next integration gate

The release captain will integrate the first worker wave, run the complete repository checks, and record whether the Day 2 feasibility questions are answered or still explicitly unknown.

## Known risks

- Actual backend selection may not be exposed reliably by public QVAC APIs.
- The standardized model may be too large, insufficiently licensed, or unstable across QVAC versions.
- Windows process-tree cleanup needs early real validation.
- Real launch evidence requires volunteer physical devices; CI runners are not GPU compatibility evidence.
