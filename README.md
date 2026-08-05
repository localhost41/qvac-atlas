# QVAC Atlas

QVAC Atlas is an evidence-backed hardware compatibility registry for QVAC.

The V1 workflow is deliberately narrow:

```text
consented local probe
  -> sanitized, versioned JSON report
  -> explicit accountless submission to a private review queue
  -> reviewed Git promotion
  -> static compatibility registry
```

Atlas is not a replacement for `qvac doctor`. It uses official QVAC diagnostics as evidence, then records whether one pinned workload actually started, which backend was directly observed, and whether it completed.

## Project status

The fixture-driven vertical slice is implemented: consent ordering, report
validation, a fail-closed project-local SDK resolver, deterministic Git admission,
and the static registry all pass the workspace gate. The CLI deliberately exposes
only synthetic scenarios today. A deterministic, zero-runtime-dependency local
`qvac-atlas@0.1.0` remains the reviewed fixture-only baseline. ATLAS-036 adds the
source-complete `0.2.0` accountless submission path, and ATLAS-037 simplifies the
next `0.3.0` candidate to one local-run decision plus one submission decision: a
bounded HTTPS relay, a private GitHub App queue, and mechanically unverified
anonymous source metadata. Its production relay origin remains disabled until the
exact deployment passes a separate operations and privacy review.

Real QVAC execution, model download, genuine claims, and real-mode activation
remain disabled, and the production profile allowlist is empty. A real lifecycle needs an existing
project-local QVAC SDK, enough disk for its multi-gigabyte dependency graph and the
386,404,992-byte pinned model, then explicit human review. Do not describe the
current fixture registry as hardware compatibility evidence.

V1 real execution is limited to macOS arm64. Linux, Windows, and non-arm64 macOS
must refuse before project resolution or any cache, network, temporary-file, or
process effect; support for those hosts is post-V1 work.

See [`docs/PROJECT.md`](docs/PROJECT.md) for the immutable V1 boundary and [`docs/STATUS.md`](docs/STATUS.md) for the current verified state.

## Try the fixture-only preview

After the reviewed `0.2.0` release is published, use Node 22 in a fresh project:

```bash
npm install --ignore-scripts --save-dev qvac-atlas@0.2.0
npx qvac-atlas --help
```

The public static registry is at <https://localhost41.github.io/qvac-atlas/>. Start
with the [five-minute synthetic walkthrough](docs/contributing/five-minute-fixture-walkthrough.md).

## Accountless report submission

The complete anonymous submission path is implemented and locally tested, but the
shipped source still pins its relay origin to `null` and keeps real mode disabled.
Fixture output can never be submitted. After a reviewed deployment is pinned, the
community command will be `npx --yes qvac-atlas@0.3.0 contribute`: it shows one
combined local-run disclosure, a rich allowlisted result summary, saves the report
privately, and asks `Submit anonymous report? [y/N]`. Enter keeps the report local;
yes sends the exact saved bytes once to the private queue.
Code, documentation, and fixture-only test contributions remain open.

Atlas never submits silently, retries in the background, or publishes queue items
automatically. Before installing contributor dependencies or keeping any future
local report/model cache, read the
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

## Build the local release candidate

After the repository gate passes:

```bash
pnpm package:local
pnpm package:audit -- .artifacts/qvac-atlas-0.2.0.tgz
```

The artifact is audited before atomic no-clobber publication to `.artifacts/` and
installs offline with no runtime dependencies or QVAC installation. See
[`docs/distribution.md`](docs/distribution.md) for the exact file allowlist and
fresh-project smoke test. Only the exact audited artifact may be published;
registry and protected-host verification remain mandatory release gates.

## License

QVAC Atlas is licensed under [Apache-2.0](LICENSE). Bundled third-party
attributions are recorded in the CLI package `NOTICE`.
