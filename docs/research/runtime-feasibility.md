# ATLAS-002 runtime feasibility

Date: 2026-07-31
Research baseline: published `@qvac/sdk@0.16.0`, release tag `sdk-v0.16.0`
(`034d3158daf39b247a79e89e2cd90599a070960d`), plus current public QVAC main
at `b4d3b25534a72954638141d01e03b8284bc8c8e1` where explicitly identified.

## Verdict: NARROW

Atlas can proceed with a public-API lifecycle probe, but V1 must narrow its
backend claim. Published SDK 0.16.0 directly reports only the actual execution
**device class**, `cpu` or `gpu`, for LLM completion. It does not expose the
actual LLM backend name such as Metal, Vulkan, OpenCL, or CUDA. Therefore:

- `observedDeviceClass: cpu | gpu | unknown` may be claim-producing.
- `observedBackendName` must remain `unknown` for the 0.16.0 LLM profile.
- A requested backend or the host's installed graphics API must never fill that
  field.
- A requested GPU run that returns `backendDevice: "cpu"` is direct fallback
  evidence.
- A requested GPU run that returns `backendDevice: "gpu"` is GPU-execution
  evidence, but not direct proof of Metal/Vulkan/OpenCL specifically.

The SDK import, local worker heartbeat, model load, completion, stats, unload,
and shutdown boundaries are public and sufficient for the lifecycle profile.
The remaining release gate is a real end-to-end run on a host with enough free
storage. It was not safe to install on this machine during this packet.

## Observed facts

### Published package and release boundary

- npm returned `@qvac/sdk` version `0.16.0`, Apache-2.0, with package tag
  `sdk-v0.16.0` resolving to commit `034d3158...`.
- `@qvac/sdk@0.16.0` has no declared Node `engines` field. The matching QVAC
  CLI Doctor accepts Node 18 and recommends Node 20, while the SDK E2E guide
  requires Node 22+ for desktop tests. This is not a clean published SDK
  support matrix.
- V1 should initially test and claim Node 22 only. Node 20 can be added after an
  actual matrix run rather than inferred from Doctor's CLI-host rule.
- The release tag is the normative source for 0.16.0. Current main contains
  unreleased functionality and cannot be used to describe the published
  package.

Sources:

- [SDK 0.16.0 package](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/package.json)
- [CLI runtime checks](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/cli/src/doctor/checks/runtime.ts)
- [SDK E2E prerequisites](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/e2e/README.md)

### Pinned model candidate

Selected candidate: QVAC's public `SMOLLM2_360M_INST_Q8` descriptor.

| Field | Pinned value |
|---|---|
| Repository | `HuggingFaceTB/SmolLM2-360M-Instruct-GGUF` |
| Revision | `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f` |
| File | `smollm2-360m-instruct-q8_0.gguf` |
| Size | 386,404,992 bytes (368.5 MiB) |
| SHA-256 | `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201` |
| License | Apache-2.0 |
| Engine | `llamacpp-completion` |

Three independent public metadata surfaces agree:

1. QVAC's 0.16.0 contract pins the revision, size, and SHA-256.
2. Hugging Face's revision API returns the same revision and Apache-2.0 model
   card license.
3. An HTTP HEAD to the immutable artifact returned
   `x-linked-size: 386404992` and an `x-linked-etag` equal to QVAC's SHA-256.

The artifact was not downloaded locally, so the hash was not recomputed from
local bytes. The immutable URL and two-source metadata agreement are adequate
to select the candidate, but the production downloader must calculate SHA-256
before executing a downloaded artifact.

The QVAC registry also contains `QWEN3_600M_INST_Q4` at 382,156,480 bytes with
an Apache-2.0 card and pinned SHA-256. It is only 4.2 MB smaller, has 600M rather
than 360M parameters, and is a reasoning model whose framing/budget behavior
adds workload variability irrelevant to a lifecycle smoke. Its 0.16.0 registry
path also contains `blob/` rather than the selected model's download-oriented
immutable `resolve/` path. SmolLM2 therefore offers lower model complexity and
a less ambiguous exact release pin for virtually the same download cost.
QVAC's 217 MB BitNet descriptor was not selected because this packet did not
establish equivalent public license provenance.

Sources:

- [QVAC 0.16.0 model contract](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/contract/models.json)
- [Pinned GGUF repository](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/tree/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f)
- [Base-model license](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/blob/cbcad7f4d160a10174f725b968ab6faf2a76399e/LICENSE)

### Public runtime boundaries

