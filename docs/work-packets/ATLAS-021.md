# ATLAS-021 — Dormant real-mode activation path

## Outcome

Implement the complete, accessible real-probe path behind a release gate without
enabling it in the shipped CLI yet. A future one-line gate change, allowed only
after ATLAS-013, will expose:

```text
qvac-atlas probe --real --output <report.json>
```

from the exact current project directory. The path must use an already-present,
audited project-local `@qvac/sdk@0.16.0`, obtain fresh interactive consent, contain
artifact acquisition in its own fully reaped process, pass the resulting opaque
authority directly into the existing parent-supervised executor, and produce only
a local schema-valid candidate report. It must never install QVAC, automatically
upload or publish, enable the candidate profile, or create compatibility claims.

## Decomposition and integration order

ATLAS-021 is serialized into four reviewable commits:

1. **ATLAS-021A — source and crash-safe contained acquisition**
   Hardens redirects, gives one acquisition attempt an exact recoverable staging
   identity, and adds a separate contained acquisition child. No probe or CLI
   imports it.
2. **ATLAS-021B — genuine candidate report and dependency-inverted pipeline**
   Adds the real state machine, report assembly, consent ordering, and injected
   runtime boundary. It uses only synthetic runtime implementations in tests.
3. **ATLAS-021C — concrete CLI composition behind a disabled release gate**
   Resolves the exact cwd SDK, runs normalized Doctor, owns acquisition and
   execution capabilities without exposing them to interaction callbacks, and
   retains fixture mode unchanged.
4. **ATLAS-021D — independent adversarial acceptance**
   Reviews consent, containment, recovery, privacy, non-claim behavior, and the
   complete unchanged regression corpus before root integration.

Root is the only lockfile owner and release captain. No implementation worker may
merge, enable real mode, download the real artifact, install QVAC, edit a production
profile, or publish anything.

## User ceremony

Fixture mode and its disclosure remain behaviorally unchanged. Real mode has its
own truthful sequence:

1. Require stdin and stdout TTYs and an explicit non-existing output path. Reject
   piped input, EOF, prompt failure, duplicate or unknown flags, `--yes`, `-y`, and
   every environment/config approval mechanism.
2. Display a real-probe privacy disclosure: allowlisted collection, local project
   code execution, candidate/non-claim status, no install, no upload, and the fact
   that separately approved model-cache effects occur before report preview.
3. Obtain fingerprint/local-collection acknowledgement. Refusal causes no platform
   collection, project resolution, Doctor, artifact-root read/create, fetch, or
   QVAC process.
4. Resolve only the exact current directory through ATLAS-015. Missing, unsafe,
   unsupported, linked-outside, wrong-Node, or Windows execution stops before any
   artifact disclosure or effect. Do not search parents, PATH, global packages,
   PnP, `npx`, or a package manager.
5. Explain that the selected project-local Doctor/SDK is executable project code,
   isolated and bounded but not a sandbox. Obtain a fresh project-code decision
   before Doctor or SDK import.
6. Run the existing normalized project-local Doctor adapter. Raw output and errors
   remain private; unavailable Doctor evidence does not block a valid SDK run.
7. Display one authoritative combined artifact-and-workload disclosure, then ask
   for one fresh decision authorizing exactly one cache verify/download plus one
   requested-GPU lifecycle. The disclosure includes:
   - candidate ID, filename, immutable revision, exact initial HTTPS URL;
   - Apache-2.0 license, 386,404,992 bytes (about 368.5 MiB), exact SHA-256;
   - fixed destination under `~/.qvac-atlas-models` and requested `0700/0600` modes;
   - full size/hash/identity verification on every reuse;
   - network only on a missing cache, through the bounded official redirect policy;
   - invalid final entries are never repaired, deleted, or overwritten;
   - the verified final remains cached until the user removes it;
   - handled failure/cancellation removes only staging owned by that attempt;
   - a parent crash or unrecoverable hard kill can leave a named partial requiring
     manual review, but later runs never treat it as a model;
   - the exact local path is passed to project QVAC for one fixed workload;
   - no installation, telemetry, upload, submission, repair, retry, or claim.
8. The contained acquisition consumes approval before any model-root inspection,
   exits and is fully reaped, and only then may the parent create and immediately
   consume the verified-artifact execution grant. Acquisition and QVAC execution
   must never be nested under another killable detached coordinator.
9. Assemble a genuine candidate report, preview the exact draft, choose publication
   intent with an explicit warning that the candidate is not currently admissible,
   revalidate and preview the exact final bytes, then separately approve an
   exclusive owner-only local write. Nothing leaves the machine.

The default cache root is deliberately fixed. ATLAS-021 adds no custom source,
hash, backend, cache-root, model, timeout, proxy, or evidence-injection flag.

## Authority topology

The concrete activation coordinator is package-private to the CLI composition
layer. Interaction and probe callbacks may receive only disclosure views, fixed
decisions/results, and sanitized runner evidence—never `ResolvedSdkHandle`,
`VerifiedArtifactCapability`, `QvacModelExecutionGrant`, paths, digests derived at
runtime, child handles, or source responses.

