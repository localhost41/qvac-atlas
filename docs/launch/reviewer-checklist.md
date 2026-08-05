# ATLAS-034C reviewer checklist

This review covers local site/deployment readiness, contributor usability, and
unsent launch materials. It cannot authorize deployment, package publication,
genuine submissions, real-mode activation, or announcements.

## Mechanical review

From the exact reviewed commit on Node 22:

```sh
pnpm install --frozen-lockfile
pnpm --filter @qvac-atlas/site test
git diff --check
```

Confirm all site tests pass, including builds at `/` and `/atlas-subpath/`. Then
inspect the launch snapshot:

```sh
node --input-type=module -e '
import fs from "node:fs";
const registry=JSON.parse(fs.readFileSync("registry/catalog.json","utf8"));
const catalog=JSON.parse(fs.readFileSync("apps/site/src/generated/catalog.json","utf8"));
console.log({
  production_profiles: registry.productionProfiles.length,
  genuine_reports: catalog.reports.length,
  claims: catalog.claims.length,
  fixtures: catalog.fixtures.length
});'
```

Expected: zero production profiles, zero genuine reports, zero claims, and a
nonzero fixture count. Any different current-state result requires a separately
reviewed admission change and makes this packet stale.

## Deployment-control review

Inspect `.github/workflows/site-release.yml` and require all of the following:

- the only trigger is `workflow_dispatch`;
- `deploy` is a required boolean whose default is `false`;
- both jobs require `refs/heads/main`;
- the build job has only `contents: read`;
- only the conditional deploy job receives `pages: write` and `id-token: write`;
- deployment targets the protected `github-pages` environment;
- every action uses an exact 40-character commit, not a tag; and
- ordinary CI does not invoke the deployment workflow.

The reviewer re-resolves every action commit against its documented upstream tag.
The host operator must configure GitHub Pages for workflow deployment and the
`github-pages` environment for owner-operated mode (no reviewer rule),
administrator bypass disabled, and protected-branch-only deployment before ever
selecting `deploy: true`. The read-only host verifier must confirm those settings
and the newest GitHub-Actions-bound workspace check on the exact release commit is
successful.

## Usability and evidence review

- Complete the five-minute walkthrough without repository-only knowledge after
  receiving the local artifact path and digest.
- At 200% zoom and a narrow viewport, verify navigation, filters, cards, report
  JSON, and focus indicators remain usable without page-level horizontal scrolling.
- Use keyboard-only navigation to reach the skip link, primary navigation, every
  filter, reset control, report link, and scrollable JSON block.
- Confirm the registry empty state and fixture lab never imply that fixture
  success is hardware compatibility evidence.
- Confirm each report detail shows requested and directly observed devices,
  derivation reasons, exact validated JSON, and evidence limitations.
- Confirm no analytics, external font/script/image, account, form submission, or
  network API was added.

## Launch-material review

Read the private-beta packet, rollback packet, local release notes, and both
announcement drafts. They must say **unsent**, **fixture-only**, **real-disabled**,
and **submissions closed**. Placeholder owners, contacts, URLs, digests, and legal
decisions remain explicit human gates; reviewers must not invent them.

Return exactly one verdict:

```text
ATLAS-034C review
Static root/subpath build: PASS | HOLD
Accessibility/responsive/evidence review: PASS | HOLD
Manual deployment controls: PASS | HOLD
Five-minute fixture journey: PASS | HOLD
Private-beta and rollback packet: PASS | HOLD
Unsent launch copy: PASS | HOLD
External deployment/publication authority: NOT GRANTED
Notes: none | <bounded finding>
```
