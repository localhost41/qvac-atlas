# Release process

This process separates a mechanically releasable candidate from the human and
external decisions that authorize publication. No command in this document grants
authority to create a remote, publish a package, deploy a site, admit evidence, or
send an announcement.

## Human assignments required before launch

Record real people or valid GitHub teams in the private release record and replace
the bounded repository placeholders before public bootstrap:

| Responsibility | Repository placeholder | Required decision |
| --- | --- | --- |
| Primary code owner and release captain | `@PRIMARY_CODE_OWNER_HANDLE_REQUIRED` | Accept the exact release commit and coordinate gates. |
| Evidence/admission owner | `@EVIDENCE_CODE_OWNER_HANDLE_REQUIRED` | Review profiles, genuine reports, and source-independence metadata. |
| Security owner | `@SECURITY_CODE_OWNER_HANDLE_REQUIRED` | Receive private reports and approve security/incident readiness. |
| Host operator | none; record privately | Create/configure the authorized public host and return verification evidence. |
| Independent reviewer | none; record privately | Review the exact candidate after the latest change. |
| Legal/license approver | none; record privately | Choose and approve the repository/package license. |
| Registry publisher | none; record privately | Control package-registry identity and credentials. |

One person may hold multiple operational roles only if the required independent
review still comes from someone other than the author of the latest protected
change. Do not encode personal names, email addresses, credentials, or source
identities in reports.

## Candidate contract

The V1 distribution contract is one unscoped `qvac-atlas@0.1.0` CLI package with
the `qvac-atlas` binary. It contains one bundled zero-runtime-dependency CLI, the
three fixed supervised child entry files required by that bundle, the two exact
runtime JSON Schemas, `README.md`, and `NOTICE`; it contains no tests, fixtures,
reports, source maps, caches, credentials, local paths, or workspace-only packages.
All internal workspace packages remain private at `0.1.0`. The workspace root
remains private and is not a release artifact.

The shipped CLI real-mode seam must remain the literal `false`. A local package
artifact may be built and installed without authorizing npm publication. Any
future topology, package name, version, file-list, dependency, or activation change
requires an explicit reviewed update to this contract and its readiness tests.

## Candidate preparation

1. Start from an exact reviewed commit with an empty production-profile allowlist,
   no genuine reports or claims, and the real gate still false.
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

- the legal approver selects a license and confirms third-party notice obligations;
- all three CODEOWNERS placeholders are replaced with valid handles;
- the host operator follows
  [`operations/public-host-bootstrap.md`](operations/public-host-bootstrap.md) and
  returns a passing read-only verification for the exact imported commit;
- private vulnerability reporting and the support/security routes are usable;
- the protected `main` branch requires current code-owner approval, approval after
  the latest push, the exact required check, resolved conversations, and no bypass,
  force push, deletion, or administrator exemption; and
- the initial trusted baseline is recorded before the next change, as required by
  the maintainer-admission procedure.

A placeholder CODEOWNERS file is local preparation only and must never be described
as named ownership or repository trust.

## External release sequence

Each step needs a fresh explicit human authorization. Do not infer later authority
from approval of an earlier step.

1. Authorize and bootstrap the public GitHub repository at the exact reviewed
   commit; verify protection before accepting changes.
2. Authorize the package-registry identity and publish the exact previously audited
   artifact with least-privilege credentials. Verify its registry digest and fresh
   offline-install behavior.
3. Authorize static-site deployment from the exact release commit. Verify the
   published origin, subpath behavior, fixture labeling, accessibility, and absence
   of genuine claims.
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
protection mismatch, unexpected package file/dependency, generated drift, nonempty
production claim, changed real gate, unexplained Git state, or failed independent
review.

Before announcement, prefer withholding or removing the newly published package or
deployment through the owning host's documented process. After disclosure, treat
credentials/private data as incidents and follow the security runbook; do not claim
that deleting a tag, package version, deployment, or current-tree file erases
copies. Re-establish an exact trusted baseline and rerun every affected gate before
resuming.
