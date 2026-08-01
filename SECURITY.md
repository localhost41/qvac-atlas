# Security policy

QVAC Atlas handles untrusted reports, local hardware fingerprints, child
processes, a dormant model-acquisition path, and release automation. A bypass of
its privacy, containment, evidence, or repository-trust boundaries is a security
issue even when it does not expose a traditional secret.

## Supported releases

No public release is supported yet. The repository remains a fixture-only release
candidate with real execution, genuine report admission, package publication, and
deployment disabled. Once a release is authorized, this section must identify the
supported release line before the tag or package is made public.

## Private reporting

Do not place a credential, private identifier, report, local path, prompt,
generated content, exploit detail, or other sensitive value in a public issue,
pull request, log, or Discord message.

The future public GitHub repository must enable GitHub private vulnerability
reporting before launch. Use its **Security → Report a vulnerability** flow. There
is intentionally no invented email address or public contact in this local
candidate.

`@SECURITY_CODE_OWNER_HANDLE_REQUIRED` is a launch-blocking placeholder, not a
contact. A human must replace it with a valid GitHub owner and verify the host
configuration before any public release. Until that happens, share sensitive
details only with the project owner through an already-established private channel;
if no such channel exists, report only that a private channel is required and do
not disclose the sensitive value.

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
