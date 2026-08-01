# Release candidate checklist

This checklist is the final authority for moving Atlas from a fixture-only build to
a public release. A green CI run is necessary but cannot substitute for the human,
hardware, privacy, and repository-trust gates below.

## Reproducible repository gate

- [ ] Node 22 and the `packageManager`-pinned pnpm version are in use.
- [ ] `pnpm install --frozen-lockfile` succeeds from a fresh checkout.
- [ ] `pnpm ready:local` succeeds after the frozen install; its current-tree audit,
      full workspace check, deterministic rebuild, generated diff, and cleanliness
      checks are reviewed.
- [ ] Exact base/target append-only history is separately proven by protected CI;
      the local readiness command is not treated as that proof.
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

- [ ] A Node 22/macOS arm64 run uses an already-present exact project-local
      `@qvac/sdk` 0.16.0 and has ample disk headroom for the dependency graph,
      model, temporary files, and failure cleanup.
- [ ] The complete report is reviewed for paths, identifiers, credentials, prompts,
      generated content, and overly precise fingerprint fields before submission.
- [ ] The observed `cpu|gpu` value comes only from public completion statistics;
      no Metal, CUDA, Vulkan, or OpenCL backend name is inferred.
- [ ] Focused tests prove Linux, Windows, and non-arm64 macOS real execution refuses
      before project resolution, Doctor, cache or network access, temporary-file
      creation, or process spawn. Future Windows durable containment and hardware
      validation are post-V1 work, not a V1 release condition.
- [ ] At least two genuinely independent volunteer sources are reviewed before any
      `reproduced-success` badge is allowed.

## Activation and first production evidence gate

- [ ] The accepted ATLAS-013 record contains a passing, commit-pinned physical
      verdict and the required human lifecycle and privacy approval.
- [ ] Repository trust is established before profile or report admission: named
      owners, protected pull-request review, immutable workflow pins, and exact
      base/target history enforcement are active on the release branch.
- [ ] Immediately before activation work starts, the shipped entry point is
      rechecked to remain behind the literal hardcoded-false gate; no environment,
      configuration, input, or hidden flag can enable it.
- [ ] A production profile is admitted in its own reviewed change only after the
      model-artifact and physical gates pass; it is not added to make a report pass.
- [ ] A separate reviewed, still-disabled production-probe binding commit replaces
      the candidate profile identity and candidate-only publication warning with
      the exact admitted production profile and truthful submission eligibility.
      Tests must prove the disclosure, assembled report, admitted profile, and
      central claim evaluator agree. This status transition is committed before
      the ceremony and is not hidden inside its temporary activation diff.
- [ ] A separately authorized **first-production-report ceremony** runs from the
      exact reviewed production-probe binding commit in a disposable clone whose
      only source change is the independently approved literal `false` to `true`
      release seam.
      This is not ATLAS-013 and does not retroactively change its private-only
      authority. The host operator personally repeats every collection,
      project-code, artifact/workload, publication-intent, and local-write decision;
      publication intent may be Yes only under this separate authority. The CLI
      previews and writes exact canonical bytes locally but still performs no
      upload, issue, pull request, or submission. The enabled clone and build are
      destroyed after local privacy review, with only the reviewed report and
      allowlisted ceremony record retained.
- [ ] At least one manually submitted genuine report—the exact locally reviewed
      ceremony report—is then admitted through the maintainer-owned workflow with
      exact source metadata, fresh human approval, and protected CI. No ceremony
      consent authorizes that later Git publication step.
- [ ] The deterministic rebuild reports a nonempty genuine registry, and the site
      exposes that genuine evidence without allowing fixtures into claims.
- [ ] A distinct activation diff, based on the accepted physical, profile, and
      report commits, is reviewed after the preceding gates. It intentionally
      changes the shipped gate, preserves all consent and no-upload boundaries, and
      passes the complete release checks.

## Repository trust gate

- [ ] The public repository has named, valid code owners for
      `registry/catalog.json`, production profiles, report admission code, workflow
      files, and the code-owner file itself.
- [ ] Every third-party workflow action is pinned to an authoritatively verified
      immutable commit SHA; floating major tags are not accepted as release proof.
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
