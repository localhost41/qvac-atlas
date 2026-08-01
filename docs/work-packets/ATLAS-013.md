# ATLAS-013 — macOS physical-validation run packet

Status: protocol defined; no physical run authorized or performed

This packet turns the dormant real path into a bounded, human-operated validation
event. It does not activate or release that path. The release candidate checklist
remains the final authority: evidence produced here can satisfy relevant checklist
items, but this packet cannot waive, relabel, or weaken an unchecked item.

## Result this packet may establish

One consenting operator on one suitable **macOS arm64** host may establish whether
the exact reviewed Atlas commit can complete the real QVAC 0.16.0 lifecycle against
the exact pinned model while preserving consent, privacy, process, cache, and output
invariants.

The event is deliberately narrower than a release:

- Atlas does not install QVAC, change the volunteer project, submit or upload a
  report, create an issue or pull request, edit a profile or registry, publish a
  repository/package/site, or announce a result.
- The canonical and shipped CLI gate stays the literal `false`. A separately
  approved disposable clone may exercise the same top-level CLI once as described
  below; it is never merged, packaged, copied back, or reused.
- A successful run is private physical evidence for later review. It is not profile
  admission, a production claim, real-mode activation, or release approval.
- Windows containment and physical validation remain ATLAS-014. Repository trust,
  protected ownership, and source-independence assignment remain ATLAS-018.

## People and authority

The event needs three explicit human roles. One person may not silently assume
another role.

1. A **release captain** names the exact commit, approves this packet, and records
   that the run is authorized but publication and activation are not.
2. A **host operator** controls the Mac, the already-prepared QVAC project, network,
   storage, cache, and report destination. They may stop at any time.
3. An **independent reviewer** approves the one-token disposable-clone diff before
   execution and later reviews the report and the sanitized evidence record.

No Codex worker or unattended job may answer prompts, approve the run, select
publication intent, or decide artifact/report retention. Do not run this in CI, a
remote terminal without the host operator present, a terminal recorder, or an
environment that automatically captures stdout/stderr.

## Immutable inputs and environment gate

The release captain writes full 40-character hashes into the private run record.
Branch names and tags are not pins.

- `atlas_base_commit`: the independently reviewed Atlas commit to validate.
- `disposable_commit`: the same value as `atlas_base_commit`; the disposable clone
  starts at that commit and has only the proved uncommitted one-token change below.
- `qvac_project_commit`: the full commit of the volunteer project that directly
  declares `@qvac/sdk` at exact version `0.16.0` and already contains that exact
  physical installation.
- `qvac_baseline`: release tag `sdk-v0.16.0` at exact upstream commit
  `034d3158daf39b247a79e89e2cd90599a070960d`, as established in
  `docs/research/runtime-feasibility.md` and
  `docs/research/qvac-model-artifact-boundary.md`.

Before creating the disposable diff, all of these conditions must be true:

- The canonical Atlas checkout and volunteer project each report the recorded
  commit and an empty
  `git status --porcelain=v1 --untracked-files=all`. A non-Git or dirty volunteer
  project is out of scope for this first run.
- The prepared disposable Atlas clone is a fresh full clone at the recorded Atlas
  commit, has an empty status, and has completed the separate reproducibility setup
  below on Node major 22 with `pnpm@11.10.0`.
- The host is macOS arm64, Node major 22 is active, and the package-manager version
  is exactly `11.10.0`. A different OS, architecture, Node major, or pnpm version
  stops the event.
- The volunteer project's own `package.json` directly declares exact
  `@qvac/sdk@0.16.0`; its physical package directory is inside that project and has
  the expected manifest, fingerprint, and `dist/index.js`. No ancestor, global,
  `PATH`, `NODE_PATH`, Plug'n'Play, external virtual store, package/entrypoint
  escape, or fallback SDK is accepted. A contained in-project pnpm link is allowed
  only when its real package directory remains below the selected project's real
  root. Atlas' resolver remains the final authority after consent.
- The requested report file does not exist. The chosen parent is a private local
  directory on a trusted filesystem; it is not a synced, shared, network, or
  repository directory.