The one narrow model-artifact contained transaction owns:

```text
create exact frozen disclosure
  -> await one fresh callback decision
  -> internally issue and immediately consume consent
  -> spawn exact acquisition child
  -> exact private IPC
  -> verify/acquire pinned candidate
  -> reap child
  -> parent issues expected pinned capability
```

Do not export `./internal`, a raw consent/approval issuer, material inspector,
arbitrary byte source, URL/candidate override, synthetic runner, or filesystem
cleanup primitive. The existing public in-process acquisition remains dormant and
must not be wired to probe or CLI.

The approval transaction is bound to the exact candidate/disclosure, fixed cache
root, canonical project root, exact SDK handle/version, requested `gpu`, and a
fresh session nonce at the CLI coordinator. It is single-use and consumed before
the first model filesystem or network effect. A JavaScript library cannot prove a
human is present; the TTY-only CLI is the ceremony boundary.

## Acquisition containment and protocol

- Fork only a fixed package-owned runner, with no caller runner path.
- POSIX: a detached process-group leader with TERM, bounded grace, KILL, group
  sweep, and root reap for every success, failure, timeout, abort, fast exit, and
  protocol violation. Windows refuses before spawn.
- Use a clean temporary cwd, `execArgv: []`, JSON IPC, ignored stdin, drained bounded
  stdout/stderr, and an explicit environment allowlist. Strip loader hooks, proxy
  variables, TLS overrides, package-manager variables, Hugging Face credentials,
  QVAC variables, and model-service credentials.
- Parent-to-child sends only one exact bounded message containing the fixed cache
  root, session nonce, timeout, and network policy. These values never enter argv,
  environment, child-to-parent evidence, error strings, or reports.
- Child-to-parent accepts only exact bounded acquisition state tokens and one
  terminal fixed result. Reject malformed, duplicate, reordered, excessive,
  oversized, late, and post-terminal messages without echoing them.
- Internal source deadlines remain defense in depth; the parent deadline is the
  hard bound for stalled filesystem calls. Abort requests graceful child cleanup
  first, then TERM/KILL/reap.
- After consent and cache inspection, prove storage capacity inside the contained
  child before a network request. A miss requires at least 923,275,904 available
  bytes: the exact 386,404,992-byte artifact plus a 512 MiB reserve. A valid cache
  hit requires the 512 MiB reserve before execution. An unavailable/unsafe capacity
  result fails closed; the check never authorizes SDK installation or QVAC caches.
- The acquisition process must be completely gone before the current
  `ProjectLocalQvacExecutor` is constructed. The root parent remains the direct
  owner of QVAC supervision, avoiding nested detached process groups.

## Crash-recoverable staging

For contained attempts, derive the staging basename from the pinned filename and
an exact 192-bit lowercase-hex session nonce generated by the parent. The
supervisor therefore knows the one owned name without child-to-parent path data.

Normal acquisition retains ATLAS-019's exclusive `0600` open, full stream/hash,
descriptor rehash, no-clobber hard-link publication, directory sync, and
identity-guarded unlink. On hard termination the parent launches at most one fixed,
separately bounded recovery child for that exact nonce:

- it opens only the expected existing `0700` root without creating it;
- it inspects only the exact nonce-owned staging name;
- symlink, directory, wrong owner/mode, unexpected link count, or identity drift is
  never deleted and produces a fixed cleanup failure;
- a safe one-link partial is unlinked by checked identity;
- a safe two-link staging entry is removable only when the final destination is
  the same inode; removing the staging name repairs the fully verified publication
  to link count one, after which the next run still performs a full cache hash;
- it never scans, recursively deletes, repairs, or overwrites other names;
- cleanup failure remains path-free and may leave the exact staging entry for
  manual review. It never converts an uncertain file into a capability.

Tests must kill at staging open, mid-stream, after hard link, after staging unlink,
directory sync, ready handoff, and fast root exit. They must prove cleanup changes
only the exact owned staging entry and never a canary/foreign entry.

## Pinned source and redirects

The first request is exactly the checked-in immutable source URL, GET only, with no
body, cookies, authorization, caller headers, proxy configuration, retry, or
credential lookup. Replace `redirect: "follow"` with manual handling:

- at most three redirects and no repeated URL;
- HTTPS only, default port only, no username/password, and no fragments;
- first origin exactly `https://huggingface.co`;
- redirect host must exactly match one of the official download hosts documented
  at <https://huggingface.co/docs/hub/models-downloading>:
  `cas-server.xethub.hf.co`, `cas-server.xethub-eu.hf.co`,
  `transfer.xethub.hf.co`, `transfer.xethub-eu.hf.co`,
  `us.aws.cdn.hf.co`, `us.gcp.cdn.hf.co`, `cdn-lfs-us-1.hf.co`, or
  `cdn-lfs-eu-1.hf.co`;
- never forward headers other than a fixed Atlas user agent and generic accept;
- reject unexpected status, missing/invalid `Location`, downgrade, loop, excess,
  unexpected origin, localhost/private IP literal, or a final non-2xx response;