| Atlas phase | Public 0.16.0 boundary | What success proves |
|---|---|---|
| `qvac-import` | `import('@qvac/sdk')` | Published JS/native package graph can be resolved and imported in the runner. |
| `worker-start` | `await heartbeat()` | The local QVAC worker accepted and answered an RPC round trip. |
| `model-load` | `await loadModel({ modelSrc: SMOLLM2_360M_INST_Q8, ... })` | The pinned artifact was resolved and the LLM plugin reported a completed load. |
| `inference` | `await completion(...).final` plus a local non-empty-content check | One standardized completion reached a terminal success response with content. The content itself is not emitted or stored. |
| backend observation | `final.stats?.backendDevice` | Native completion stats directly reported CPU or GPU device class, when present. |
| cleanup | `unloadModel(...); close()` | Public model unload and SDK worker shutdown completed. |

`heartbeat()` is documented in source as usable for the local SDK worker. It is
a cleaner worker-start boundary than treating SDK import as worker startup.

`getLoadedModelInfo()` does not expose an LLM backend. Its local result includes
model/plugin identity, handlers, path, and load time. Exact backend name is also
absent from `CompletionStats`; its public backend field is the two-value
`backendDevice` enum.

The CPU/GPU value is not a log heuristic. The LLM addon maps the native
`backendDevice` numeric terminal statistic to `cpu` or `gpu`; QVAC's completion
normalizer carries it into public `CompletionStats`.

Sources:

- [Public SDK exports](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/index.ts)
- [Local heartbeat API](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/api/heartbeat.ts)
- [Model load API](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/api/load-model.ts)
- [Completion stats schema](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/completion-event.ts)
- [Native-stat mapping](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/llm-llamacpp/addon.js)
- [Completion-stat normalization](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/plugins/llamacpp-completion/ops/completion-stats.ts)
- [Loaded-model info schema](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/get-loaded-model-info.ts)

### Published-versus-main correction

`getSystemResources()` exists on current QVAC main, but a tag-scoped search
found no implementation or export in `sdk-v0.16.0`. Atlas must not depend on it
while its target is the published 0.16.0 package. Hardware collection for this
version needs Atlas's allowlisted platform collectors. A future adapter can use
`getSystemResources()` only after a published SDK containing it is detected.

This distinction also means research against the moving main branch must always
be labeled source inference until verified against an npm release/tag.

### Process isolation

QVAC's Node client already starts a separate Bare worker and has public worker
crash errors and `close()` cleanup. Atlas still needs an outer Node child because
it owns a hard deadline around the entire SDK lifecycle and must survive a crash
or hang in the client process as well as the Bare worker.

The spike implements:

- A detached process group on POSIX.
- `taskkill /PID ... /T /F` cleanup on Windows (source implemented, not run).
- Structured IPC for phase, backend-device observation, and bounded failure
  identity.
- A fixed event cap.
- Bounded local stdout/stderr tails.
- Deadline-triggered SIGTERM then SIGKILL of the POSIX process group.
- A POSIX process-group cleanup sweep after nominal child exit to prevent a
  nested Bare worker from becoming orphaned.
- An environment allowlist. Environment values are used only to execute the
  child and are never included in structured evidence.

Automated tests observed all of the following on macOS arm64:

- Successful structured phase capture.
- A SIGKILL child crash converted into parent-owned failure evidence.
- A hung child and its nested grandchild terminated at the deadline.
- A 128 KiB stderr write retained only as a configured 1 KiB tail.
- Arbitrary IPC and path-like observation values were dropped; invalid failure
  identity was reduced to fixed `unknown`/`Error` tokens.

The local debug tails are intentionally marked unsafe for report inclusion.
Production report creation may consume only the structured IPC events after
schema/privacy validation.

## Source inference, not observed runtime fact

- The pinned SmolLM2 artifact is expected to load through SDK 0.16.0 because it
  is an exported release descriptor for `llamacpp-completion`. It was not loaded
  on this host.
- `heartbeat()` success should prove worker readiness because the public API
  documents local use and performs an RPC response-type check. A real success
  was not observed here because QVAC was not installed.
- A terminal completion is expected to include `backendDevice`, but the field is
  optional in the public schema. Atlas must record `unknown` if it is omitted.
- A terminal response with empty trimmed `contentText` is a fixed-code workload
  failure, not inference success. Generated content never crosses the IPC
  boundary.
- The configured `device: "gpu"` and `gpu_layers: 999` express requested
  execution only. Neither is observation evidence.
- The POSIX cleanup prototype should also terminate QVAC's nested Bare process
  because that process remains inside the detached process group. This was
  observed with a generic nested Node process, not a real Bare worker.
