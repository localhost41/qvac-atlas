# ATLAS-037 — Accessible contribution flow and public registry experience

Status: in progress  
Owner: root  
Depends on: ATLAS-034, ATLAS-036, D-020

## Objective

Turn the source-complete Atlas candidate into a community-readable product:
one understandable contribution command, one local-run consent, one anonymous
submission decision, richer privacy-bounded result details, and a static
registry landing experience that makes browsing and contributing obvious.

## Contract

- Primary command: `npx --yes qvac-atlas@0.3.0 contribute`.
- Optional advanced local destination: `contribute --output <path>`.
- No menu, account, silent upload, automatic public publication, or retry.
- Exact local sequence: combined disclosure/consent → bounded run → concise
  summary → private exact JSON write → `Submit anonymous report? [y/N]`.
- No/Enter means local-only and zero requests; yes means one exact-body relay
  request after the successful local write.
- Summary and public cards expose SoC/CPU, architecture, memory bucket, GPU
  evidence/limitations, OS/kernel, Node, QVAC, requested/observed device, and
  outcome without exposing identity or arbitrary machine data.
- Registry home and `/contribute/` are static, keyboard-accessible, responsive,
  searchable, filterable, and explicit about evidence limitations.

## Allowed paths

- `packages/cli/src/**`
- `packages/catalog/src/**`
- `apps/site/src/**`
- `apps/site/public/**`
- `docs/**`
- Focused tests and generated catalog/build output only when produced by the
  documented build scripts.

## Acceptance criteria

1. CLI parser accepts `contribute` and preserves dormant release-gate behavior.
2. Enabled seam has one pre-run question and one exact submission question;
   no raw JSON dump or second write prompt is required.
3. No/Enter is proven to write locally and make zero submission calls.
4. Rich summary is derived only from validated allowlisted report fields.
5. Site has browse/contribute CTAs, a contribution page, search, hardware and
   software filters, exact-report links, and visible limitations.
6. CLI, catalog, site, type, privacy, and generated-drift tests pass.

## Verification

Run `pnpm test`, `pnpm lint`, `pnpm build`, and
`pnpm --filter @qvac-atlas/site build`. External relay/Pages/npm activation remains a later release operation;
this work packet does not publish the private physical report.
