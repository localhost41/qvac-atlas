# Privacy threat model

Status: release-blocking V1 contract.

## Assets and trust boundary

Atlas runs alongside developer tools, model files, package configuration, and QVAC
workers. Those processes may expose credentials, personal identifiers, local paths,
prompts, generated content, or organization details in exceptions or command
output. A submitted report enters public Git history and must be treated as
effectively permanent.

The local probe process and contributor are not trusted to define the public data
contract or claim status. A report becomes public only after strict validation,
privacy scanning, explicit preview/consent, CI, and human review. Git reviewer
metadata used to establish independent sources is trusted registry metadata and is
never accepted from report JSON.

## Threats

Atlas defends against:

- Accidental collection of environment values, configuration, full logs, prompts,
  generated text, command arguments, or filesystem contents.
- Credentials or identity leaking through native exceptions and bounded failure
  excerpts.
- Stable device identifiers being mistaken for compatibility-relevant hardware
  identifiers.
- A malicious data pull request adding a new field, HTML, script, forged claim, or
  secret-shaped payload.
- Validation errors and CI logs reprinting a detected secret.
- A contributor publishing a hardware fingerprint without understanding that the
  combination may be identifying.
- A future collector broadening collection while retaining a compatible-looking
  schema or sanitizer version.

V1 does not claim anonymity against correlation. OS build, CPU, GPU, driver, and
QVAC versions can form a distinctive fingerprint. Atlas discloses this explicitly
and requires acknowledgement before publication.

## Allowlist

The report may contain only fields declared by the normative schema. Relevant
hardware evidence is deliberately coarsened:

- OS family/version/build and architecture.
- CPU vendor/model/family and allowlisted feature names.
- Memory bucket, not exact bytes.
- GPU vendor/model, PCI-style device ID, and driver version; never serial number.
- Node, QVAC SDK, QVAC package, probe, schema, sanitizer, and profile versions.
- Official check outcomes and bounded durations.
- Controlled lifecycle phase outcomes and bounded durations.
- Requested generic `auto|cpu|gpu` device and directly observed generic `cpu|gpu`.
- Normalized exit code/signal/failure category/code and an optional sanitized
  excerpt of at most 1,024 characters.
- Redaction category counts without source values.

No collector may add a field opportunistically. New data requires schema review,
threat-model review, and a version decision before collection.

## Forbidden data

Atlas must never collect or publish:

- Environment variable values, access tokens, API keys, cookies, authorization
  headers, passwords, private keys, or credential-bearing URLs.
- Username, home directory, email, hostname, organization name, or Git remote.
- IP address, MAC address, Wi-Fi/SSID details, device serial, machine ID, advertising
  ID, or other stable device identity.
- Process lists, shell history, unrelated command arguments, clipboard contents, or
  arbitrary files.
- User prompts, generated model output, full configuration, full logs, or absolute
  model/cache/project paths.
- Contributor-authored HTML, Markdown, CSS, JavaScript, badges, scores, claims, or
  recommendations.

Reports may record a normalized PCI-style GPU device ID because it identifies a
model class rather than an individual device. Collectors must not substitute a
serial number into that field.

## Controls

Collection is allowlist-first. The probe constructs a fresh object from approved
values rather than serializing process objects and attempting to redact them later.
JSON Schema rejects every unknown property at every object level.

Before a report is written, a second scanner detects forbidden field names and
credential, JWT, email, user-path, network-address, credential-URL, sensitive
assignment, and high-entropy canaries. Hash/version fields are narrowly exempted
from entropy detection. Findings contain only JSON pointer and rule name; the
suspect value is never included in error output.

The scanner is defense in depth, not permission to collect raw data. A value that
passes pattern scanning but violates the allowlist is still forbidden.

Local generation and public publication are separate decisions:

1. Probe disclosure explains each category and fingerprint risk.
2. Local report generation uploads nothing.
3. The user previews the exact sanitized report.
4. `consent.fingerprint_acknowledged` and `consent.publication` must both be true for
   Git submission validation.
5. CI repeats schema, semantic, identity, and privacy validation.
6. A human reviews every report during V1.

## Failure excerpts

Failure excerpts are the highest-risk field. They are optional, bounded, and
intended only for text produced by a controlled runner. Collection should prefer a
normalized category and code and omit the excerpt whenever those are sufficient.

The collector must:

- Keep only a short bounded tail after in-memory sanitization.
- Replace home, temporary, and project paths with fixed placeholders before the
  report object exists.
- Never include a command line, environment dump, prompt, generated text, or full
  native stack trace.
- Drop the excerpt completely if sanitization cannot establish safety.

## Verification and release blockers

The adversarial corpus covers fake bearer credentials, JWT-shaped values, POSIX and
Windows user paths, email, MAC and IP addresses, credential-bearing URLs, sensitive
assignments, known token shapes, high-entropy strings, and forbidden field names.
Tests verify that detection errors do not echo the canary.

A privacy leak, unknown property, validation log containing a secret, missing
consent, or production acceptance of the test-only profile blocks release. Once a
report has entered public Git history, removing it from the current tree is not a
sufficient incident response; maintainers must treat the value as disclosed, revoke
affected credentials, remove the public artifact, and follow repository history
remediation policy.