- stdin and stdout are real TTYs. No approval is supplied by a flag, environment
  variable, config file, wrapper, pipe, default answer, or automation.

Record only pass/fail for the clean-tree, platform, tool-version, SDK-presence,
TTY, destination, and capacity checks. Do not preserve raw command output.

### Reproducibility setup is a separate completed phase

Clone and workspace-dependency setup are not part of the zero-effects physical
preflight. Complete them in the disposable Atlas clone before opening the physical
event:

1. On Node 22 with `pnpm@11.10.0`, run the reproducible-repository gate from
   `docs/RELEASE-CHECKLIST.md`, including a frozen-lockfile install and the full
   checks and catalog diff.
2. If the release captain requires offline dependency setup, use
   `pnpm install --offline --frozen-lockfile` with a previously populated store and
   stop if it cannot complete; never silently fall back to network. Otherwise any
   approved networked `pnpm install --frozen-lockfile` belongs only to this earlier,
   separately recorded setup phase.
3. This phase may prepare Atlas workspace dependencies only. It must not install or
   import QVAC, fetch or inspect the model/cache, mutate the volunteer project, or
   create the physical report.
4. Reconfirm the clone's exact commit and clean tree after the reproducibility gate,
   then mark setup complete. From the start of physical preflight until the later
   artifact/workload consent, no network access is allowed.

### Conservative capacity requirement

The existing QVAC dependency estimate is more than 4.8 GiB before safety margin.
For this run, every distinct volume that holds the volunteer project, OS temporary
directory, fixed Atlas cache, or report destination must have at least
**10 GiB (10,737,418,240 bytes) free** immediately before the ceremony. If several
locations share a volume, check it once. The 10 GiB requirement is an intentionally
conservative operational margin for transitive dependencies, temporary files, and
failure cleanup; it does not replace the contained artifact checks.

Inside the consented artifact transaction, a valid cache hit still requires at
least 512 MiB (536,870,912 bytes) free on its volume. A cache miss requires at least
923,275,904 bytes: the 386,404,992-byte artifact plus that 512 MiB reserve. Both the
10 GiB preflight and the applicable contained check must pass. The approximately
1 GiB available on the development host recorded in `docs/STATUS.md` is not enough.

The operator may inspect capacity locally, but when the check is reached the
evidence log records only `capacity_gate: passed|failed`. It must not record mount
names, paths, account names, free-byte measurements, or raw `df` output.

## Mandatory pre-ceremony artifact and workload acknowledgment

Before the one-shot invocation, the host operator and independent reviewer must
acknowledge this packet's complete artifact disclosure. This is a reviewed run-sheet
checkpoint, not text that the CLI is claimed to print:

| Field              | Exact value                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate ID       | `smollm2-360m-instruct-q8_0`                                                                                                                       |
| Filename           | `smollm2-360m-instruct-q8_0.gguf`                                                                                                                  |
| Engine             | `llamacpp-completion`                                                                                                                              |
| License            | Apache-2.0                                                                                                                                         |
| Size               | 386,404,992 bytes                                                                                                                                  |
| SHA-256            | `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`                                                                                 |
| Immutable revision | `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`                                                                                                         |
| Source             | `https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf` |
| Cache root         | the fixed private account cache `~/.qvac-atlas-models`                                                                                             |
| Cache policy       | reuse only after full size and SHA-256 verification; otherwise fail closed                                                                         |
| Effects on miss    | create private directory, create private staging/final files, and fetch only the pinned HTTPS artifact through the bounded redirect policy         |
| Lifetime           | the verified final artifact remains cached until the operator explicitly removes it; Atlas cleans only its owned staging state                     |

The cache directory is mode `0700` and owned files are mode `0600`. An invalid final
entry is never repaired, overwritten, or deleted by Atlas. A cache hit and a cache
miss both require fresh workload/model consent for this event.

They must also acknowledge the exact executor workload that is pinned in the
reviewed code but is intentionally not all repeated by the CLI disclosure:

- call `loadModel` with model type `llamacpp-completion`, context size 512,
  requested device class `gpu`, and 999 GPU layers;
