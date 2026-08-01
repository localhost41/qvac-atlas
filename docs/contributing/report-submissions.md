# Report submission guide

> **Genuine report submissions are currently closed.** The production profile
> allowlist is empty and shipped real mode is disabled. This page documents the
> future reviewed shape; it is not an invitation to submit fixture output.

## What publication means

An Atlas report contains allowlisted hardware and software details rather than a
name or account field. That combination can still be identifying. A merged report
is public, durable Git history. Review the complete JSON before submitting it.

Atlas does not provide an upload command, API, telemetry path, or automated issue
filing. The only V1 submission mechanism is a pull request you create deliberately.

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

Every genuine report needs one trusted source entry in `registry/catalog.json`.
That entry contains a maintainer-owned `sourceKey`, used only to decide whether
reports are independent. It never comes from contributor JSON. Leave registry
metadata and profile allowlists to maintainers; request maintainer review on the
draft pull request.

A report must also match exactly one production profile already approved by the
project. Profile admission is a separate release decision. Maintainers will not add
a profile merely to make a report pass.

Once the maintainer metadata commit is present, the audit reconciles the report
directory and registry in both directions, validates every report, rebuilds the
catalog, and requires byte-identical generated output before merge.

For fingerprint decisions, exact-target local cleanup, withdrawal/supersession
limits, and incident response, see
[`privacy-removal-incidents.md`](privacy-removal-incidents.md).
