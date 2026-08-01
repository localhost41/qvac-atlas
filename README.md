# QVAC Atlas

QVAC Atlas is an evidence-backed hardware compatibility registry for QVAC.

The V1 workflow is deliberately narrow:

```text
consented local probe
  -> sanitized, versioned JSON report
  -> reviewed Git contribution
  -> static compatibility registry
```

Atlas is not a replacement for `qvac doctor`. It uses official QVAC diagnostics as evidence, then records whether one pinned workload actually started, which backend was directly observed, and whether it completed.

## Project status

The fixture-driven vertical slice is implemented: consent ordering, report
validation, a fail-closed project-local SDK resolver, deterministic Git admission,
and the static registry all pass the workspace gate. The CLI deliberately exposes
only synthetic scenarios today.

Real QVAC execution, model download, production-profile admission, genuine claims,
publishing, and deployment remain disabled. A real lifecycle needs an existing
project-local QVAC SDK, enough disk for its multi-gigabyte dependency graph and the
386,404,992-byte pinned model, then explicit human review. Do not describe the
current fixture registry as hardware compatibility evidence.

V1 real execution is limited to macOS arm64. Linux, Windows, and non-arm64 macOS
must refuse before project resolution or any cache, network, temporary-file, or
process effect; support for those hosts is post-V1 work.

See [`docs/PROJECT.md`](docs/PROJECT.md) for the immutable V1 boundary and [`docs/STATUS.md`](docs/STATUS.md) for the current verified state.

## Genuine report submissions are closed

The production profile allowlist is empty and the shipped CLI keeps real mode
disabled, so genuine hardware report submissions are not currently accepted. Do
not submit fixture output as compatibility evidence. Code, documentation, and
fixture-only test contributions remain open.

Atlas never uploads a report or opens a pull request. Before installing contributor
dependencies or keeping any future local report/model cache, read the
[`privacy, removal, and incident guidance`](docs/contributing/privacy-removal-incidents.md).

## Verify the repository

Use Node major 22 and pnpm `11.10.0`, as pinned by `packageManager`. Code,
documentation, site, schema, catalog, and fixture-only test work does not require
QVAC or the candidate model. Atlas does not install QVAC.

```bash
pnpm install --frozen-lockfile
pnpm ready:local
```

The frozen install is a separate fresh-checkout prerequisite. `ready:local` checks
the current tree, full workspace, deterministic catalog, generated diff, and
repository cleanliness. It does not prove exact append-only history, physical
hardware or privacy evidence, repository protection, activation, deployment, or
release approval.
