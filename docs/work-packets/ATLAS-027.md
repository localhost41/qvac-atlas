# ATLAS-027 — CLI truth and zero-effect help

Status: completed

## Scope

Remove obsolete scaffold-only CLI surfaces and make help truthful, accessible, and
effect-free. This task does not enable real execution or alter report, profile,
catalog, acquisition, or executor semantics.

Allowed paths:

- `packages/cli/src/**`
- `packages/cli/test/**`
- `packages/cli/package.json`
- `packages/probe/src/runner.ts`
- `apps/site/package.json`
- task/status documentation owned by the release captain

## Acceptance

- `qvac-atlas --help`, `qvac-atlas -h`, and `qvac-atlas probe --help` write help
  to stdout and exit zero before TTY, cwd, prompt, probe, filesystem, real-module,
  QVAC, model, or network effects.
- Exact real intent remains hard-disabled by the shipped literal-false gate. Its
  fixed message states that ATLAS-013 physical/privacy validation and a separate
  reviewed activation decision are required; it must not claim that the already
  integrated resolver/executor binding is unfinished.
- Malformed fixture and real syntax remains fixed, path-free, and effect-free.
- The dead `LocalMockProbeAdapter`, `renderFixtureResult`, scaffold labels, and
  stale future-executor comments are removed rather than renamed into new surface.
- The existing special case where `--real` is a fixture flag value remains fixture
  syntax.

Run the CLI test suite, build the shipped entry point, probe the three help forms,
run formatting, and prove no output file is created.
