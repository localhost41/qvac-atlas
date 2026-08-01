# Project charter

## North star

Before choosing or deploying hardware, a QVAC user can discover what one exact QVAC version and standardized workload was actually observed doing on comparable hardware.

## V1 promise

QVAC Atlas publishes evidence that an exact QVAC version and workload was observed succeeding, falling back, failing, or producing an inconclusive result on a recorded hardware/software configuration.

Atlas does not claim universal hardware support, future-version compatibility, or benchmark superiority.

## V1 user journey

1. A contributor runs `npx qvac-atlas probe`.
2. Atlas explains what it will collect and obtains explicit consent.
3. Atlas runs official checks and one pinned QVAC workload in an isolated child process.
4. Atlas creates a local, sanitized, schema-valid JSON report and previews it.
5. Nothing leaves the machine automatically.
6. The contributor explicitly submits the report through GitHub.
7. CI and a human review the report before it becomes searchable on the static site.

## Must ship

- Versioned report schema and deterministic validator.
- Allowlist-based hardware and QVAC collection.
- Official Doctor adapter and conditional bundle verification adapter.
- Isolated worker startup and one standardized small-LLM lifecycle profile.
- Requested and directly observed backend recorded separately.
- Local preview and JSON output with no automatic upload.
- Git-backed reviewed reports.
- Static site filtered by hardware, OS, QVAC version, backend, and outcome.
- Evidence and limitations visible for every public claim.

## Explicit non-goals

- Doctor replacement or generalized troubleshooting suite.
- Support bundle, repair engine, or large failure knowledge base.
- Accounts, API server, database, OAuth, or telemetry.
- Automatic submission, unattended issue filing, or scraping Discord/GitHub.
- Leaderboards, scores, recommendations, or broad benchmarking.
- Multiple models or modalities in V1.
- Native Android/iOS application or browser probe.
- Raw environment dumps, process lists, configuration files, or full logs.
- Cryptographic device identity or attestation.

## Launch gates

- A fresh install can generate a valid local report with one command.
- A crashing or hanging QVAC child cannot kill or indefinitely hang the parent.
- No known secret, identity, hostname, or local path leaks into a report.
- Claim-producing fields are derived, not contributor-authored.
- Actual backend is shown only when directly observed.
- The site builds only from validated Git data.
- Genuine reports populate the launch registry; fixtures are visibly fixtures.

