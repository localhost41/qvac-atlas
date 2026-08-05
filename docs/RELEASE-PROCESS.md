# Release process

This process separates a mechanically releasable candidate from the human and
external decisions that authorize publication. No command in this document grants
authority to create a remote, publish a package, deploy a site, admit evidence, or
send an announcement.

## Human assignments required before launch

Record real people or valid GitHub teams in the private release record before
public bootstrap:

| Responsibility                         | Current assignment                | Required decision                                                             |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Primary code owner and release captain | `@localhost41`                    | Accept the exact release commit and coordinate gates.                         |
| Evidence/admission owner               | `@localhost41`                    | Review profiles, genuine reports, and source-independence metadata.           |
| Security owner                         | `@localhost41`                    | Receive private reports and approve security/incident readiness.              |
| Host operator                          | `@localhost41`                    | Create/configure the authorized public host and return verification evidence. |
| Independent reviewer                   | separate human; GitHub login due  | Review the exact candidate after the latest change and approve Pages.         |
| Legal/license approver                 | project owner; Apache-2.0 approved| Confirm Apache-2.0 and third-party notice obligations.                        |
| Registry publisher                     | project owner; login due          | Authenticate the approved npm publishing identity.                            |

One person may hold multiple operational roles only if the required independent
review still comes from someone other than the author of the latest protected
change. Do not encode personal names, email addresses, credentials, or source
identities in reports.

## Candidate contract

The current V1 distribution candidate is one unscoped `qvac-atlas@0.2.0` CLI
package with the `qvac-atlas` binary. It supersedes the original fixture-only
`0.1.0` candidate contract. It contains one bundled zero-runtime-dependency CLI,
the three fixed supervised child entry files required by that bundle, the two
exact runtime JSON Schemas, `README.md`, `LICENSE`, and `NOTICE`; it contains no
tests, fixtures, reports, source maps, caches, credentials, local paths, or
workspace-only packages. The accountless submission client is bundled, but its
source-pinned relay origin is literal `null`. All internal workspace packages and
the workspace root remain private and are not release artifacts.

The shipped CLI real-mode seam must remain the literal `false`. A local package
artifact may be built and installed without authorizing npm publication. Any
future topology, package name, version, file-list, dependency, or activation
change requires an explicit reviewed update to this contract and its readiness
tests. Enabling a relay origin changes distributable bytes and therefore requires
a new package version; `0.2.0` must never identify both disabled- and
enabled-origin artifacts.

## Candidate preparation

1. For the disabled-origin `0.2.0` candidate, start from an exact reviewed commit
   with an empty production-profile allowlist, no genuine reports or claims, the
   real gate literal false, and the relay origin literal `null`. A later release
   may contain only genuine state admitted through the separately protected
   profile/report ceremony.
2. Use Node 22 and pnpm `11.10.0`; run a fresh
   `pnpm install --frozen-lockfile` and `pnpm ready:local`.
3. Build the deterministic local package artifact. Audit its exact filenames and
   hashes, then install it in a fresh non-workspace project with network access
   disabled. Confirm `qvac-atlas --help` works and `probe --real` refuses before
   QVAC, cache, network, temporary-file, or model effects.
4. Build and smoke-test the static site through the separately reviewed deployment
   process without deploying it.
5. Run the privacy, schema, catalog, append-only, containment, generated-data, and
   package-content checks in the release checklist. Record the exact commit and
   artifact digests; do not record credentials or private report content.
6. Obtain independent architecture/security, distribution/usability, and
   operations/release verdicts against that exact commit. Any subsequent change
   invalidates approvals that cover the changed boundary.

## Repository and legal gates

Before any external publication:

- Apache-2.0 and all third-party notice obligations are committed and audited;
- all CODEOWNERS entries resolve to the approved `@localhost41` account;
- the host operator follows
  [`operations/public-host-bootstrap.md`](operations/public-host-bootstrap.md) and
  returns a passing read-only verification for the exact imported commit;
- private vulnerability reporting and the support/security routes are usable;
- the protected `main` branch requires current code-owner approval, approval after
  the latest push, the exact required check, resolved conversations, and no bypass,
  force push, deletion, or administrator exemption; and
- the initial trusted baseline is recorded before the next change, as required by
  the maintainer-admission procedure.

A locally concrete CODEOWNERS file is still only preparation until GitHub reports
zero ownership errors and the complete public-host verifier passes.

## External fixture-only `0.1.0` release sequence

ATLAS-035 records explicit owner authorization for all five steps below. Each step
still executes only after its listed technical and independent-review prerequisites
pass; authorization does not permit skipping or reordering a gate.

1. Authorize and bootstrap the public GitHub repository at the exact reviewed
   commit; verify protection before accepting changes.
2. Authorize the package-registry identity and publish the exact previously audited
   artifact with least-privilege credentials. Verify its registry digest and fresh
   offline-install behavior.
3. Authorize static-site deployment from the exact release commit. Verify the
   published origin, subpath behavior, fixture labeling, accessibility, and absence
   of unexpected or unreviewed genuine claims. The initial `0.1.0` snapshot is
   fixture-only.
4. Create the signed or annotated `v0.1.0` release tag only from the accepted commit
   under the host's protected release procedure. Attach checksums and release notes;
   do not attach private review artifacts.
5. Authorize and send GitHub/Discord announcements only after the package and site
   verification passes. Draft approval does not authorize sending.

Real-mode activation, production-profile admission, and the first genuine report
follow the separate ATLAS-013 and activation ceremony in
[`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md). A public fixture-only release does
not satisfy or bypass those gates.

## Stop and rollback

Stop release on any privacy finding, unpinned workflow action, CODEOWNERS error,
protection mismatch, unexpected package file/dependency, generated drift,
unexpected or unreviewed production profile/report/claim state, changed real gate,
unexplained Git state, or failed independent review.

Before announcement, prefer withholding or removing the newly published package or
deployment through the owning host's documented process. After disclosure, treat
credentials/private data as incidents and follow the security runbook; do not claim
that deleting a tag, package version, deployment, or current-tree file erases
copies. Re-establish an exact trusted baseline and rerun every affected gate before
resuming.
