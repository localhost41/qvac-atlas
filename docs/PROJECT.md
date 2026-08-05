# Project charter

## North star

Before choosing or deploying hardware, a QVAC user can discover what one exact QVAC version and standardized workload was actually observed doing on comparable hardware.

## V1 promise

QVAC Atlas publishes evidence that an exact QVAC version and workload was observed succeeding, falling back, failing, or producing an inconclusive result on a recorded hardware/software configuration.

Atlas does not claim universal hardware support, future-version compatibility, or benchmark superiority.

## V1 user journey

1. A contributor runs `npx --yes qvac-atlas@0.3.0 contribute` from an explicit
   project containing the supported QVAC SDK.
2. Atlas presents one combined disclosure for the local run and obtains one
   explicit consent decision.
3. Atlas runs official checks and one pinned QVAC workload in an isolated child process.
4. Atlas shows a concise allowlisted summary, then writes the exact sanitized,
   schema-valid JSON report locally.
5. Atlas asks `Submit anonymous report? [y/N]`; declining or pressing Enter sends
   nothing.
6. A yes submits that exact report once to a private review queue without
   requiring a GitHub account.
7. CI and a human review and promote the report before it becomes searchable on
   the static site.

## Must ship

- Versioned report schema and deterministic validator.
- Allowlist-based hardware and QVAC collection.
- Official Doctor adapter with strict allowlist normalization; bundle verification
  is explicitly skipped for the local V1 probe because there is no deployment
  bundle and the official verifier may execute project configuration.
- Isolated worker startup and one standardized small-LLM lifecycle profile.
- Requested and directly observed backend recorded separately.
- One combined local disclosure, a readable result summary, and JSON output,
  followed only by an explicit anonymous submission choice to one pinned Atlas
  relay.
- Private GitHub-backed submission queue with no service database and no automatic
  public publication.
- Git-backed reviewed reports.
- Static site with clear browse/contribute entry points, search, and filters by
  hardware, architecture, memory, GPU, OS/kernel, QVAC version, backend, and
  outcome.
- Evidence and limitations visible for every public claim.

## Explicit non-goals

- Doctor replacement or generalized troubleshooting suite.
- Support bundle, repair engine, or large failure knowledge base.
- Accounts, database, OAuth, or telemetry.
- Silent/background submission, unattended public issue filing, automatic public
  publication, or scraping Discord/GitHub.
- Leaderboards, scores, recommendations, or broad benchmarking.
- Multiple models or modalities in V1.
- Native Android/iOS application or browser probe.
- Raw environment dumps, process lists, configuration files, or full logs.
- Cryptographic device identity or attestation.

## Launch gates

- A fresh Atlas install against an already-present, exact supported project-local
  QVAC installation can generate a valid local report through one interactive
  command; Atlas itself never installs QVAC.
- A crashing or hanging QVAC child cannot kill or indefinitely hang the parent.
- No known secret, identity, hostname, or local path leaks into a report.
- Claim-producing fields are derived, not contributor-authored.
- Actual backend is shown only when directly observed.
- The site builds only from validated Git data.
- Genuine reports populate the launch registry; fixtures are visibly fixtures.
