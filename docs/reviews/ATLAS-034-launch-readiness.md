# ATLAS-034 community-launch readiness review

Date: 2026-08-01

Implementation candidate reviewed:
`4a711ce6fdc670b46460e05d8887f9c9a0bbde73`

Verdict: **Local launch mechanics complete for a fixture-only `0.1.0` developer
preview. External publication remains on explicit human, legal, identity, host,
registry, and deployment gates. Real execution and genuine evidence remain
closed.**

## What this verdict authorizes

This record accepts the local distribution, governance templates, deployable static
site, contributor journey, beta materials, rollback controls, and release runbooks.
It does not authorize creating a remote, publishing to npm, deploying the site,
sending an announcement, accepting a genuine report, or changing the real-mode
gate. The initial public snapshot, if separately authorized, must remain
fixture-only.

The previous physical attempt is deliberately outside this verdict. At the project
owner's direction, ATLAS-034 did not repeat ATLAS-013. That attempt remains private
engineering evidence with `STOP / MANUAL REVIEW`; it has not been relabeled as an
accepted physical gate.

## Frozen local outputs

| Output                    | Accepted local value                                               |
| ------------------------- | ------------------------------------------------------------------ |
| Package                   | `qvac-atlas@0.1.0`                                                 |
| Artifact                  | `.artifacts/qvac-atlas-0.1.0.tgz`                                  |
| Size                      | 118,506 bytes                                                      |
| SHA-256                   | `1fdd4024ed78aa35219ee4c53b058edfb71dae0a0e03436000b02150ac20c6f7` |
| Production profiles       | 0                                                                  |
| Genuine reports           | 0                                                                  |
| Derived production claims | 0                                                                  |
| Fixtures                  | 2                                                                  |
| Shipped real gate         | literal `false`                                                    |

The package contains the bundled zero-runtime-dependency CLI, its three supervised
child entry files, exact runtime schemas, README, and notices. Its audited file list
excludes tests, fixtures, reports, source maps, caches, credentials, private output,
and workspace-only source.

## Verification evidence

- A no-local-clone clean-room run checked out the exact implementation candidate,
  completed `pnpm install --offline --frozen-lockfile`, ran `pnpm ready:local`,
  rebuilt and audited the package, reproduced the SHA-256 above, and ended with a
  clean tree.
- The full readiness run passed 471 tests: schema 46, model artifact 82, resolver
  21, site 11, catalog 63, probe 53, executor 137, CLI 35, and root/runtime 23.
- A fresh registry-backed `pnpm audit --json` reported zero known advisories across
  production, development, and optional dependencies at review time.
- Package publication is audit-before-publish, atomic, no-clobber, and tested for
  failed audits, occupied destinations, concurrent publication, deterministic
  reuse, and staging cleanup.
- Static builds and tests passed at both root and subpath hosting. Manual desktop
  and 390-pixel mobile screenshots showed no clipping or fixture/genuine labeling
  regressions.
- Workflow parsing follows local actions and reusable workflows and rejects every
  unpinned third-party action. Exact pins were independently resolved to checkout
  v4.4.0, pnpm/action-setup v4.3.0, setup-node v4.4.0, upload-artifact v4.6.2, and
  deploy-pages v4.0.5.
- The initial-host baseline path is exact-commit-bound, requires the empty
  production evidence state, and can produce the same GitHub-Actions-bound required
  check without weakening the all-zero first-push refusal.
- The read-only host verifier requires a public repository at the exact commit,
  valid CODEOWNERS, private vulnerability reporting, GitHub-Actions-bound branch
  protection, workflow-mode Pages, and a protected deployment environment with a
  named reviewer, self-review prevention, administrator bypass disabled, and
  protected-branch-only deployment. It rejects a newer failed rerun even if an
  older successful check exists for the same commit.

## Review findings closed

The first architecture/security and operations/release passes held the candidate
for ten material issues: unverified Pages approval, administrator deployment
bypass, unbound required-check
identity, no final release-line freeze, a hoisted-manifest bundle audit weakness, a
workflow-pin parser bypass, stale-success check masking, an initial-CI bootstrap
deadlock, a placeholder-replacement CI contradiction, and package bytes that could
be replaced after audit. Remediation added exact host verification without admin
bypass, newest-check enforcement, the GitHub Actions app binding, a documented
fast-forward freeze, installed-manifest bundle verification, structural recursive
workflow inspection, dual complete ownership states, an exact-SHA empty baseline
workflow, and atomic audit-before-publication packaging.

The same remediation also upgraded vulnerable AJV, Astro, and Sharp dependency
paths. The full dependency audit, focused regression tests, complete readiness run,
deterministic package audit, and clean-room run then passed.

## Direct-Mac reviewer handoff

The independent human reviewer can use this Mac without credentials or private
physical-report access. From the final `main` branch and Node 22, run:

```sh
cd /Users/samaroomini/qvac-atlas
git status --short --branch
git rev-parse HEAD
pnpm install --offline --frozen-lockfile
pnpm ready:local
pnpm package:local
pnpm package:audit -- .artifacts/qvac-atlas-0.1.0.tgz
shasum -a 256 .artifacts/qvac-atlas-0.1.0.tgz
```

The tree must be clean, the final commit must match the release record, every
command must exit zero, and the digest must match the frozen value above. Then read
`docs/launch/reviewer-checklist.md`, inspect the built site at desktop, narrow
viewport, 200% zoom, and keyboard-only navigation, and return the bounded verdict
template in that checklist. Do not open or copy anything under
`/Users/samaroomini/qvac-atlas-private`; it is not launch evidence.

## Exact unresolved gates

| Gate                          | Human owner                                  | Required action                                                                              | Acceptance check                                                                |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| License                       | Legal/license approver                       | Select and commit the repository/package license                                             | No `UNLICENSED` placeholder or unresolved notice decision remains               |
| Named ownership               | Project owner                                | Supply primary, evidence, and security GitHub handles                                        | Every CODEOWNERS placeholder is replaced by a valid collaborator or team        |
| Public host                   | Host operator                                | Explicitly authorize and execute the public-host bootstrap                                   | Read-only verifier passes on the exact reviewed commit                          |
| Independent deployment review | Named reviewer                               | Review the exact final candidate and later approve Pages deployment                          | Reviewer differs from deployer; protected environment prevents self-review      |
| npm publication               | Registry publisher                           | Authorize the exact audited artifact and use registry-managed credentials                    | Registry digest and clean install match the accepted local artifact             |
| Site deployment               | Host operator plus reviewer                  | Explicitly authorize `deploy: true` on the accepted commit                                   | Published root/subpath, labels, accessibility, and catalog snapshot pass review |
| Release and announcements     | Release captain plus communications approver | Authorize tag/release and each GitHub or Discord message after verification                  | Public copy matches the deployed fixture-only state; drafts were not auto-sent  |
| Real execution/evidence       | ATLAS-013 reviewer and physical operator     | Complete a new conforming physical ceremony and the later profile/report/activation sequence | Separate accepted records exist; this ATLAS-034 verdict cannot satisfy them     |

Until the applicable rows pass, local preparation is complete but the corresponding
external action remains unauthorized. Skipping ATLAS-013 is compatible only with a
fixture-only developer preview; it is not compatible with real-mode activation or
public hardware compatibility claims.
