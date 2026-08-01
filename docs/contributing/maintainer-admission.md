# Maintainer report admission

Treat every report pull request as publication of permanent, untrusted data.

## Review sequence

1. Confirm the contributor intentionally opened the PR and completed the privacy
   acknowledgement. Never infer consent from a pasted file outside this workflow.
2. Inspect the exact diff. The PR must add one regular JSON file at
   `reports/v1/sha256-<64 lowercase hex>.json`; it must not alter existing reports.
3. Run the frozen install, full workspace check, and contribution audit. Privacy
   errors identify only rules and paths; do not ask the contributor to paste the
   rejected value into an issue or comment.
4. Confirm the report matches exactly one already-approved production profile.
   Production profile admission is a separate technical and release gate, never a
   convenience edit in a report PR.
5. Establish source independence from review evidence. Add exactly one genuine
   source entry to `registry/catalog.json`:

   ```json
   {
     "kind": "genuine",
     "path": "reports/v1/sha256-<64 lowercase hex>.json",
     "sourceKey": "<maintainer-controlled stable source class>"
   }
   ```

   A `sourceKey` must be stable across repeated reports from the same underlying
   source. Never use a PR number or report ID as proof of independence, and never
   copy a contributor-authored key from report content or discussion.

6. Rebuild the catalog and inspect the exact generated diff. Verify that the badge,
   requested/observed device, compatibility key grouping, source count, report
   detail, and limitations follow the structured evidence.
7. Require CI success and a final human review before merge.

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
new canonical `reports/v1/sha256-<64 lowercase hex>.json` regular files. It never
guesses a branch, merge base, or fallback ref. Pull requests use the exact event
base SHA; pushes use the exact nonzero `before` SHA. Missing history, an all-zero
push base, an unrelated revision, or a target other than checked-out `HEAD` fails
closed.

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
  mode-identical at the target;
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
