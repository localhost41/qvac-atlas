# ATLAS-031 — Local readiness and activation controls

Status: completed

## Scope

Align repository operations with the Node-22-only V1 contract and make locally
provable readiness repeatable without implying that hardware, governance, or
release approval has passed.

Allowed paths:

- root/workspace package manifests and lockfile
- `.npmrc`
- `scripts/**`
- `README.md`, `CONTRIBUTING.md`, `docs/RELEASE-CHECKLIST.md`, `docs/STATUS.md`
- contributor/incident documentation
- `.github/**` only for immutable action pinning or tested wording; do not invent
  owners, remotes, contacts, branch rules, or deployment configuration

## Acceptance

- Root and runtime-relevant workspace packages advertise Node `>=22 <23`; Node
  types target major 22 and repository installs fail on unsupported engine majors.
- One documented `pnpm ready:local` command runs the current-tree contribution
  audit, full workspace check, deterministic catalog rebuild, generated diff, and
  cleanliness checks. Its output explicitly says exact history and external gates
  are not proven. Frozen installation remains a separate fresh-checkout gate.
- The release checklist requires a commit-pinned physical verdict, a distinct
  reviewed activation diff, still-hardcoded gate review, an admitted production
  profile, at least one manually admitted genuine report, and a nonempty rebuilt
  genuine registry before release.
- Incident guidance states that secret history remediation intentionally cannot use
  the ordinary append-only CI path and requires named host authority, a stopped
  release, trusted-baseline re-establishment, restored protection, and fresh audit.
- Maintainer guidance specifies a maintainer-owned first-report admission branch
  and fresh code-owner review without weakening bidirectional metadata checks.
- No license, contact, owner identity, deployment URL, or branch rule is fabricated.

Run frozen install, readiness, formatting, and focused documentation tests.