- retain content-length bound, exact streamed byte count, and final SHA-256 as the
  authority. Signed redirect query strings never enter logs, errors, IPC, or docs.

Hugging Face documents that large immutable Hub files resolve to separate
content-addressed CDN/storage URLs. Atlas deliberately pins the currently
documented finite host set rather than an `hf.co` suffix; a delivery change fails
closed and requires a reviewed Atlas update.

## Genuine candidate report

Add `assembleProbeReport` beside the fixture assembler. Its only production caller
uses concrete collected/resolved/normalized evidence and the strict runner adapter;
test seams remain relative or unexported. The report contains:

- `provenance: { kind: "probe", fixture_id: null }`;
- exact resolver-derived `@qvac/sdk@0.16.0` evidence;
- candidate profile `atlas-smollm2-360m-lifecycle`, version
  `1.0.0-candidate.1`, reviewed artifact hash, requested backend `gpu`;
- existing allowlisted platform, normalized Doctor, lifecycle, backend,
  termination, result, consent, and zero-excerpt privacy fields.

The public artifact hash comes from reviewed candidate metadata, never IPC or
capability inspection. Keep `claim_eligible: false`, `productionProfiles: []`, and
all catalog/admission behavior unchanged. Acceptance must call the central claim
evaluator and prove every ATLAS-021 report is nonstandard and neither success- nor
failure-eligible even when the synthetic lifecycle passes.

Acquisition/preflight failure produces no report in ATLAS-021; it is not mislabeled
as QVAC compatibility failure. Abort produces no report and exits only after owned
children settle.

## Cancellation and output

- The CLI owns one `AbortController`. First SIGINT aborts Doctor, acquisition, or
  executor, waits their cleanup, writes nothing, and returns 130. Do not call
  `process.exit` while a child may exist. A second external hard kill is outside
  the cleanup guarantee and is disclosed as such.
- Add optional `AbortSignal` plumbing without weakening existing deadlines.
- Preflight that the explicit output does not exist before expensive effects, but
  retain the final exclusive `wx` write to close the race.
- Raw failures map to fixed local messages. No output path, project path, cache
  path, source/redirect URL, digest, prompt, completion, stdout/stderr, or exception
  crosses into report/evidence or generic error output.

## Release gate

All code is implemented and synthetic-tested, but the shipped `main()` passes
`realModeEnabled: false`. `runCli` may accept an injected true gate only in
relative tests. While disabled, `probe --real` refuses before project, artifact,
network, or QVAC effects with a fixed explanation that physical ATLAS-013 is
required. Do not add an environment variable, config file, hidden flag, or exported
gate setter.

ATLAS-013 on a suitable volunteer Node 22/macOS machine owns the real model fetch,
hash-verified QVAC lifecycle, privacy review, and the separate decision to enable
the CLI. This host must not install QVAC or download the model during ATLAS-021.

## Automated acceptance

- Exact CLI forms, TTY requirement, disabled release gate, duplicate/unknown flag
  refusal, and no unattended bypass.
- Zero model/SDK/Doctor effects after every refusal and malformed form.
- SDK failure occurs before artifact disclosure, cache root, worker, or fetch.
- Exact real disclosure/prompt order and values; fixture flow unchanged.
- Approval authenticity/binding/forgery/reuse and consumption before all effects.
- Cache hit: full contained verification and zero fetch. Cache miss: exactly one
  initial request after consent. No automatic retry or invalid-cache repair.
- Manual redirect matrix: allowed origins, downgrade, credentials, fragment,
  loop, overflow, missing location, private/IP/unexpected host, response error,
  length, truncation, overflow, and hash mismatch.
- Acquisition protocol grammar/caps, timeout, abort, stubborn/fast child, process
  group/descendant reap, exact-current-run recovery, and foreign-file preservation.
- Executor abort at bootstrap/load/unload/close with no surviving descendants.
- Paths, URLs, redirect queries, digest canaries, prompt/completion, stdio, and raw
  errors absent from returned events, reports, and fixed CLI errors.
- Schema/privacy-valid probe provenance and candidate profile; central evaluator
  proves non-claim status; exact preview bytes equal exclusive local write bytes.
- No model-artifact/executor dependency from schema, catalog, site, or admission.
- No downloader, uploader, GitHub client, package install, telemetry, repair, or
  production profile mutation.
- Model-artifact, resolver, executor, probe, CLI, full unchanged hostile-protocol
  corpus, workspace check, frozen offline install, contribution audit,
  deterministic catalog, clean-clone/dist-absent typecheck, and `git diff --check`
  all pass without real network or model bytes.

## Stop conditions

Stop without activation if any of these cannot be proven: bounded acquisition and
exact recovery; finite redirect authority; direct parent ownership of both worker
waves with no nested orphan topology; no raw approval/capability exposure to UI;
abort settlement; candidate reports remaining non-claim-producing; or zero effects
while the release gate is disabled. Stop before any real model fetch, QVAC install,
profile approval, repository publication, deployment, or external message.
