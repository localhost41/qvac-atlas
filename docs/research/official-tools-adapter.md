# Official QVAC tools adapter research

Status: verified against `@qvac/cli` 0.9.0 source and npm package metadata on
2026-07-31.

## Doctor boundary

Atlas may invoke Doctor only when `@qvac/cli` is already resolvable from the
contributor's selected project root. It must resolve the package with Node's
normal project-scoped module resolution and spawn the resolved CLI entry with
`process.execPath`, `doctor`, and `--json`.

Atlas must not:

- search the ambient `PATH` or global package installation;
- inspect or execute `.bin` or `.cmd` shims;
- run `npx`, `npm exec`, or `pnpx`;
- silently install or update QVAC packages; or
- import Doctor internals, which are not a supported package export.

If the package cannot be resolved, Doctor is `skipped` with a structured
`qvac-cli-not-locally-resolvable` reason. This is missing evidence, not a QVAC
failure.

`doctor --json` normally emits one JSON report. Exit zero means the report's
`ok` field is true. Exit one can mean either a valid report with a failed check
or an unexpected CLI error, so Atlas must require valid JSON before treating
the former as official check evidence.

The adapter requires an outer deadline, byte-capped output, and process-tree
cleanup. It may retain only an allowlist such as `ok`, platform, architecture,
Node version, and per-check `id`, `status`, and `severity`. Raw Doctor output
must never enter an Atlas report: labels and hints can contain the contributor's
project path, and values may contain more hardware detail than Atlas permits.

## Bundle verification

`qvac verify bundle` is not applicable to the V1 probe. It validates an existing
deployment bundle or dependency tree for named target hosts; it does not prove
local worker startup, inference, or the backend actually used. It can also load
project configuration and surface resolved paths.

Atlas records bundle verification as `skipped` with reason
`no-existing-contributor-worker-bundle`. It does not create a bundle solely to
run this check.

## Source evidence

Verified in the QVAC repository at the release lines corresponding to current
published packages:

- `packages/cli/package.json`: the root CLI is the only public package entry.
- `packages/cli/src/index.ts`: Doctor command and exit-code behavior.
- `packages/cli/src/doctor/index.ts`: JSON output behavior.
- `packages/cli/src/doctor/check.ts`: bounded subprocess checks.
- `packages/cli/src/doctor/checks/hardware.ts`: path-bearing and device-bearing
  raw fields.
- `packages/sdk/commands/verify/index.ts`: bundle-verifier inputs, project config
  loading, and path-bearing results.

