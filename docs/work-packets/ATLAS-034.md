# ATLAS-034 — Community-launch preparation program

Status: local work complete; external launch gates pending

## Objective

Turn the reviewed local Atlas implementation into a distribution-, governance-,
deployment-, and beta-ready V1 candidate without weakening evidence gates or
performing an unauthorized external publication.

## Frozen input

- Launch-preparation base:
  `58ae743c21a70c9993bfc4ef309c243c5c1c3573`
- ATLAS-033 code-review verdict: accepted after remediation
- Previous private physical attempt: engineering evidence only, formal
  `STOP / MANUAL REVIEW`
- Shipped real-mode gate: literal `false`
- Production profiles, genuine reports, and production claims: empty

## Non-negotiable boundaries

- Do not mark ATLAS-013 accepted, admit a production profile or genuine report,
  or enable the shipped real path from the previous nonconforming attempt.
- Do not create a remote repository, publish a package, deploy a site, submit a
  report, or send an announcement without explicit human authority for that
  external action.
- Atlas may be packaged, install-tested, and deployment-tested locally while its
  real gate remains false.
- Atlas must never install QVAC, upload a report, or turn publication consent into
  automatic submission.
- Do not broaden V1 beyond macOS arm64, one pinned model/workload, and the existing
  evidence vocabulary.

## Work streams

### ATLAS-034A — Installable distribution

- Choose and document the smallest supportable npm package topology.
- Replace private `0.0.0` release metadata only where needed for a local
  `0.1.0` release candidate; do not publish it.
- Produce a deterministic package artifact with the CLI, required runtime files,
  notices, and no tests, fixtures, reports, caches, secrets, or local paths.
- Install that artifact in a fresh non-workspace project with network disabled.
- Prove `qvac-atlas --help` works and the shipped real gate stays false.
- Prove the installed package does not install or resolve QVAC globally and does
  not require the Atlas monorepo.

### ATLAS-034B — Repository trust and release security

- Add CODEOWNERS coverage, security policy, support boundaries, release process,
  and dependency/update guidance using placeholders only where a human identity or
  legal decision is required.
- Extend readiness tests to reject missing ownership, floating workflow actions,
  accidental activation, and release-metadata drift.
- Prepare exact public-host bootstrap and branch-protection verification commands;
  do not create or mutate the host.
- Keep license selection, named owner identities, public contact details, and
  registry credentials as explicit human gates.

### ATLAS-034C — Site, contributor journey, and launch kit

- Make the static site build deployable from a pinned, least-privilege workflow
  while keeping deployment itself disabled or manually gated until authorized.
- Test root and subpath hosting, generated data, accessibility, responsive layout,
  evidence limitations, and fixture/genuine separation.
- Add a five-minute installation/probe/submission walkthrough that remains truthful
  while real mode and genuine submissions are disabled.
- Prepare private-beta instructions, reviewer instructions, rollback criteria,
  release notes, and draft GitHub/Discord announcements without sending them.

### ATLAS-034D — Integration and final review

- Integrate only reviewable commits based on this packet.
- Run `pnpm ready:local`, package-content audits, fresh offline installation,
  static deployment smoke tests, privacy scans, and a clean-checkout verification.
- Conduct independent architecture/security, usability/distribution, and
  operations/release reviews.
- Produce one final launch-readiness report separating completed mechanics from
  unresolved physical, legal, identity, hosting, registry, and publication gates.

## Exit criteria

- A local `0.1.0` distribution artifact installs and runs outside the monorepo.
- Repository governance and deployment assets are present and mechanically tested.
- A new contributor can follow the documented fixture-only flow without hidden
  local knowledge.
- The site can be deployed reproducibly but has not been externally deployed
  without approval.
- The final candidate remains fixture-only, real-disabled, profile-empty, and
  report-empty unless the separate formal gates are later satisfied.
- Every remaining human/external decision has an exact owner, command, and
  acceptance check rather than a vague launch TODO.

## Completion record

All locally executable ATLAS-034A–D work is complete. The implementation candidate
`605eb23c7b25415d52f9ac60d121a6be43adee60` passed a frozen offline clean-room
install, the complete readiness suite, deterministic package recreation and audit,
dependency audit, static-site tests, responsive visual inspection, and independent
architecture/security and operations/release review after remediation. The
durable verdict and reviewer handoff are in
`docs/reviews/ATLAS-034-launch-readiness.md`.

No external action was taken. License choice, named GitHub owners, public-host
creation/protection, human review, npm authority, site deployment, release/tagging,
and announcements remain explicit gates. At the project owner's direction, the
physical ceremony was not repeated; ATLAS-013 remains `rerun required`, the shipped
real gate remains false, and the accepted launch scope is fixture-only.