- call `completion` with one user history item whose content is
  `Reply with exactly: atlas`, streaming enabled, and generation parameters
  `predict: 8`, `seed: 1`, and `temp: 0`; and
- call `unloadModel` with `clearStorage: false`, then `close` and complete the
  post-run artifact validation.

The acknowledgment must occur before the physical ceremony and must not copy the
prompt, paths, or URL into the event log.

The candidate profile is still candidate-only and claim-ineligible. Its
`download_policy` is `explicit-consent-contained-dormant`: consent and contained
acquisition are implemented, but remain unreachable behind the shipped false gate.

## Proposed, reviewable one-shot true-seam procedure

The safest validation entry is the actual top-level CLI composition, with exactly
its dormant literal changed in a disposable clone. A parallel harness or direct
call to `runEnabledRealCli`, `ProductionRealCoordinator`, or another lower-level
function would bypass top-level TTY, signal, argument, and dispatch behavior and is
therefore forbidden.

The independent reviewer must approve the following procedure and exact hashes
before it begins:

1. Use the disposable **full clone** prepared in the separate reproducibility phase
   from the approved Atlas repository at detached `atlas_base_commit`. Do not use
   the canonical working tree, a linked worktree, a durable validation branch, or
   a copied build artifact.
2. Reconfirm that the distinct reproducibility setup phase above completed at the
   exact commit and left the disposable clone clean. Do not repeat dependency
   installation during physical preflight. Do not touch the volunteer project or
   QVAC cache.
3. In only `packages/cli/src/bin.ts`, change the final argument passed to
   `dispatchCli` from the literal `false` to the literal `true`. Leave the shipped
   command, dispatcher, coordinator, prompts, dependencies, package metadata,
   exports, and all other bytes unchanged.
4. Prove before building that the sole status entry is that file and that
   `git diff --check` passes. The reviewer inspects `git diff --word-diff=porcelain`
   and accepts only one deleted `false` token and one added `true` token. Do not
   commit, stash, patch-export, symlink, copy, or publish this diff.
5. Build the disposable clone on Node 22 with pinned pnpm. Re-prove the source diff
   is still the sole tracked diff and that no unexpected untracked files exist
   outside ordinary ignored build output.
6. From the clean volunteer project's root as the process current directory,
   invoke the disposable clone's absolute `packages/cli/dist/bin.js` with Node 22
   exactly once as `probe --real --output <new-private-local-path>`. The operator
   enters the output path locally; neither the command line nor shell history is
   captured in the evidence log.
7. Never retry automatically. A second attempt is a new event with a new output
   path, fresh preflight, fresh review, and every consent repeated.

The shell used for the event has history disabled and no xtrace, debug, profiling,
telemetry, transcript, pipe, `tee`, `script`, or stdout/stderr capture. The operator
observes the real TTY live. The evidence recorder emits only predefined, allowlisted
stage outcomes; it does not wrap or intercept the CLI.

## Zero-effects preflight and consent order

After reproducibility setup is complete, the physical preflight before the first
in-program consent is read-only and zero-network. It may establish
commit/cleanliness, platform/tool versions, direct manifest declaration, already
present physical SDK shape, TTYs, destination nonexistence, and capacity. It must
not install a dependency, import or execute volunteer project code, invoke Doctor
or QVAC, inspect or create the Atlas cache, touch the report path, start a model
process, or use the network. If any preflight item fails, stop with zero
physical-run effects.

The one top-level invocation then preserves this exact order:

1. **Fingerprint/local-collection consent.** Show the privacy disclosure and ask
   whether Atlas may collect the coarse local fingerprint. Refusal stops before
   resolution, project-code execution, cache access, network, model, or output.
2. Atlas resolves only the exact current project-local SDK and checks macOS,
   Node 22, package declaration, physical containment, version, manifest
   fingerprint, and entrypoint. Resolution is still read-only.
3. **Project-code consent.** Separately disclose that Doctor and the SDK are
   volunteer-project code and ask permission to import/execute them. Refusal stops
   before import, Doctor, cache access, network, or model activity.
4. Run and normalize Doctor. Raw Doctor output is not persisted. An ordinary
   unsupported/unknown Doctor result may be recorded only through its bounded
   evidence vocabulary; an invariant or cleanup failure stops the event.
