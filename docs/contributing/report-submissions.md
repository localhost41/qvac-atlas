# Report submission guide

> **The accountless path is built but deployment-gated.** The production profile
> allowlist, shipped real mode, and reviewed relay origin remain disabled. Fixture
> output is never eligible. This page documents the exact behavior once those
> separate release gates are approved.

For the current safe path, use the
[five-minute fixture-only walkthrough](five-minute-fixture-walkthrough.md). Its
submission step deliberately stops without publishing anything.

## What publication means

An Atlas report contains allowlisted hardware and software details rather than a
name or account field. That combination can still be identifying. A merged report
is public, durable Git history. Review the complete JSON before submitting it.

After the report is previewed and written locally, Atlas may offer one accountless
submission choice. It names one source-pinned HTTPS relay and sends only the exact
final JSON if you answer `yes`. `no`, Enter, EOF, cancellation, an ineligible
profile, or a disabled endpoint makes no request. There is no telemetry, hidden
upload, background retry, contributor credential, or automatic public publication.

Accountless does not mean network-anonymous. The hosting edge necessarily processes
connection metadata, and GitHub records the relay's queue activity and timing. The
Atlas application strips forwarding, cookie, and authorization headers and keeps
no application access log. Queue items remain private pending review. Maintainers
schedule rejected refs for deletion within 30 days, but GitHub backups and internal
retention may persist under the provider's policies.

## What belongs in the report

Submit the probe-produced JSON unchanged. The normative schema permits only:

- coarsened OS, CPU, memory, GPU, driver, Node, QVAC, probe, and sanitizer facts;
- structured official-check and lifecycle phase results;
- requested and directly observed generic `cpu|gpu` device evidence;
- bounded normalized failure evidence and redaction counts;
- explicit fingerprint acknowledgement and publication consent.

Never add identity, hostname, network addresses, serial numbers, paths, environment
values, credentials, commands, process data, configuration, prompts, generated
output, full logs, Markdown, HTML, JavaScript, claims, scores, or recommendations.

## Name and stage the file

For report ID `sha256:<64 lowercase hex>`, the only accepted path is:

```text
reports/v1/sha256-<same 64 lowercase hex>.json
```

The report must be a regular file of at most 256 KiB. Symlinks, nested paths,
alternate names, unknown schema majors, and edited IDs are rejected. Stage the file
before running the audit so Git can prove it is part of the proposed contribution.

## Why the first audit may reject a valid report

Every genuine report needs one protected source entry in `registry/catalog.json`.
An accountless queue report must use `independence: "unverified-anonymous"` and the
single reserved `source:anonymous-relay` key. Any number of such reports therefore
counts as at most one source and cannot manufacture an independently reproduced
claim. A separate, identity-reviewed non-anonymous contribution may instead receive
a maintainer-owned opaque `source:<32 lowercase hex>` key. Neither value comes from
the report JSON.

A report must also match exactly one production profile already approved by the
project. Profile admission is a separate release decision. Maintainers will not add
a profile merely to make a report pass.

Once the maintainer metadata commit is present, the audit reconciles the report
directory and registry in both directions, validates every report, rebuilds the
catalog, and requires byte-identical generated output before merge.

For fingerprint decisions, exact-target local cleanup, withdrawal/supersession
limits, and incident response, see
[`privacy-removal-incidents.md`](privacy-removal-incidents.md).
