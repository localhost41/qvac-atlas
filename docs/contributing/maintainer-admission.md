# Maintainer report admission

Treat every report pull request as publication of permanent, untrusted data.

## Initial public-host trust bootstrap

The workflow deliberately rejects a push event whose `before` value is all zero,
because there is no trusted base from which to prove append-only history. Do not add
a bypass input, special branch name, fallback ref, or weaker first-push path.

Creating the public host is a separate, explicitly human-authorized bootstrap. The
host operator imports the exact already-reviewed repository commit while genuine
reports and the production-profile allowlist are empty, records that full commit as
the initial trusted baseline in the host administration record, and immediately
configures the named code owners, protected release branch, required current
approval, and required checks. No report, profile, or activation change belongs in
that import. The next repository change must use a pull request based on that exact
baseline and pass the ordinary exact base/target audit. If the host cannot establish
those controls before accepting changes, report admission stays closed.

## Maintainer-owned first-report admission branch

A report-only contribution cannot pass the bidirectional registry audit, while a
metadata-only change cannot be merged ahead of its report. That mutual requirement
is intentional. It must not be weakened for the first report or for a fork that a
maintainer cannot safely update.

1. Keep the contributor's pull request as the durable record of their deliberate
   submission and exact report commit. Do not ask them to author `sourceKey` or
   production-profile metadata.
2. From the protected release base, create a maintainer-owned admission branch.
   Transfer the exact report blob from the contributor's named commit without
   editing its bytes, and verify that its canonical filename and `report_id` still
   match.
3. Confirm that the production profile was approved in an earlier, separate
   change. Establish source independence from review evidence, add exactly one
   maintainer-controlled `sourceKey`, and rebuild the catalog on the same admission
   branch.
4. Open the admission pull request from that maintainer-owned branch and identify
   the superseded contributor pull request in review metadata, never in the report.
   The bidirectional report-to-registry checks remain unchanged.
5. After the latest push, require fresh code-owner approval and the protected exact
   base/target CI result. The author of the final metadata change does not substitute
   for the required reviewer. Close the contributor pull request as superseded only
   after the admission review has preserved its exact submitted blob and intent.

## Review sequence

1. Confirm the contributor intentionally opened the PR and completed the privacy
   acknowledgement. Never infer consent from a pasted file outside this workflow.
2. Inspect the exact diff. The PR must add one regular JSON file at
   `reports/v1/sha256-<64 lowercase hex>.json`; it must not alter existing reports.
3. Run the frozen install and `pnpm ready:local`, then require protected CI's exact
   base/target history audit. Privacy errors identify only rules and paths; do not
   ask the contributor to paste the rejected value into an issue or comment.
4. Confirm the report matches exactly one already-approved production profile.
   Production profile admission is a separate technical and release gate, never a
   convenience edit in a report PR.
5. Establish source independence from review evidence. Add exactly one genuine
   source entry to `registry/catalog.json`:

   ```json
   {
     "kind": "genuine",
     "lifecycle": { "state": "active" },
     "path": "reports/v1/sha256-<64 lowercase hex>.json",
     "sourceKey": "source:<32 lowercase hex>"
   }
   ```

   A genuine `sourceKey` is a repository-scoped opaque 128-bit token. It must be
   stable across repeated reports from the same underlying source, but must not be
   derived from or contain a person's name, username, email, organization, PR
   number, report ID, hardware/device ID, or contributor-authored value.

6. Rebuild the catalog and inspect the exact generated diff. Verify that the badge,
   requested/observed device, compatibility key grouping, source count, report
   detail, and limitations follow the structured evidence.
7. Require CI success and a final human review before merge.

## Ordinary correction and withdrawal

Never edit or delete an accepted report through the ordinary workflow. A reviewed
non-sensitive correction adds a new canonical report and active metadata entry,
then changes the old entry to:

```json
{
  "state": "superseded",
  "replacementPath": "reports/v1/sha256-<replacement report hex>.json"
}
```

The replacement must be an existing active genuine report with exactly the same
opaque `sourceKey`. A normal withdrawal changes only the old lifecycle to
`{"state":"withdrawn"}`. Both states remove retired evidence from current pages,
counts, and claims while retaining and validating its append-only report file.
They do not erase public Git history.

Do not use ordinary withdrawal for a secret, credential, private identifier, or
other forbidden content. That report must not be retained as ordinary validated
evidence; stop publication and use the exceptional host-authority incident process.
There is no CI flag or metadata value that permits report deletion or history
mutation.

## Append-only history proof

Current-tree validation is necessary but cannot prove that an accepted report was
not replaced or removed relative to earlier trusted history. Pull-request CI calls
the contribution audit with the exact GitHub base commit and checked-out target:

```text
node scripts/validate-contribution.mjs --base <40-hex-base> --target <40-hex-target>
```

Both revisions must be explicit, nonzero, locally available commit IDs. The base
must be an ancestor of the checked-out target. CI rejects a modified, deleted,
renamed, type-changed, or mode-changed pre-existing genuine report and permits only
new canonical `reports/v1/sha256-<64 lowercase hex>.json` regular files. Every
introduced parent-child edge is checked when its parent contains a report already
trusted at the base, so modifying or deleting that report and restoring it at the
target still fails. A topic branch forked before a later base report is not treated
as if it already contained that report; the eventual merge edge from the trusted
base is checked instead. Traversal is finite and fails closed when its bound is
exceeded. The audit never guesses a branch, merge base, or fallback ref. Pull
requests use the exact event base SHA; pushes use the exact nonzero `before` SHA.
Missing history, an all-zero push base, an unrelated revision, or a target other
than checked-out `HEAD` fails closed.

Running `node scripts/validate-contribution.mjs` without revision arguments remains
useful before a commit: it validates the current report tree, registry mapping,
schema, privacy, consent, profile admission, and generated catalog. Its success
message explicitly says append-only history was not proven. Do not treat that local
result as the history proof required by CI and maintainer admission.

## Set invariants

The audit enforces all of these simultaneously:

- every file in `reports/v1/` has its canonical ID-derived filename;
- every report is a bounded, regular, tracked file;
- every report appears exactly once as a genuine registry source;
- every genuine registry source maps to one existing report;
- every genuine report already present at the trusted base remains byte- and
  mode-identical throughout relevant introduced history and at the target;
- every genuine source has one exact lifecycle, and only active genuine evidence
  enters current pages, counts, and claims;
- every superseded source points directly to an active same-source replacement;
- report ID, schema, semantics, privacy, consent, provenance, and trusted profile
  match all pass;
- the deterministic catalog equals the checked-in generated file;
- fixtures and test-only profiles never cross into genuine claims.

Do not bypass an invariant by weakening validation, changing a report after ID
generation, or assigning a production profile to fixture evidence.

## Incident handling

If private data reaches a public branch or pull request, stop review. Treat the data
as disclosed, rotate affected credentials, remove the public artifact, and follow
the host's Git-history remediation procedure. A later deletion commit does not make
the original object private. The complete stop-publish, public-surface removal,
minimal sanitized incident-record, and re-audit sequence is in
[`privacy-removal-incidents.md`](privacy-removal-incidents.md).
