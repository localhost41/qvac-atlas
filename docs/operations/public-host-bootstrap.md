# Public GitHub bootstrap and verification

These commands are the authorized ATLAS-035 operator runbook. They target
GitHub.com because the repository already uses GitHub Actions and CODEOWNERS. Do
not run them until the exact Apache-2.0 candidate passes independent review and a
separate GitHub user is named for protected Pages approval.

The local candidate currently has no remote. The commands below deliberately use
visible placeholders and stop-on-error checks. Run them one block at a time from a
clean checkout; do not paste credentials into variables, command history, or the
repository.

## Prerequisites and human values

Before bootstrap:

- confirm `.github/CODEOWNERS` consistently names `@localhost41` and GitHub reports
  no syntax or ownership errors;
- confirm the repository and package contain the approved Apache-2.0 license;
- enable a valid private security-reporting owner and support path;
- record the owner's explicit choice between a separately reviewed launch and
  the owner-operated mode documented in D-021;
- approve one exact 40-character commit whose real gate is false, production
  profiles/reports/claims are empty, and full release checks pass; and
- authenticate GitHub CLI through its normal credential store with only the
  permissions required for repository administration.

Set non-secret identifiers explicitly:

```bash
ATLAS_GITHUB_OWNER='localhost41'
ATLAS_GITHUB_REPOSITORY='qvac-atlas'
ATLAS_REVIEWED_COMMIT='REPLACE_WITH_40_HEX_COMMIT'
ATLAS_REPOSITORY="$ATLAS_GITHUB_OWNER/$ATLAS_GITHUB_REPOSITORY"

test "$(git status --porcelain=v1 --untracked-files=all)" = ''
test "${#ATLAS_REVIEWED_COMMIT}" -eq 40
case "$ATLAS_REVIEWED_COMMIT" in
  *[!0-9a-f]*) echo 'ATLAS_REVIEWED_COMMIT must contain only lowercase hexadecimal characters.' >&2; false ;;
esac
# In owner-operated mode, do not configure a Pages reviewer. The verifier is
# invoked with --no-independent-reviewer and the branch protection payload
# intentionally has no pull-request approval rule.
```

## Freeze the local release line

The candidate is assembled on `integration`, while the public release line is
`main`. The release captain performs this local fast-forward only after the exact
candidate and its independent reviews are accepted:

```bash
test "$(git branch --show-current)" = 'integration'
test "$(git rev-parse --verify HEAD)" = "$ATLAS_REVIEWED_COMMIT"
git merge-base --is-ancestor main "$ATLAS_REVIEWED_COMMIT"
git switch main
git merge --ff-only "$ATLAS_REVIEWED_COMMIT"
test "$(git rev-parse --verify HEAD)" = "$ATLAS_REVIEWED_COMMIT"
test "$(git status --porcelain=v1 --untracked-files=all)" = ''
pnpm install --frozen-lockfile
pnpm ready:local
pnpm package:local
pnpm package:audit -- .artifacts/qvac-atlas-0.1.0.tgz
```

Record and independently compare the package SHA-256 after the fast-forward. Any
commit, package-byte, or generated-data change invalidates the freeze and requires
new reviews before bootstrap.

## Create and import the exact baseline

This is an external mutation and needs the host operator's explicit approval at
execution time:

```bash
gh repo create "$ATLAS_REPOSITORY" --public --source=. --remote=origin
git push origin "$ATLAS_REVIEWED_COMMIT:refs/heads/main"
git branch --set-upstream-to=origin/main main
gh repo edit "$ATLAS_REPOSITORY" --default-branch main
```

Record the exact imported commit as the initial trusted baseline in the private
host-administration record. The workflow intentionally rejects an all-zero first
push base; do not weaken it. Instead, obtain the required green check on that same
commit through the separately gated manual baseline mode:

```bash
gh workflow run ci.yml \
  --repo "$ATLAS_REPOSITORY" \
  --ref main \
  -f reviewed_commit="$ATLAS_REVIEWED_COMMIT"

ATLAS_CI_RUN_ID="$(gh run list \
  --repo "$ATLAS_REPOSITORY" \
  --workflow ci.yml \
  --branch main \
  --event workflow_dispatch \
  --commit "$ATLAS_REVIEWED_COMMIT" \
  --limit 1 \
  --json databaseId,headSha \
  --jq '.[0] | select(.headSha == "'"$ATLAS_REVIEWED_COMMIT"'") | .databaseId')"
test -n "$ATLAS_CI_RUN_ID"
gh run watch --repo "$ATLAS_REPOSITORY" "$ATLAS_CI_RUN_ID" --exit-status
```

That manual path binds its input to `main` and `GITHUB_SHA`, enforces an empty
production profile/source/report/claim baseline, runs the complete checks, and
does not claim append-only history. No subsequent push is allowed before
protection is active and verified.

## Enable security and branch protection

These are external mutations and need the same explicit operator authority:

```bash
gh api --hostname github.com --method PUT \
  "repos/$ATLAS_REPOSITORY/private-vulnerability-reporting"

gh api --hostname github.com --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "repos/$ATLAS_REPOSITORY/branches/main/protection" \
  --input .github/branch-protection.json

gh api --hostname github.com --method POST \
  "repos/$ATLAS_REPOSITORY/pages" \
  -f build_type=workflow

printf '%s' '{
  "wait_timer": 0,
  "prevent_self_review": false,
  "can_admins_bypass": false,
  "reviewers": [],
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}' | gh api --hostname github.com --method PUT \
  "repos/$ATLAS_REPOSITORY/environments/github-pages" \
  --input -
```

The checked-in owner-operated payload requires an up-to-date branch, the exact
workspace check bound to the GitHub Actions application, resolved conversations,
administrator enforcement, no force pushes or deletion, and linear history. It
does not require pull-request approval or a separate Pages reviewer, as recorded
in D-021. Pages still uses workflow deployment, disallows administrator bypass,
and accepts only protected branches. Do not add bypass users, teams, apps, or a
direct-push exception. The read-only verifier below must observe
`can_admins_bypass: false`.

## Read-only verification

The verifier performs authenticated `GET` requests only. Ordinary
`pnpm ready:local` never runs it and never accesses GitHub.

```bash
node scripts/verify-host-protection.mjs \
  --repository "$ATLAS_REPOSITORY" \
  --branch main \
  --expected-head "$ATLAS_REVIEWED_COMMIT" \
  --no-independent-reviewer
```

It fails unless the repository is public, `main` is the default branch at the
exact reviewed commit, GitHub reports no CODEOWNERS errors, private vulnerability
reporting is enabled, the exact commit has a successful GitHub Actions check, every
required branch-protection field matches, the newest matching GitHub Actions check
run on the exact commit is successful, Pages uses workflow mode, and the protected
environment has no reviewer rule, administrator bypass disabled, and
protected-branch-only deployment. Preserve the sanitized pass/fail output and
exact commit in the private release record; do not preserve tokens or raw API
responses.

After verification, the next change must be a pull request from the exact trusted
baseline and pass the normal base/target append-only audit. If any host setting
drifts, close report admission and release until the operator restores protection
and the read-only verifier passes again.
