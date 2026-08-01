# ATLAS-020 — Verified local artifact executor bridge

## Outcome

Bind one consumed ATLAS-019 `VerifiedArtifactCapability` to the existing opaque,
single-use QVAC execution grant, carry its exact local material to the already
supervised child over private IPC, and prove the child loads and later revalidates
that same artifact. Keep the bridge dormant: no acquisition-consent issuer, probe,
CLI, catalog, report-schema, profile-approval, or claim-producing path.

## Allowed scope

- a narrow `packages/model-artifact` executor bridge, plus only the filesystem/hash
  refactor and tests needed to revalidate execution material
- `packages/qvac-executor/**`
- the minimum `packages/qvac-resolver` launch hook and tests needed to send a second
  bootstrap inside its existing kill/reap failure envelope
- architecture documentation for these boundaries and the canonical workspace lock

Do not export the existing model-artifact `./internal` surface. Do not edit probe,
CLI, schema, reports, catalog, candidates, profile allowlists, or CI. Do not install
QVAC, fetch the real model, contact a model source, or create a real QVAC cache.

## Capability and bootstrap contract

- Add one narrow executor-bridge export that consumes a verified-artifact
  capability exactly once and returns only frozen execution material to the trusted
  executor package. It must require the exact pinned candidate. Forged, reused, or
  non-pinned capabilities fail with a fixed path-free error and cannot be retried.
- The executor immediately wraps that material in its existing opaque,
  non-serializable, single-use grant. The default package surface must not expose a
  path/digest inspector or a synthetic issuer.
- Extend the resolver with at most one `afterSdkBootstrapSent(child)` hook. It runs
  inside the existing bootstrap failure envelope: callback/send failure must TERM,
  KILL, and reap the process group before returning a fixed launch failure.
- Send one exact, bounded `qvac-atlas-model-artifact-v1` JSON message parent to
  child after the SDK bootstrap. It contains only the canonical path, byte length,
  SHA-256, and `llamacpp-completion` engine. It must never enter argv, environment,
  stdout, stderr, child-to-parent protocol, errors, returned events, or reports.
- The child installs both bootstrap receivers synchronously before its first await.
  The artifact receiver may ignore the exact SDK bootstrap message once and fails
  closed if its one artifact message is missing or malformed. The production parent
  sends exactly once. Do not add another generalized IPC protocol, and do not add
  or change lifecycle phases or event vocabulary.

## Audited child lifecycle

- Replace the synthetic registry descriptor path in the production child with the
  artifact message. Require `heartbeat`, `loadModel`, `getLoadedModelInfo`,
  `completion`, `unloadModel`, and `close`; do not require or use
  `SMOLLM2_360M_INST_Q8`.
- Inside supervised `model-load`, descriptor-safely require a canonical physical
  path beneath an owner-controlled `0700` directory, a `0600` owner-controlled
  regular file with link count one, exact byte length, stable path/descriptor
  identity, and full SHA-256. Preserve D-014's same-UID quiescence assumption.
- Call only
  `loadModel({ modelSrc: canonicalPath, modelType: "llamacpp-completion",
  modelConfig: { ctx_size: 512, device: "gpu", gpu_layers: 999 } })`.
  Do not pass a descriptor, file URL, registry/HTTP source, progress callback, or
  QVAC cache/config option.
- Before model-load succeeds, require `getLoadedModelInfo({ modelId })` to return
  the same nonempty model ID, `isDelegated: false`, model type
  `llamacpp-completion`, and `path` exactly equal to the supplied canonical path.
  Never canonicalize, serialize, echo, or accept an alternative returned path.
- If `loadModel` returned an ID, always attempt unload with `clearStorage: false`;
  always call `close`. After close, re-run the complete descriptor-safe artifact
  validation whenever the path was exposed to `loadModel`. A postvalidation,
  unload, or close failure makes clean shutdown fail.
- Keep full pre/post validation inside the child so existing phase and overall
  deadlines bound a stalled filesystem. Increase the clean-shutdown default only
  if a reasoned bound is needed for the second full hash; do not weaken the overall
  deadline or containment behavior.

## Fixed evidence mapping

- Invalid/reused execution grant: existing `MODEL_EXECUTION_GRANT_INVALID`, before
  temporary-directory creation or spawn.
- Second-bootstrap failure: existing `QVAC_CHILD_LAUNCH_FAILED`, after verified
  process-group cleanup.
- Missing/malformed artifact bootstrap or missing SDK function: fixed
  `QVAC_IMPORT_FAILED` evidence.
- Prevalidation, local-path load, or loaded-info mismatch: fixed
  `MODEL_LOAD_FAILED` evidence.
- Postvalidation, unload, or close failure: fixed `CLEAN_SHUTDOWN_FAILED` evidence.
- Existing per-phase/overall timeout mapping remains authoritative. No raw cause,
  local path, URL, digest, content, or new schema vocabulary may cross the boundary.

## Acceptance

- Use only tiny private synthetic artifacts and the exact synthetic SDK shape. An
  internal test seam may issue arbitrary artifact material solely so the actual
  production child runner can be exercised without the 386 MB model; it must not
  be package-exported.
- Prove exact local-string/model-type arguments, loaded-path confirmation,
  inference, unload/close, pre/post hash, adapter acceptance, and schema-valid
  assembled evidence.
- Cover forged/reused/non-pinned capability and grant, nonserializability, default
  export privacy, prehash truncation/hash mutation, symlink/hard-link/non-regular or
  unsafe-mode inputs, ancestor substitution, delegated/missing/different/canary
  loaded paths, wrong ID/type, same-size mutation or replacement during load,
  mutation during unload, and fixed path-free results.
- Cover missing/malformed second bootstrap, second-send failure, fast child exit,
  pre/post-hash timeouts, crash, and descendant reaping. Re-run the full ATLAS-022
  protocol matrix unchanged.
- Model-artifact, resolver, executor, complete workspace, frozen install,
  contribution audit, deterministic catalog rebuild, lint/typecheck, and
  `git diff --check` pass with network disabled and no real model.

## Stop conditions

Stop before integration if the existing synthetic `./internal` surface must become
package-exported; artifact material must enter argv/environment/child-to-parent
evidence; second-send failure cannot be killed and reaped; validation cannot remain
inside the supervised child; the pinned SDK 0.16 local-path or loaded-info shape
differs from the tag-audited contract; or any returned value needs a raw path or new
report vocabulary. Stop before probe/CLI activation in all cases; ATLAS-021 owns
process-contained user consent/acquisition, and real claims remain blocked on
ATLAS-013.