5. The CLI's in-program artifact/workload disclosure value is exactly the canonical
   `COMBINED_WORKLOAD_DISCLOSURE`: its pinned artifact fields and policies,
   candidate profile/version, requested `gpu`, five lifecycle labels, and excluded
   effects. The existing interaction renders its standard label and JSON
   serialization of that value only. Engine, context size, GPU-layer count, and
   fixed prompt were mandatory pre-ceremony acknowledgments above; they are not
   falsely attributed to this CLI output. Do not interleave, prepend, append, or
   manually print supplementary disclosure during the invocation.
6. **Artifact/workload consent.** Ask separately whether Atlas may verify/reuse or
   download the pinned artifact and execute that workload. Refusal stops before
   cache access, network, worker/model start, or report output.
7. Perform the contained artifact transaction, fully reap its child, consume the
   one-use grants, and execute the lifecycle below.
8. Show the draft report preview.
9. **Publication-intent choice.** Select **No** for ATLAS-013. This packet grants no
   upload or submission authority. Show the warning and the final exact-byte
   preview with publication intent false.
10. **Local-write consent.** Separately decide whether to create the private local
    report. For review evidence, choose Yes only after reading the final preview.
    Refusal creates no report and cannot be called a completed privacy-validation
    pass. Atlas never uploads either result.

An answer to one checkpoint never authorizes a later checkpoint. Cancellation,
EOF, malformed input, signal, or uncertainty is a refusal and stops safely.

## Required real lifecycle and evidence semantics

Only the production coordinator reached through the top-level dispatcher is valid.
After full local artifact verification it must, under the existing bounded
supervisor:

1. import the exact resolved project-local SDK through the private bootstrap;
2. require `heartbeat`, `loadModel`, `getLoadedModelInfo`, `completion`,
   `unloadModel`, and `close` operations;
3. complete the SDK heartbeat;
4. capture the descriptor-safe full pre-run artifact hash and identity;
5. call `loadModel` for the verified local artifact as `llamacpp-completion`,
   context 512, with requested `gpu` and 999 GPU layers;
6. require loaded-model information to match the exact nondelegated model ID, type,
   and verified path without exposing that path;
7. run the fixed completion and obtain device evidence only from public completion
   statistics;
8. call `unloadModel` with `clearStorage: false`, call `close`, fully reap the
   process group, and repeat full artifact hash and identity verification.

All overall and phase deadlines, message caps, grant consumption rules, terminal
state rules, abort behavior, and POSIX process-group cleanup remain unchanged.
Do not relax a timeout or retry a phase for the physical run.

Device evidence has only these meanings:

- Direct completion statistics reporting `gpu` is an observed GPU-class result.
- Direct completion statistics reporting `cpu` is valid **CPU-fallback evidence**.
  It may demonstrate that the lifecycle plumbing worked, but it does not satisfy a
  requested-GPU success, profile-admission gate, or activation gate.
- Missing, malformed, conflicting, or nonpublic device evidence is `unknown`, not
  CPU and not GPU.
- Metal, CUDA, Vulkan, OpenCL, accelerator model, and GPU layer count are never
  inferred. QVAC 0.16.0 exposes only the coarse `cpu|gpu` class used here.

The generated report remains `provenance: probe`, candidate/nonstandard, and
claim-ineligible. A physical run cannot turn candidate metadata into a production
profile.

The internal pre/post artifact identity result is a bounded derivation, not a
manual assertion. Record `derived-passed` only when report evidence contains a
passed `clean-shutdown` phase **and** clean termination (`clean-exit`, exit code 0,
no signal, and `last_completed_phase: clean-shutdown`). In every other case record
`uncertain`; a generic shutdown failure does not disclose whether hash/identity,
`unloadModel`, or `close` failed. A later manual hash or metadata check is only an
inspection of current state and cannot backfill this internal result.

## Evidence log and privacy boundary

Keep the sanitized run record private and outside both repositories. It may contain
only:

- the Atlas, volunteer-project, and normative QVAC baseline full commit hashes and
  the one-token-diff review outcome `passed|failed|not-reached`;
