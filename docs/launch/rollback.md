# Site and private-beta rollback packet

This runbook prepares recovery actions; it does not authorize any external
mutation. The host authority must approve commands that change a future public
repository, workflow, environment, or Pages site.

## Rollback criteria

The release captain places the candidate on **HOLD** when any of these occurs:

- a privacy or credential finding in package, report, site, artifact, log, or
  feedback;
- real mode is no longer a literal hardcoded-false shipped gate;
- the registry gains an unreviewed production profile, genuine report, or claim;
- fixture/genuine separation or evidence limitations regress;
- package or site bytes differ from the reviewed commit and digest;
- any unexpected install, upload, telemetry, submission, or network behavior;
- root/subpath build, accessibility, responsive, or internal-link checks fail; or
- workflow pins, main-branch restriction, default-false manual gate, protected
  environment, or required human approval cannot be proved.

## Before external deployment

Owner: release captain.

1. Stop artifact transfer and beta invitations.
2. Mark the exact commit and artifact SHA-256 rejected in the local review record.
3. Preserve the failing candidate for bounded review; do not overwrite a trusted
   artifact with the same filename.
4. Rebuild from the last independently accepted commit only after the finding has
   a reviewed fix.

Read-only checks:

```sh
git rev-parse HEAD
git status --short
git diff --check
shasum -a 256 .artifacts/qvac-atlas-0.1.0.tgz
```

Acceptance: no further participant receives the rejected digest, and the next
candidate has a new recorded commit/digest and complete fresh review. With no
deployment yet, there is no external site to roll back.

## After a future authorized GitHub Pages deployment

Owner: the named host operator, acting only under explicit incident or rollback
authority for `<owner>/<repository>`.

First stop new deployments:

```sh
gh workflow disable site-release.yml --repo <owner>/<repository>
gh workflow view site-release.yml --repo <owner>/<repository>
```

Acceptance: the workflow view reports it disabled and no deployment job is
running. If unsafe content is already public and removal is authorized, disable
the Pages site:

```sh
gh api --method DELETE repos/<owner>/<repository>/pages
gh api --include repos/<owner>/<repository>/pages
```

Acceptance: the second command returns `404 Not Found`, the former site URL no
longer serves the affected artifact, and the incident record names the exact last
deployed commit and artifact. Do not run these placeholder commands before the
real owner/repository, named host operator, and authority are recorded.

For a privacy or credential incident, also follow
[`privacy-removal-incidents.md`](../contributing/privacy-removal-incidents.md).
Disabling a deployment does not erase Git or third-party caches, and an ordinary
report withdrawal is not privacy remediation.

## Resume criteria

Owner: release captain plus an independent reviewer; the host operator owns any
external re-enable action.

Resume only after the root/subpath and full workspace checks pass on a new exact
commit, package and Pages artifact digests are recorded, the triggering finding is
closed, privacy review passes, and all host protections and approvals are freshly
verified. Re-enabling a workflow is not permission to deploy: `deploy` remains
default false and the protected environment must require a new human approval.
