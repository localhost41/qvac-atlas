# ATLAS-035 public-launch execution record

Date: 2026-08-01

Status: **local release candidate and host-control remediation passed independent
review; external publication blocked on named identity/authentication values and
has not started**

## Authorized scope

The project owner approved Apache-2.0, assigned the primary, evidence, security,
host-operator, and registry-publisher responsibilities to `@localhost41`, and
authorized the public repository, exact npm publication, GitHub Pages deployment,
`v0.1.0` release, and final GitHub/Discord announcements. The release deliberately
skips a new ATLAS-013 ceremony and therefore remains fixture-only, real-disabled,
submission-closed, and claim-empty.

## Exact local candidate

| Field | Value |
| --- | --- |
| Package-source commit | `6db47361d01da9ae61724a20386708f8f4e93db7` |
| Package | `qvac-atlas@0.1.0` |
| Artifact | `.artifacts/qvac-atlas-0.1.0.tgz` |
| Size | 122,278 bytes |
| SHA-256 | `dec3ab4e41ec262396232a796ecb5ff772de008b4807bc90988f6e776afb4a2c` |
| License | Apache-2.0, included as `package/LICENSE` |
| Node | `v22.23.2` |
| pnpm | `11.10.0` |
| Production profiles | 0 |
| Genuine reports | 0 |
| Derived production claims | 0 |
| Fixtures | 2 |
| Shipped real gate | literal `false` |

The artifact allowlist is `package/package.json`, `README.md`, `LICENSE`, `NOTICE`,
four fixed runtime bundle entries, and two exact JSON Schemas. It has no runtime
npm dependencies, install hooks, QVAC package, model, report, cache, credential,
source map, test, fixture, workspace reference, or local path.

The previous 118,506-byte artifact was preserved locally under the ignored
superseded-artifact name before the Apache-2.0 candidate was created; it is not a
publication candidate.

## Verification completed

- The main working copy completed an offline frozen install and `pnpm ready:local`.
  All 471 package-source tests passed with lint, build, typecheck, schema, privacy,
  containment, claim, catalog, package, host-control, site, and disabled-real-mode
  checks.
- Package construction and audit produced the exact size and SHA-256 above.
- A separate `--no-local` clone of the exact package-source commit completed an
  offline frozen install, the full readiness suite, package recreation, audit, and
  clean-tree check. Its artifact bytes matched the main working copy exactly.
- A fresh npm registry lookup returned `404 Not Found` for `qvac-atlas`; no package
  currently occupies the unscoped name.
- GitHub CLI is authenticated as `localhost41`, and a read-only repository lookup
  confirmed `localhost41/qvac-atlas` does not yet exist.
- `npm whoami` failed with `ENEEDAUTH`; no npm credentials were exposed or stored
  in this record.
- After host-control remediation, exact commit
  `fd9d82d22eb3bb702183a310701791016e26aa83` completed a clean full readiness run
  with all 472 tests passing. The new test is the hostile owner-as-reviewer case.
  The canonical artifact remained 122,278 bytes with the exact SHA-256 above.

## Independent review and remediation

Two read-only Sol xhigh reviews examined the exact package-source commit and
artifact:

- architecture/security: license and notices, package boundary, real-mode and
  evidence state, CODEOWNERS semantics, and independent Pages approval;
- operations/release: deterministic distribution, canonical links, sequencing,
  host controls, registry/name state, and fail-closed external prerequisites.

The architecture/security review returned **HOLD** on one release blocker: the
runbook and verifier accepted `localhost41` as the nominally independent Pages
reviewer. GitHub's self-review prevention covers the workflow initiator, not the
separate release-captain role. The verifier, argument parser, runbook, and hostile
regression test now reject a reviewer equal to the repository owner case-
insensitively. Focused host/readiness tests pass 15/15 after remediation.

The same review recorded one fail-closed availability concern: with only
`@localhost41` in CODEOWNERS, a future pull request authored by `localhost41`
cannot receive code-owner approval. Once the separate reviewer login is supplied,
that account must be added as a co-owner on protected surfaces before candidate
freeze. This identity-bound delta and the verifier remediation require bounded
independent re-review on the new exact commit before fast-forward to `main`.

Both independent reviewers returned **PASS** on the bounded remediation at exact
commit `fd9d82d22eb3bb702183a310701791016e26aa83`. They reproduced mixed-case parser
rejection, live repository-owner rejection, the pre-bootstrap guard, and 15/15
focused host/readiness tests. They also confirmed the launch record is truthful,
the worktree and delta are clean, no remote exists, GitHub and npm targets remain
absent, and the remaining identity/authentication values still fail closed.

Any documentation-only descendant that records this verdict must receive a final
bounded delta check before it becomes the reviewed release head. The separate
reviewer/co-owner identity remains a pre-freeze blocker, so `main` has not been
fast-forwarded.

## Exact external blockers

| Gate | Current result | Required next value/action |
| --- | --- | --- |
| Independent Pages approval and sustainable CODEOWNERS | blocked before candidate freeze and host bootstrap | Supply the separate reviewer's GitHub login; it must differ from `localhost41` and will be added as co-owner on protected surfaces |
| npm authentication | `npm whoami` → `ENEEDAUTH` | The authorized publisher runs `npm adduser` or `npm login` through npm's normal credential flow |
| Discord destination | not named | Supply the exact authorized server and channel after repository/package/site verification |

The repository will not be created without the independent reviewer because the
checked-in bootstrap requires that account when configuring the no-self-review,
no-administrator-bypass `github-pages` environment. npm publication, Pages,
release/tagging, and announcements remain serialized behind a passing exact-commit
host verifier. No external mutation has occurred at this checkpoint.

## Resume sequence

After the three missing values are available:

1. record the independent verdicts, commit the final documentation-only record,
   re-review its bounded delta, and fast-forward that exact head to `main`;
2. create `localhost41/qvac-atlas`, push only the reviewed head, run the exact-SHA
   baseline CI, configure security/branch/Pages protections, and require the
   read-only verifier to pass;
3. publish the already audited tarball and verify registry metadata and downloaded
   bytes against the digest above;
4. dispatch Pages with `deploy: true`, have the independent reviewer approve it,
   and verify the public root and repository subpath;
5. create the annotated `v0.1.0` tag/release with checksums, then send the reviewed
   GitHub and Discord copy only after every URL resolves.
