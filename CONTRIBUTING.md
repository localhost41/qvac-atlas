# Contributing to QVAC Atlas

QVAC Atlas accepts code and documentation contributions. Hardware compatibility
evidence follows a stricter, human-reviewed path because accepted JSON becomes
public Git history and can influence compatibility claims.

> **Accountless submission is implemented but deployment-gated.** The production
> profile allowlist is empty. Shipped real mode is disabled, and the source-pinned
> relay origin remains disabled. Fixture output is never eligible. Code,
> documentation, and fixture-only test contributions remain open.

## Accountless report workflow

After its separate deployment and activation review, Atlas will offer a one-click
accountless path. It never submits silently: the report is previewed and written
locally first, then Atlas names one pinned relay and asks a separate default-no
question. A `yes` sends only those exact JSON bytes once to a private GitHub review
queue. A human still controls public promotion.

1. Generate and preview the report locally with the Atlas probe.
2. Verify both consent fields are `true`. Reconsider submission if the hardware and
   software combination is too identifying for you.
3. At the separate accountless disclosure, review the pinned destination, private
   queue, network-metadata, retention, and possible later-publication limits.
4. Answer `yes` only if you want one bounded submission attempt. `no`, Enter, EOF,
   cancellation, or a disabled endpoint makes no request and leaves the local file
   unchanged.

Queue acceptance is deliberately incomplete for publication until a maintainer
reviews the exact bytes and adds protected `unverified-anonymous` metadata. Do not
add your own `sourceKey`, public claim, badge, recommendation, or production
profile. See
[`docs/contributing/report-submissions.md`](docs/contributing/report-submissions.md)
for privacy and review details.

Before keeping or sharing a hardware fingerprint, read the
[`privacy, removal, and incident guidance`](docs/contributing/privacy-removal-incidents.md).
It also explains exact-target cleanup for a never-submitted local report and model
cache, public withdrawal/supersession limits, and maintainer incident response.

## Installation and verification prerequisites

Use Node major 22 and pnpm exactly `11.10.0`, matching the root `packageManager`
pin. Ensure the checkout has enough space for workspace dependencies and test
output. Code, documentation, schema, catalog, site, and fixture-only test
contributions require neither QVAC nor a model artifact. Atlas does not install
QVAC; do not add it to this workspace or enable real mode for these contribution
types.

```bash
pnpm install --frozen-lockfile
pnpm ready:local
```

The frozen install remains a separate fresh-checkout gate. `ready:local` checks
only the current tree. It deliberately does not prove exact base-to-target report
history or any physical, repository-governance, activation, deployment, or release
approval gate. Stage every intended new path before running it; unexplained
untracked paths fail the cleanliness check.

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
- Credential/privacy incidents follow the stop-publish and sanitized-record process
  in
  [`docs/contributing/privacy-removal-incidents.md`](docs/contributing/privacy-removal-incidents.md).