- exact Node and pnpm versions plus coarse `macOS` and `arm64` labels;
- `passed|failed` for a reached preflight, `passed|failed|not-reached` for capacity
  and one-token-diff review; `approved|refused|not-reached` for fingerprint,
  project-code, artifact/workload, and local-write checkpoints; and
  `declined|refused|not-reached` for publication intent, without prompt or response
  text;
- cache outcome `verified-hit` or `verified-miss` without paths or URLs;
- allowlisted phase status/reason/duration, final process-cleanup status, the
  strictly derived internal artifact-equality outcome, and a separately sourced
  manual current-state artifact inspection;
- observed device class `cpu`, `gpu`, or `unknown` exactly as admitted by the
  report; report ID; privacy-review outcome; artifact/report retention choices;
  disposable-clone destruction outcome; and final verdict.

The record, terminal tooling, screenshots, and review notes must never capture raw
project/cache/model/output paths; account or mount names; source or redirect URLs;
headers, cookies, credentials, tokens, environment dumps, or signed queries; raw
Doctor/QVAC/child stdout, stderr, IPC, or exceptions; prompt text or answers; the
fixed inference prompt; generated completion; or exact SDK/model paths. The pinned
public URL and digest may exist in this reviewed packet and live consent disclosure,
but are not copied to the event log.

After a locally written report exists, the independent reviewer compares its exact
bytes with the final preview and checks schema, canonical identity, mode `0600`,
single-link publication, and every field for paths, identifiers, credentials,
prompts, generated content, child values, or overly precise fingerprint data. The
review occurs locally without uploading or adding the report to Git. A privacy
failure is a stop condition and the file is handled as sensitive evidence.

## Cleanup, retention, and rollback

The run is not complete when inference returns. In this order:

1. Confirm the CLI has settled, its acquisition and executor children/process
   group are fully reaped, and no Atlas/QVAC descendant remains. Record only the
   boolean result, never a process listing or command line.
2. Inspect the final artifact's **current state** for expected size, full SHA-256,
   ownership, mode, and link count, and confirm no Atlas-owned staging entry
   remains. This manual post-run inspection does not prove what the isolated child
   observed before or after native use and must never be relabeled as internal
   pre/post identity equality. Do not delete, repair, overwrite, or adopt an
   invalid final or uncertain partial.
3. The host operator explicitly chooses `retain` or `remove` for the verified final
   artifact. Retention is the documented cache policy. Removal, if chosen, is a
   separate manual action targeting only the exact disclosed final file after all
   processes are reaped; never use a wildcard or recursive broad deletion.
4. The operator separately chooses `retain-private` or `remove-after-review` for the
   local report. It is never copied into Atlas, the volunteer project, a cloud-sync
   folder, an issue, or a pull request under this authorization.
5. Keep the entire disposable clone isolated only until the immediate diff, build,
   run, and cleanup review finishes. Preserve sanitized commit hashes, the
   one-token diff identity, and allowlisted evidence instead of the enabled tree.
   Then destroy the exact disposable clone and its enabled build before assigning a
   normal verdict, and record `disposable_destroyed: passed|failed`. Never commit,
   merge, reuse, package, link, or copy its modified source or build output. Failure
   to prove destruction is `STOP / MANUAL REVIEW`.
6. Recheck the canonical Atlas checkout at `atlas_base_commit`: clean tree, shipped
   `packages/cli/src/bin.ts` still passes literal `false`, no disposable branch,
   link, copied build, report, or model. Recheck the volunteer project commit and
   clean tree. Record only pass/fail and hashes.

ATLAS-013 itself never authorizes retention of the enabled clone, even offline. If
forensic preservation is necessary, stop ATLAS-013 and transfer custody only under
separately granted incident-response authority. That event remains
`STOP / MANUAL REVIEW`; it cannot receive a normal ATLAS-013 verdict while the
enabled clone or build survives.

If a crash leaves a named partial, cleanup is uncertain, an invalid final appears,
or a process may remain, stop. Keep the host private and quiescent, preserve the
exact affected cache/output objects for maintainer review, and do not rerun or
improvise cleanup. This does not authorize retaining the enabled clone; its
destruction rule and separate incident-response exception above still apply.

