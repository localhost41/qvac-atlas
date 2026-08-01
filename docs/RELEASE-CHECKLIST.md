# Release candidate checklist

This checklist is the final authority for moving Atlas from a fixture-only build to
a public release. A green CI run is necessary but cannot substitute for the human,
hardware, privacy, and repository-trust gates below.

## Reproducible repository gate

- [ ] Node 22 and the `packageManager`-pinned pnpm version are in use.
- [ ] `pnpm install --frozen-lockfile` succeeds from a fresh checkout.
- [ ] `node scripts/validate-contribution.mjs` succeeds.
- [ ] `pnpm check` succeeds.
- [ ] `node scripts/build-catalog.mjs` followed by
      `git diff --exit-code -- apps/site/src/generated/catalog.json` succeeds.
- [ ] The release commit has no unexplained generated or untracked files.

## Probe and executor gate

- [ ] The real executor accepts only the opaque project-local SDK grant and an
      opaque, hash-verified model grant.
- [ ] No SDK path, model path, prompt, generated text, stdout, stderr, exception,
      or arbitrary child value can enter a report.
- [ ] Import, worker start, model load, inference, cleanup, crash, timeout, hostile
      IPC, and descendant-process tests all pass.
- [ ] The CLI still requires interactive collection, draft preview, publication
      choice, final exact-byte preview, and local-write consent.
- [ ] Atlas performs no installation, upload, automatic issue/PR creation,
      telemetry, repair, or configuration mutation.

## Model artifact gate

- [ ] The exact QVAC 0.16 API path from a locally verified artifact to native model
      loading is established from release-tag source and a real run.
- [ ] License, 386,404,992-byte size, immutable source revision, destination/cache
      behavior, and expected SHA-256 are disclosed before any download or reuse.
- [ ] Separate model authorization is explicit and cannot be represented by a
      command flag, environment variable, or prechecked default.
- [ ] Local bytes are size- and SHA-256-verified before native loading; partial,
      corrupt, or replaced cache entries fail closed.
- [ ] The production profile remains absent from `registry/catalog.json` until this
      gate and the real-device gate both pass.

## Real-device gate

- [ ] A Node 22/macOS run uses an already-present exact project-local
      `@qvac/sdk` 0.16.0 and has ample disk headroom for the dependency graph,
      model, temporary files, and failure cleanup.
- [ ] The complete report is reviewed for paths, identifiers, credentials, prompts,
      generated content, and overly precise fingerprint fields before submission.
- [ ] The observed `cpu|gpu` value comes only from public completion statistics;
      no Metal, CUDA, Vulkan, or OpenCL backend name is inferred.
- [ ] Windows process containment is proven with a Job Object or equivalent durable
      mechanism on real Windows hardware; unsupported Windows execution refuses
      before spawn.
- [ ] At least two genuinely independent volunteer sources are reviewed before any
      `reproduced-success` badge is allowed.

## Repository trust gate

- [ ] The public repository has named, valid code owners for
      `registry/catalog.json`, production profiles, report admission code, workflow
      files, and the code-owner file itself.
- [ ] The protected release branch requires pull requests, current code-owner
      approval after the latest push, passing required checks, and no direct pushes.
- [ ] Maintainers, not contributors or report content, assign stable source
      independence keys.
- [ ] A production profile change is reviewed separately from a report submission.
- [ ] Genuine reports are append-only; corrections supersede rather than silently
      rewrite accepted evidence.

## External release gate

- [ ] A human has explicitly approved creation of the public repository/package,
      deployment of the site, and any Discord or GitHub announcement.
- [ ] The site clearly distinguishes observed, reproduced, fallback, mixed,
      failure, unknown, and fixture states, with exact evidence and limitations.
- [ ] Installation, contribution, privacy, incident, and removal guidance is tested
      from a new contributor's perspective.
- [ ] Credential/privacy incidents have a documented stop-publish, rotate, remove,
      and Git-history remediation path.

No unchecked item may be waived by relabeling evidence, weakening validation, or
turning an unknown into a failure/success. A blocked hardware or authority gate
keeps the product fixture-only; it does not authorize a simulated production claim.
