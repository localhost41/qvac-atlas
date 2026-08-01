# Privacy, removal, and incident guidance

Genuine QVAC Atlas report submissions are currently closed. The production profile
allowlist is empty, and the shipped CLI keeps real QVAC execution disabled. Code,
documentation, and fixture-only test contributions remain open. Fixture reports are
demonstration data and must never be submitted as hardware compatibility evidence.

This guide explains decisions and cleanup without creating an upload path. Atlas
never uploads a report, opens an issue, or creates a pull request. A future public
submission would be a separate action performed deliberately by a contributor after
the project announces that genuine submissions are open.

## Installation and verification prerequisites

Repository contributors need:

- Node major 22;
- pnpm exactly `11.10.0`, matching the root `packageManager` pin;
- a Git checkout with enough space for the Atlas workspace dependencies and test
  output; and
- no QVAC installation or model artifact for code, documentation, schema, catalog,
  site, or fixture-only test contributions.

Atlas does not install QVAC. Do not add QVAC to this workspace, use `npx` as a
fallback, download the candidate model, or try to enable real mode to work on these
contribution types.

From the repository root, install and verify with the pinned toolchain:

```text
pnpm install --frozen-lockfile
pnpm check
node scripts/validate-contribution.mjs
node scripts/build-catalog.mjs
git diff --exit-code -- apps/site/src/generated/catalog.json
```

Review the final Git diff and unexplained files before proposing a contribution.
These mechanical checks do not authorize publication or replace human review.

## Decide whether to keep or publish a fingerprint

A report has no name, email, or account field, but its combination of OS version,
CPU, GPU, driver, memory bucket, Node version, and QVAC version can still be
identifying. Before keeping a local report or, after submissions eventually open,
proposing it for publication:

1. Read the complete final JSON rather than a summary or screenshot.
2. Consider whether the combined hardware and software details identify you, your
   employer, or an uncommon machine.
3. Check that it contains no path, credential, identifier, prompt, generated text,
   configuration, environment value, or raw log.
4. If uncertain, decline publication. You may also decline the separate local-write
   decision so no report file is created.
5. Do not assume later withdrawal will erase Git history, forks, caches, or copies.

Consent to local collection is not consent to publication. Choosing publication
intent does not upload anything; Atlas has no upload command or automatic
submission mechanism.

## Remove a never-submitted local report

Use this procedure only when the report has never left the machine: it was not
attached to a message, placed in a synced folder, pushed to Git, or included in a
pull request.

1. Stop Atlas and confirm no report write is still in progress.
2. Identify the one exact output file chosen during the CLI ceremony. If the target
   is uncertain, stop instead of deleting a directory or similarly named files.
3. Inspect that exact file locally, then use the operating system's single-file
   “Move to Trash” or “Move to Recycle Bin” action. Do not select its parent
   directory.
4. Confirm only that file moved. Keep it recoverable there, or later permanently
   delete that same one item with the host's single-item action.

If the report entered any public or shared surface, use the withdrawal or incident
process below. Local deletion alone is not sufficient.

## Remove the cached candidate artifact

The only candidate artifact described by the current dormant packet has this exact
cache target:

```text
~/.qvac-atlas-models/smollm2-360m-instruct-q8_0.gguf
```

After Atlas, QVAC, and their child processes have fully exited, open the fixed
`.qvac-atlas-models` directory with the operating system's file browser. Verify the
exact filename above and move only that one file to Trash. Do not remove the cache
root, another model, a partial file, or the containing home directory.

If the target is a link, has the wrong name or metadata, is a named partial, or may
still be open by a process, stop and request maintainer review. Do not improvise a
recursive or wildcard cleanup.

## Request public report withdrawal or supersession

Once a report appears in a pull request, public branch, generated site, or other
shared surface, treat it as published. Use the repository host's normal maintainer
review channel; this project does not currently define a public URL or contact
identity.

Provide only the report ID, the affected public surface, and whether you request
current-surface withdrawal or a reviewed superseding correction. Do not paste the
sensitive value or add new identity information to the request. For a credential or
privacy exposure, use a private security channel if the eventual repository host
provides one and follow the incident process below.

Maintainers must not silently edit an accepted report. A non-sensitive correction
must supersede rather than mutate or delete the accepted evidence. A privacy
withdrawal may require removing the report from current public surfaces under the
incident process below. Neither supersession nor current-surface removal proves
erasure from Git object history, forks, caches, mirrors, screenshots, or prior
downloads. A deletion commit is not an erasure guarantee.

## Maintainer credential or privacy incident response

If a credential, identifier, private path, prompt, generated content, or other
forbidden material reaches review or a public surface:

1. Stop publication, review, catalog generation, and deployment of the affected
   material. Do not quote the value in an issue, log, test, or review comment.
2. Treat the value as disclosed. Rotate or revoke affected credentials through the
   responsible provider, outside public discussion.
3. Remove the affected current-tree report and generated public surfaces, and
   remove only host-controlled pull-request artifacts, CI artifacts, caches, or
   deployments proven to contain the incident data where the host permits. Keep
   the release stopped.
4. Follow the repository host's credential-removal and Git-history remediation
   procedure. History rewriting, force updates, and coordination with clones or
   mirrors require separate maintainer authority; deleting the current file is not
   enough.
5. Preserve only a minimal sanitized incident record: a coarse time window,
   forbidden-data category, affected surface classes, rotation/revocation status,
   remediation status, and review outcome. Never preserve the exposed value, raw
   report, local path, token, prompt, generated text, or full log in that record.
6. Re-run schema, privacy, contribution, catalog, site, and Git-diff audits on the
   remediated state. Resume review or publication only after a human maintainer
   confirms the affected surfaces are addressed and credentials are safe.

The maintainer admission sequence remains authoritative for report review; see
[`maintainer-admission.md`](maintainer-admission.md). The future submission shape
and privacy allowlist are described in
[`report-submissions.md`](report-submissions.md).

## Human usability review remains external

Automated documentation checks can prove that safety notices, sections, and links
exist. They cannot prove that a new contributor understands them. The release
checklist item for testing installation, contribution, privacy, incident, and
removal guidance from a new contributor's perspective remains unchecked until a
human completes that review.