- Windows tree cleanup is designed around the system `taskkill` facility but
  remains unverified on Windows. If the root child exits before the sweep,
  `taskkill /T` may no longer be able to discover descendants from that PID;
  unlike a POSIX process group, this prototype has no durable Windows job
  object. Success/crash-path descendant containment is therefore not proven on
  Windows.

## Commands and results

### Source and package checks

```bash
npm view @qvac/sdk version dist.tarball dist.unpackedSize engines license --json
```

Result: version 0.16.0, Apache-2.0, SDK package unpacked size 6,568,615 bytes,
no `engines` value returned.

```bash
git ls-remote https://github.com/tetherto/qvac.git refs/tags/sdk-v0.16.0
```

Result: `034d3158daf39b247a79e89e2cd90599a070960d`.

```bash
git show sdk-v0.16.0:packages/sdk/contract/models.json | jq \
  '.SMOLLM2_360M_INST_Q8, .QWEN3_600M_INST_Q4'
```

Result: the pinned values described above.

```bash
curl -sSIL '<immutable SmolLM2 artifact URL>'
curl -sS 'https://huggingface.co/api/models/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/revision/593b5a...' | jq ...
```

Result: immutable revision matched; size and SHA-256 headers matched the QVAC
contract; card license was Apache-2.0.

### Storage safety gate

```bash
df -h .
```

Result before the temporary research clone: approximately 905 MiB available.

```bash
npm view '<each direct @qvac/sdk@0.16.0 QVAC dependency>' dist.unpackedSize
```

Result: the 17 direct `@qvac/*` package sizes summed to approximately 4.43 GiB
unpacked, before non-QVAC transitive dependencies. The selected model adds
386,404,992 bytes. No existing `@qvac/sdk` installation or matching model cache
was found under the user workspace. Installing the stack could exhaust the
volume, so it was not attempted.

### Isolation verification

```bash
node --test spikes/runtime/isolation-supervisor.test.mjs
```

Result: 5 passed, 0 failed.

```bash
ATLAS_SPIKE_TIMEOUT_MS=5000 node spikes/runtime/run-qvac-smoke.mjs
```

Result: expected exit 1 because `@qvac/sdk` is not installed. The parent stayed
alive and returned structured events for `qvac-import started`, `qvac-import
failed`, failure code `ERR_MODULE_NOT_FOUND`, and successful cleanup. No raw
error message or local path entered the structured events.

## Required next verification

On a disk-capable macOS arm64 host with Node 22:

1. Review `spikes/runtime/model-candidate.json` and accept the Apache-2.0 model
   license and 386,404,992-byte download.
2. Install exact `@qvac/sdk@0.16.0` in a disposable project.
3. Run `ATLAS_SPIKE_TIMEOUT_MS=180000 node spikes/runtime/run-qvac-smoke.mjs`.
4. Confirm heartbeat, model load, inference, `backend-device`, unload, and clean
   shutdown events.
5. Confirm the model bytes match the pinned SHA-256 before inference.
6. Repeat with CPU request in a disposable comparison runner only if needed to
   validate fallback semantics; do not add a second V1 profile.
7. Run the same containment test on Windows before claiming Windows support.

## Unresolved risks and design consequences

1. **Exact backend name is unavailable.** Schema and site must separate direct
   device class from backend API/name; exact name stays unknown.
2. **Real lifecycle remains unobserved in this packet.** Do not create a genuine
   compatibility report from these fixtures or source findings.
3. **Package footprint is unusually large.** `npx qvac-atlas` must not depend on
   the full QVAC SDK directly if doing so forces every user to install all
   addons. Prefer resolving an existing user installation or investigate an
   official LLM-only public package boundary in a separate task.
4. **Model download is not small.** The CLI must display 386,404,992 bytes,
   license, source, and hash before consent. It should reuse a verified cache but
   must not modify user configuration.
5. **Node support is ambiguous.** Claim Node 22 only until Node 20 is genuinely
   exercised.
6. **Current main differs from the release.** All adapters must be keyed to
   installed package versions, not documentation from main.
7. **Windows cleanup is unverified.** The `taskkill` design may lose descendant
   discovery after the root PID exits. A Windows Job Object or equivalent
   verified containment mechanism is a release gate for Windows, not a reason
   to block macOS/Linux development.

## Dependencies unblocked

- The schema packet can model `requestedDeviceClass` separately from
  `observedDeviceClass`, and keep `observedBackendName` explicitly unknown.
- The CLI packet can use the public lifecycle boundaries and the process-group
  supervisor prototype.
- The profile packet can provisionally freeze SmolLM2 metadata, subject to a
  real hash-verified run before public reports are accepted.
- Hardware collection must not depend on `getSystemResources()` for SDK 0.16.0.
