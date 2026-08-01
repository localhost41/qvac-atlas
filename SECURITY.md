# Security policy

QVAC Atlas handles untrusted reports, local hardware fingerprints, child
processes, a dormant model-acquisition path, and release automation. A bypass of
its privacy, containment, evidence, or repository-trust boundaries is a security
issue even when it does not expose a traditional secret.

## Supported releases

The `0.1.x` line is the supported fixture-only developer preview. Real execution,
genuine report admission, and compatibility claims remain unavailable. Older
pre-release commits and private physical-test artifacts are unsupported.

## Private reporting

Do not place a credential, private identifier, report, local path, prompt,
generated content, exploit detail, or other sensitive value in a public issue,
pull request, log, or Discord message.

The public GitHub repository enables private vulnerability reporting before
release. Use its **Security → Report a vulnerability** flow; do not open a public
issue for sensitive material. There is intentionally no invented email address.
`@localhost41` is the repository security owner, while GitHub's private reporting
flow is the supported confidential contact route.

Include the affected Atlas version or commit, the boundary affected, minimal
reproduction steps, and impact. Use synthetic values. For a leaked credential,
rotate or revoke it before relying on repository remediation.

## Response boundary

The security owner and release captain must stop affected publication and preserve
only a sanitized incident record. They follow
[`docs/contributing/privacy-removal-incidents.md`](docs/contributing/privacy-removal-incidents.md)
for credential/privacy incidents and run the complete local and public-host trust
verification before resuming. CI success does not close a security report or
authorize release.

Atlas does not promise a response deadline until named maintainers accept and
publish one. Public disclosure timing must be coordinated with the security owner
after affected credentials, artifacts, Git history, packages, and deployments have
been addressed.
