## Purpose

<!-- Describe the smallest reviewable change. A report submission is always manual. -->

## Contributor report submission

Complete this section only when you are submitting a report.

- [ ] I generated this report locally and explicitly chose to publish it.
- [ ] I reviewed the exact JSON and understand that hardware/software fields can form an identifying fingerprint.
- [ ] The file is named `reports/v1/sha256-<64 lowercase hex>.json`, matching its `report_id` exactly.
- [ ] I did not add identity, logs, prompts, generated output, configuration, environment values, credentials, or arbitrary metadata.
- [ ] I did not author a claim, badge, recommendation, `sourceKey`, or production profile admission.
- [ ] I understand that opening this PR is the submission action; Atlas did not upload or file it automatically.

Report path:

```text
reports/v1/sha256-_______________________________________________________________.json
```

## Maintainer-owned admission

<!-- Contributors leave this section unchanged. A maintainer completes it before merge. -->

- [ ] A maintainer reviewed the exact report and CI validation output.
- [ ] A maintainer established the stable source-independence class and added exactly one `sourceKey` entry to `registry/catalog.json`.
- [ ] The report matches exactly one already-approved production profile; no profile was admitted merely to make this PR pass.
- [ ] The generated catalog is byte-for-byte reproducible and contains no fixture/production crossover.
- [ ] Human review is complete; CI success alone is not approval.

## Verification

```text
pnpm install --frozen-lockfile
pnpm check
node scripts/validate-contribution.mjs
node scripts/build-catalog.mjs
git diff --exit-code -- apps/site/src/generated/catalog.json
```
