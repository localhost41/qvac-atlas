# Public GitHub bootstrap and verification

These commands are a prepared operator runbook, not authorization. They target
GitHub.com because the repository already uses GitHub Actions and CODEOWNERS. Do
not run them until a human explicitly approves the public repository, names the
owners, chooses a license, and accepts the exact candidate commit.

The local candidate currently has no remote. The commands below deliberately use
visible placeholders and stop-on-error checks. Run them one block at a time from a
clean checkout; do not paste credentials into variables, command history, or the
repository.

## Prerequisites and human values

Before bootstrap:

- replace every `*_HANDLE_REQUIRED` token in `.github/CODEOWNERS` with a valid
  GitHub user or team that has repository access;
- select and commit the human-approved license;
- enable a valid private security-reporting owner and support path;
- approve one exact 40-character commit whose real gate is false, production
  profiles/reports/claims are empty, and full release checks pass; and
- authenticate GitHub CLI through its normal credential store with only the
  permissions required for repository administration.

Set non-secret identifiers explicitly:

```bash
ATLAS_GITHUB_OWNER='REPLACE_WITH_APPROVED_OWNER'
ATLAS_GITHUB_REPOSITORY='qvac-atlas'
ATLAS_REVIEWED_COMMIT='REPLACE_WITH_40_HEX_COMMIT'
ATLAS_REPOSITORY="$ATLAS_GITHUB_OWNER/$ATLAS_GITHUB_REPOSITORY"

test "$(git rev-parse --verify HEAD)" = "$ATLAS_REVIEWED_COMMIT"
test "$(git status --porcelain=v1 --untracked-files=all)" = ''
test "$(git branch --show-current)" = 'main'
test "${#ATLAS_REVIEWED_COMMIT}" -eq 40
case "$ATLAS_REVIEWED_COMMIT" in
  *[!0-9a-f]*) echo 'ATLAS_REVIEWED_COMMIT must contain only lowercase hexadecimal characters.' >&2; false ;;
esac
```

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
push base; do not weaken it. No subsequent push is allowed before protection is
active and verified.

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
```

The checked-in payload requires an up-to-date branch, the exact workspace check,
at least one approval, code-owner review, stale-approval dismissal, approval by
someone other than the latest pusher, resolved conversations, administrator
enforcement, no PR bypass actors, no force pushes or deletion, and linear history.
Do not add bypass users, teams, apps, or a direct-push exception.

## Read-only verification

The verifier performs authenticated `GET` requests only. Ordinary
`pnpm ready:local` never runs it and never accesses GitHub.

```bash
node scripts/verify-host-protection.mjs \
  --repository "$ATLAS_REPOSITORY" \
  --branch main \
  --expected-head "$ATLAS_REVIEWED_COMMIT"
```

It fails unless the repository is public, `main` is the default branch at the
exact reviewed commit, GitHub reports no CODEOWNERS errors, private vulnerability
reporting is enabled, and every required protection field matches. Preserve the
sanitized pass/fail output and exact commit in the private release record; do not
preserve tokens or raw API responses.

After verification, the next change must be a pull request from the exact trusted
baseline and pass the normal base/target append-only audit. If any host setting
drifts, close report admission and release until the operator restores protection
and the read-only verifier passes again.
