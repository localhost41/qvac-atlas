# Contributing to QVAC Atlas

QVAC Atlas accepts code and documentation contributions. Hardware compatibility
evidence follows a stricter, human-reviewed path because accepted JSON becomes
public Git history and can influence compatibility claims.

## Submit a report

Atlas never uploads a report or opens a pull request. You make the publication
decision by reviewing your local JSON and manually creating a Git contribution.

1. Generate and preview the report locally with the Atlas probe.
2. Verify both consent fields are `true`. Reconsider submission if the hardware and
   software combination is too identifying for you.
3. Copy the report without editing its evidence fields to:

   ```text
   reports/v1/sha256-<64 lowercase hex>.json
   ```

   Replace the colon in `report_id` with a hyphen. For example,
   `sha256:abcd…` becomes `sha256-abcd….json`. The 64 hexadecimal characters
   must match exactly.

4. Stage the file in Git, run the checks below, and open a pull request using the
   repository template.

A contributor report is deliberately incomplete for merge until a maintainer adds
trusted source metadata. Do not add your own `sourceKey`, public claim, badge,
recommendation, or production profile. See
[`docs/contributing/report-submissions.md`](docs/contributing/report-submissions.md)
for privacy and review details.

## Verify locally

Use Node 22 and the pinned pnpm version:

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/validate-contribution.mjs
node scripts/build-catalog.mjs
git diff --exit-code -- apps/site/src/generated/catalog.json
```

The contribution audit fails on malformed, private, unlisted, duplicated,
untracked, symlinked, profile-mismatched, or non-deterministic evidence. Errors name
rules and JSON locations without echoing suspect values.

## Review expectations

- Keep pull requests narrow and preserve existing report files unchanged.
- Never commit credentials or personal data. If a secret reaches Git history,
  deleting the current file is not sufficient remediation.
- CI validates mechanics; a human decides whether evidence and source independence
  are acceptable.
- Maintainers follow
  [`docs/contributing/maintainer-admission.md`](docs/contributing/maintainer-admission.md)
  before merging report data.
