# ATLAS-033 — Release-candidate and physical-evidence review

Status: code review remediated; independent human review and conforming rerun pending

## Scope

Perform an evidence-backed release-candidate review of the exact frozen Atlas
integration candidate and the private macOS physical-run artifact. This task may
adjudicate and remediate defects, but it cannot activate real mode, admit a
production profile or report, publish any artifact, or substitute model review for
the required independent human verdict.

The review covers architecture and containment, privacy and evidence integrity,
operations and reproducibility, governance and release sequencing, and consistency
between the macOS-only V1 decision and durable release requirements.

Allowed paths:

- `docs/work-packets/ATLAS-033.md`
- `docs/reviews/ATLAS-033-*`
- `docs/TASKS.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and
  `docs/RELEASE-CHECKLIST.md` for accepted review outcomes
- implementation and test files only for a confirmed finding whose remediation is
  recorded in the review report
- the operator-controlled private review manifest and reviewer packet, which must
  remain outside Git with private file permissions

## Frozen inputs

- Integration candidate: `1653b23df9e1b3bdc5e387c4a15b61dd059c4484`
- Physical-run Atlas base: `7157ed71ea3424ad9f15784ab1defb1b510ceb04`
- Physical seam: one uncommitted reviewed `false` to `true` token change in
  `packages/cli/src/bin.ts`
- QVAC SDK: exact `0.16.0`
- Profile: `atlas-smollm2-360m-lifecycle@1.0.0-candidate.1`
- Artifact SHA-256:
  `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`
- Report and local-file digests are held only in the private manifest.

## Acceptance

- Independent Sol xhigh architecture, privacy/evidence, and operations/release
  passes cite exact code, tests, or durable requirements for every finding.
- The release captain separates code defects, documentation contradictions,
  environment limitations, human trust gates, and external publication gates.
- The physical run is classified precisely: engineering validation, ATLAS-013
  acceptance evidence, claim-eligible evidence, or rejected evidence are not
  conflated.
- Publication intent false, canonical report identity, schema validity, local file
  privacy, artifact identity, and non-upload status are verified without committing
  the private report.
- Confirmed critical/high defects are fixed and regression-tested. Any change that
  affects the exercised real path explicitly invalidates the old run for release
  acceptance and requires a new physical ceremony.
- macOS-only scope and Windows refusal/support requirements are reconciled in the
  contract, decision log, task board, and release checklist.
- A frozen install, complete local readiness command, deterministic rebuild, and
  clean-tree check pass on the final candidate, or the exact blocker is recorded.
- The human reviewer receives a private, read-only, nontechnical checklist and can
  return an explicit approve/hold verdict without publishing the report.
