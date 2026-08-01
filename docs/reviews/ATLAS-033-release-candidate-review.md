# ATLAS-033 release-candidate review

Date: 2026-08-01

Frozen candidate reviewed:
`1653b23df9e1b3bdc5e387c4a15b61dd059c4484`

Verdict: **HOLD for activation and public release. Engineering foundation accepted
after remediation; human, physical, repository-trust, and distribution gates remain.**

## Independent review passes

Three Sol xhigh passes independently reviewed architecture/containment,
privacy/evidence, and operations/release controls. Findings required exact code,
test, report-field, or durable-contract evidence. The private report itself was not
committed or reproduced in this record.

## Findings and disposition

| Severity | Finding                                                                                                                                                    | Disposition                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | One-shot SIGINT-only handling could let a repeated signal, SIGTERM, or SIGHUP kill the supervisor during cleanup and orphan a detached QVAC process group. | Persistent INT/TERM/HUP handlers now remain through settlement; a child-side parent-disconnect fail-safe kills the detached POSIX group. Unit, phase-abort, and real nested-process parent-death tests cover the boundary.        |
| High     | The raw `@qvac/cli@0.9.0` tarball uses `./dist/index.js`, while registry/installed normalized manifests can use `dist/index.js`; requiring only one breaks the other. | Final review resolved the source discrepancy. Only the two path-equivalent published/normalized forms are accepted; alternate entries and versions fail closed.                                                                  |
| High     | Production claim evaluation could accept unsupported platforms or an arbitrary Apple-vendor CPU string as a missing-GPU identity key.                      | V1 execution and claims require macOS arm64. GPU claims require concrete inventory or a bounded Apple M-series SoC model; arbitrary labels fail closed, with negative and aggregation tests.                                      |
| High     | The completed private attempt did not meet ATLAS-013 ceremony provenance and preview requirements.                                                         | Classified as useful engineering evidence only and `STOP / MANUAL REVIEW`; it cannot admit a profile/report or authorize activation. A new conforming run is required.                                                            |
| Medium   | `platform.os.version` contained Darwin `os.release()` while the UI implied a macOS marketing version.                                                      | macOS rendering now says `kernel release`; D-018 freezes that meaning for genuine V1 probes.                                                                                                                                      |
| Medium   | Ordinary activated users would not see exact engine, context, GPU layers, prompt, generation parameters, and shutdown behavior in the CLI disclosure.      | The authoritative disclosure contains the complete fixed workload; regression tests require both pre-load and post-close artifact verification in exact shutdown order.                                                           |
| High     | V1 macOS-only scope conflicted with a Windows hardware release gate and Linux-capable coordinator/claim paths.                                             | D-017 records macOS arm64-only V1; the top-level dispatcher refuses unsupported hosts before TTY, cwd, signals, or real-module import, with coordinator defense in depth.                                                           |
| High     | First genuine-report admission was ordered before activation, and candidate-only disclosure would remain false after profile admission.                   | The checklist requires a reviewed, disabled production-probe binding commit with truthful profile/disclosure state, followed by a separately authorized temporary ceremony and later activation diff.                             |
| High     | Workflow actions floated at major tags and the runner used `ubuntu-latest`.                                                                                | Existing action majors are pinned to upstream-resolved commits and CI uses `ubuntu-24.04`; readiness tests reject regression.                                                                                                     |
| Medium   | ATLAS-013 and ATLAS-033 temporarily depended on one another, making the conforming rerun unschedulable.                                                    | ATLAS-033 now depends only on the completed implementation review; its human verdict closes this review before a fresh ATLAS-013 rerun.                                                                                            |

## Physical evidence adjudication

The private file remains canonical, schema-valid, identity-valid, privacy-clean,
mode `0600`, publication false, and correctly non-publishable. It records a real
QVAC SDK 0.16.0 pinned-model lifecycle with all five phases passed, directly
observed generic GPU device class, and clean exit. Nothing was uploaded.

It is not accepted ATLAS-013 evidence because the project was not a clean pinned
Git project, independent review did not precede the run, the publication choice in
the final preview was later corrected from true to false, and the enabled clone has
not yet received a reviewer-authorized destruction verdict. None of those facts may
be relabeled as public consent or a compatibility claim.

## Accepted boundaries

- The shipped CLI gate remains a literal `false` with no environment, config,
  input, or hidden-flag bypass.
- Artifact source, redirect authority, size, hash, private modes, recovery, and
  no-clobber cache behavior remain fail closed.
- SDK and model authorities remain opaque, exact, and single use.
- Reports contain no prompt, generated content, arbitrary child value, raw Doctor
  data, SDK/model path, or failure excerpt.
- Generic `cpu|gpu` is the maximum observed-device claim; no exact graphics backend
  is inferred.
- Fixtures, candidate evidence, production profiles, genuine reports, and source
  independence remain separated.
- Atlas installs nothing, uploads nothing, submits nothing, and performs no repair
  or telemetry.

## Verification

- `pnpm check` passed after the combined remediations: lint, strict schema build,
  static site build, typecheck, and all workspace tests.
- Focused totals include schema 46, catalog 63, probe 53, executor 137, CLI 35,
  resolver 21, model-artifact 82, site 6, and readiness 4, with no failures.
- The deterministic catalog rebuild still contains zero genuine reports, two
  fixtures, zero production claims, and no profile admission.
- Parent-death containment kills both the detached executor child and its nested
  descendant in a real subprocess test.
- The private report still passes schema, report-ID, and privacy verification under
  the remediated code; it remains mode `0600` and publication false.
- `git diff --check` passed, and all workflow action pins were re-resolved against
  their exact upstream tag refs during review.

## Remaining release gates

- Independent human report/diff review and clone-retention verdict.
- At least 10 GiB ceremony headroom and a clean commit-pinned Git QVAC project.
- Fresh pre-approved ATLAS-013 ceremony and private lifecycle/privacy verdict.
- Public host, license, named code owners, protected release branch, and fresh
  required approvals.
- Separate production-profile admission, first-production-report ceremony, manual
  report admission, nonempty genuine registry, and activation review.
- Installable distribution, hosted site, public security/privacy contact, and
  explicit authority for publication or announcements.
