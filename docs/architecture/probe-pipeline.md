# Probe pipeline

Status: ATLAS-021B genuine candidate report and dependency-inverted pipeline are
implemented but dormant. Real QVAC SDK execution, CLI wiring, and production claim
admission remain disabled.

## Scope

The probe package owns the local sequence from disclosure through an exclusive
local report write. It has no network client, uploader, installer, downloader,
repair action, telemetry, service, or default output path. The CLI exposes only
fully synthetic fixture execution until the integrated ATLAS-015 resolver is bound
to a production executor and a hash-verified real lifecycle passes the device gate. Its Doctor result is synthetic
as well; the separately tested real Doctor adapter is not wired to a user command in
this packet.

The pipeline is:

```text
disclose
  -> acknowledge fingerprint and authorize local collection
  -> collect allowlisted platform facts
  -> normalize project-local Doctor evidence
  -> consume strict runner events
  -> assemble + schema-validate publication=false report
  -> preview exact draft JSON
  -> choose publication intent
  -> revalidate + preview exact final JSON
  -> approve exact local output path
  -> exclusive local write
```

The state machine rejects skipped, repeated, and out-of-order transitions.
Publication cannot be chosen before the draft preview. The write cannot occur
before the final preview and separate write confirmation. Declining publication
still permits a private local report. Declining fingerprint acknowledgement stops
before platform collection, Doctor, runner, preview, or write.

Noninteractive use is refused. V1 does not provide a `--yes`, environment-variable,
or configuration bypass for these decisions.

## Exact preview and write

The draft is assembled with `consent.publication: false`, validated by the
integrated `@qvac-atlas/schema` package, canonically serialized, and shown in full.
After the publication choice, the consent field is updated, the report is
revalidated, and the complete final bytes are shown again. Publication consent is
not part of the evidence hash, so the report ID remains stable, while the serialized
document correctly reflects the user's decision.

The final preview string is exactly the string passed to the writer. The writer:

- requires an explicit absolute output path;
- does not create parent directories;
- uses an exclusive create operation and refuses to overwrite an existing file;
- requests owner-only permissions where supported; and
- never uploads the result.

## Platform collection

Collection uses Node's public `os` API only. It constructs a new allowlisted object
containing OS family/release, architecture, CPU model/vendor, a coarse memory bucket,
and Node version. It never asks for hostname, network interfaces, user information,
environment values, process lists, paths, serial numbers, or machine identifiers.

Unsupported architecture, OS, memory, and unsafe/private strings normalize to
`unknown`. CPU family and feature flags remain unknown/empty because Node does not
expose a safe portable source. Node has no safe cross-platform GPU inventory API;
ATLAS-009 records an empty inventory and explicitly does not interpret it as absence
of a GPU or proof of CPU execution. A future collector requires a schema/privacy
review rather than invoking arbitrary system inventory commands.

## Official Doctor adapter

Doctor is an input, not a replacement target. The adapter accepts only an exact
project-local `@qvac/cli` 0.9.0 installation with the verified package name and
`{ "qvac": "dist/index.js" }` bin shape. The selected project must directly
declare it. Resolution uses the logical project `node_modules` path, realpaths, file
checks, and containment. It never searches PATH, executes a package-manager shim,
runs `npx`, or installs a package.

The executor uses `process.execPath`, the audited entry, `doctor --json`, a bounded
environment, a 30-second outer timeout, a 256 KiB stdout cap, and process-tree
termination. POSIX termination escalates from the process-group SIGTERM to SIGKILL
and has a hard-settle bound. Windows uses the explicit System32 `taskkill.exe` tree
operation; real Windows containment remains a release gate.

Raw JSON never enters a report. Normalization requires the exact documented root
shape, all five unique Doctor sections, nonempty strictly shaped checks, allowlisted
statuses/severities, and consistency between `ok` and failed checks. The report
retains only passed/failed/unknown plus a bounded duration. Labels, hints, values,
paths, platform details, and raw stderr are discarded. Missing or unsafe local CLI
evidence becomes `unknown/unavailable`, not a compatibility failure. When QVAC
discovery itself was not reached, the pipeline records Doctor as
`skipped/not-reached` without invoking it.

## Runner boundary

`StructuredRunnerAdapter` accepts an injected executor and consumes a maximum of 32
IPC-like events. It accepts only exact allowlisted event keys and enum values for:

- lifecycle phase and bounded duration;
- directly observed generic `cpu|gpu` device class;
- normalized process termination; and
- normalized workload result/failure identity.

An extra field, malformed shape, private-data canary, excessive event count,
non-array result, or executor exception becomes fixed inconclusive evidence. Raw
errors, excerpts, and paths never propagate. Failure excerpts must be `null`, and a
backend event is accepted only after an attempted inference event. A missing
backend is `not-reached` unless an inference phase was actually attempted; it is
never inferred from hardware or the requested device.

ATLAS-009 supplies only a fake executor for success, missing-QVAC, worker-crash, and
timeout scenarios. Every assembled report therefore has fixture provenance and can
never create a registry claim.