## Verdict rules

`PASS — observed GPU lifecycle` requires every item below:

- exact pins, clean trees, environment, already-present SDK, TTY, destination, and
  both capacity gates passed;
- the sole reviewed disposable diff and actual top-level production composition
  were used once, with all separate consents in the required order;
- exact artifact verification, every lifecycle phase, bounded settlement, full
  process cleanup, and cache-state review passed; specifically, internally derived
  pre/post artifact equality was `derived-passed` and the separate manual
  current-state inspection was `verified`;
- direct public completion statistics reported `gpu`;
- a canonical private report exactly matched its preview and passed independent
  privacy review; and
- artifact/report retention decisions were recorded, disposable clone and enabled
  build destruction was `passed`, and canonical rollback was proved.

`VALID FALLBACK — observed CPU lifecycle` has the same requirements but direct
statistics reported `cpu`. It is useful evidence, not an ATLAS-013 GPU-gate pass,
not a profile-admission result, and not activation authority.

`INCONCLUSIVE` covers `unknown` device evidence, a consented early refusal, or a
bounded unsupported result with clean settlement. `FAIL` covers a bounded defined
lifecycle or local report-write transaction failure after effects began when clean
settlement was still proved and no privacy, security, process, or artifact-identity
uncertainty exists. `STOP / MANUAL REVIEW` covers dirty or unpinned input,
insufficient capacity, unreviewed diff, unexpected effect, invariant violation,
timeout/crash, possible survivor, uncertain cache/output state, failed privacy
review or any privacy exposure, failed or unproved disposable-clone destruction,
or any pressure to bypass consent. None of the latter three verdicts pass the
physical gate.

There is no automatic retry and no conversion of unknown or fallback evidence into
success.

## Release-checklist handoff

The independent reviewer maps the private verdict to
`docs/RELEASE-CHECKLIST.md`. Even a GPU lifecycle pass addresses only the applicable
macOS real-device, model-artifact, and probe/executor observations. It leaves at
least these separate gates open:

- another genuinely independent volunteer source before `reproduced-success`;
- ATLAS-014 durable Windows containment and a real Windows hardware run;
- ATLAS-018 repository ownership, protected review, and maintainer-assigned source
  independence;
- a separate reviewed production-profile proposal and admission decision;
- a separate activation change proving the shipped gate is deliberately changed;
  and
- explicit human authority for any external repository, package, deployment,
  upload, report submission, issue/PR, or announcement.

Until those gates and the final checklist pass, Atlas stays fixture-only and its
shipped real-mode gate stays false.

## Private run-record template

The release captain may use this allowlisted shape outside Git. Omit, rather than
expand, any field whose safe value is unavailable.

```yaml
atlas_base_commit: <40-hex>
disposable_commit: <same-40-hex>
qvac_project_commit: <40-hex>
qvac_baseline_commit: 034d3158daf39b247a79e89e2cd90599a070960d
node_version: <22.x.y>
pnpm_version: 11.10.0
platform: macOS
architecture: arm64
preflight: <passed|failed>
capacity_gate: <passed|failed|not-reached>
one_token_diff_review: <passed|failed|not-reached>
consents:
  fingerprint: <approved|refused|not-reached>
  project_code: <approved|refused|not-reached>
  artifact_workload: <approved|refused|not-reached>
  publication_intent: <declined|refused|not-reached>
  local_write: <approved|refused|not-reached>
artifact: <verified-hit|verified-miss>
lifecycle: <passed|failed|inconclusive>
device_class: <gpu|cpu|unknown>
internal_artifact_identity: <derived-passed|uncertain>
manual_artifact_current_state: <verified|failed|not-performed>
process_cleanup: <passed|failed|uncertain>
report_id: <schema-bounded-id-or-omitted>
privacy_review: <passed|failed|not-completed>
artifact_retention: <retain|remove|manual-review>
report_retention: <retain-private|remove-after-review|manual-review>
disposable_destroyed: <passed|failed>
canonical_rollback: <passed|failed>
verdict: <gpu-pass|cpu-fallback|inconclusive|fail|stop>
```