## Dormant genuine candidate pipeline

ATLAS-021B adds a relative-only real state machine and coordinator-facing pipeline;
neither is exported from the probe package or wired to a command. The output
boundary privately owns its path and is preflighted before any interaction. The
coordinator privately retains one continuous resolved-project session and returns
only exact status unions plus newly snapshotted QVAC, Doctor, and lifecycle
evidence. Interaction callbacks receive only deeply frozen disclosures, exact
decisions, publication warnings, and canonical report JSON—never an SDK handle,
artifact/execution capability, runtime object, or path.

The real ordering is output vacancy, privacy disclosure, fingerprint decision,
allowlisted collection and exact-project resolution, project-code disclosure and
decision, normalized Doctor, combined artifact/workload disclosure and decision,
runtime, draft preview, publication intent, exact final preview, local-write
decision, and an uncancellable exclusive write. Every awaited seam checks abort
before invocation and before interpreting its result. Once the write begins,
resolve is authoritative commit; rejection settles after owned cleanup and proves
that no Atlas-created target or partial remains. A foreign no-clobber racer may
occupy the private path.

ATLAS-021C must construct the interaction and output closures from one normalized,
immutable output path. This keeps the hidden-path write confirmation bound to the
same path that was preflighted and eventually written. The confirmation closure
may display that path, but it is never passed through generic pipeline arguments or
results, nor to other interaction callbacks.

Coordinator results and nested evidence use exact-key parsing, detachment, bounded
enum/code allowlists, schema validation, and privacy scanning before draft preview
and again before final serialization. Exact normalized Doctor failures and timeouts
are retained; a throw or malformed result becomes `unknown/unavailable`.
Acquisition, grant, launch, resolver, or runtime preflight failure produces no
report. Synthetic tests cover refusal, malformed/proxy values, private path/digest
canaries, mutation after callbacks, abort settlement, write races, and exact
final-preview/write bytes.

## ATLAS-021C composition contract

The integrated dormant executor accepts only a private, pre-audited resolver grant
for:

- Node 22;
- an exact project-declared physical `@qvac/sdk` 0.16.0 installation;
- the exact/default cwd project root;
- a bounded manifest and direct declaration;
- logical `node_modules/@qvac/sdk`, realpath containment, known manifest
  fingerprint, and a contained regular `dist/index.js` entry.

It must not implement an Atlas SDK dependency/peer, package-manager lookup,
ancestor/global/NODE_PATH/PnP resolution, or external-link fallback. Discovery that
is absent, unsafe, unsupported, or incomplete is unknown evidence rather than a
compatibility failure.

The production child receives the audited entry through private IPC, uses a fresh
temporary cwd, removes `NODE_PATH`, `NODE_OPTIONS`, `QVAC_CONFIG_PATH`, and
`QVAC_WORKER_PATH`, uses `fork` with `execArgv: []`, and imports only the audited file
URL. SDK paths never enter structured events or reports. No real executor is present
in the probe package, and ATLAS-021C must compose the dormant resolver, acquisition,
and executor without exposing their capabilities through this pipeline or the CLI
interaction layer.

## Profile candidate

`profiles/candidates/smollm2-360m-instruct-q8.json` records the source-verified
candidate metadata and explicitly sets `claim_eligible: false`. Contained
acquisition exists but remains unwired and has performed no real fetch. Promotion
requires explicit license/size disclosure, opt-in download, local SHA-256
verification, and a real successful lifecycle. Until then, the exported pipeline
uses the existing test-only profile and fixture provenance.
The dormant relative-only pipeline can assemble probe provenance with candidate
profile `atlas-smollm2-360m-lifecycle@1.0.0-candidate.1`, but central claim
evaluation with the empty production-profile allowlist remains ineligible for both
success and failure claims.

## Type authority

JSON Schema remains the sole normative report definition. The schema package emits
a checked-in `AtlasReport` declaration through its type-only `./report` export, and
the probe derives its convenience aliases through indexed access into that generated
type. A byte-for-byte in-memory drift gate fails when the normative schema changes
without regenerating the declaration. The generated banner binds the declaration to
a canonical SHA-256 of the complete normative schema, including runtime-only
conditional branches omitted from the TypeScript projection. Runtime schema,
semantic, and privacy validation are mandatory before draft and final
serialization. The frozen final bytes shown to the user are held unchanged through
write consent and the write; TypeScript compilation is never treated as report
validation.

## Verification

Tests cover:

- noninteractive refusal and disabled real execution;
- state-machine consent ordering;
- no collection after fingerprint refusal;
- no write before draft/final preview and write consent;
- byte-identical deterministic output for injected evidence/time;
- schema-valid success, missing, crash, and timeout reports;
- allowlisted platform unknowns and privacy canaries;
- strict Doctor shape, version/bin, raw-path stripping, timeout escalation, and
  unavailable evidence;
- hostile runner values, non-arrays, exceptions, and backend-not-reached semantics.
