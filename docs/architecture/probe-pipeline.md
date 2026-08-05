# Probe pipeline

Status: ATLAS-021C composes the genuine candidate pipeline through a CLI-private
coordinator, but shipped `main()` passes a literal false release gate. Real QVAC
execution and production claim admission remain disabled.

## Scope

The probe package owns the local sequence from disclosure through an exclusive
local report write. It has no network client, uploader, installer, downloader,
repair action, telemetry, service, or default output path. The shipped CLI exposes
only fully synthetic fixture execution until an accepted, conforming ATLAS-013
physical verdict and independent privacy review exist. Its private real composition
binds the exact current project resolver handle, normalized Doctor, contained pinned
acquisition, opaque execution grant, and directly supervised executor, but the
literal false gate refuses before TTY, cwd, signal, prompt, or real-module effects.

The internal pipeline remains:

```text
disclose
  -> acknowledge fingerprint and authorize local collection
  -> collect allowlisted platform facts
  -> normalize project-local Doctor evidence
  -> consume strict runner events
  -> assemble + schema-validate publication=false report
  -> validate a draft and render a privacy-bounded summary
  -> choose anonymous submission
  -> revalidate final JSON
  -> automatic exclusive local write
  -> exclusive local write
```

The state machine rejects skipped, repeated, and out-of-order transitions.
The community CLI presents one combined local-run decision; the project-code and
workload callbacks consume that decision without additional prompts. It renders
only allowlisted summary fields rather than dumping raw JSON, asks
`Submit anonymous report? [y/N]` once, writes the exact final bytes locally first,
and performs one request only when the answer is yes. Declining publication still
permits a private local report. Declining local-run acknowledgement stops
before platform collection, Doctor, runner, preview, or write.

Noninteractive use is refused. V1 does not provide a `--yes`, environment-variable,
or configuration bypass for these decisions.

During real execution the root keeps persistent handlers for `SIGINT`, `SIGTERM`,
and `SIGHUP` until the complete coordinator and output transaction settle. The
first signal requests bounded cancellation; repeated signals remain handled rather
than restoring default termination during child cleanup. Handlers are removed only
after settlement. Unexpected hard parent loss is separately contained by the
executor child's process-group disconnect fail-safe.

## Exact preview and write

The draft is assembled with `consent.publication: false`, validated by the
integrated `@qvac-atlas/schema` package, canonically serialized, and reduced to a
human-readable summary. After the anonymous submission choice, the consent field
is updated, the report is revalidated, and the exact final bytes are written.
Publication consent is
not part of the evidence hash, so the report ID remains stable, while the serialized
document correctly reflects the user's decision.

The final serialized string is exactly the string passed to the writer. The writer:

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
project-local `@qvac/cli` 0.9.0 installation with the verified package name. The
raw published tarball declares `{ "qvac": "./dist/index.js" }`; registry and
package-manager normalization may expose the path as `dist/index.js`. Atlas accepts
only those two path-equivalent known forms. The selected project must directly
declare it. Resolution uses the logical project `node_modules` path, realpaths,
file checks, and containment. It never searches PATH, executes a package-manager
shim, runs `npx`, or installs a package.

The executor uses `process.execPath`, the audited entry, `doctor --json`, a bounded
environment, a 30-second outer timeout, a 256 KiB stdout cap, and process-tree
termination. POSIX termination escalates from the process-group SIGTERM to SIGKILL
and has a hard-settle bound. The Doctor adapter retains an explicit System32
`taskkill.exe` tree operation for its portable package boundary, but V1 real
execution refuses every non-macOS-arm64 host before project resolution.

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

The interactive artifact/workload disclosure includes the exact engine, local-path
use, context size, requested device, GPU-layer count, fixed user prompt, streaming
mode, generation parameters, unload/close behavior, post-run artifact verification,
and lifecycle phases before workload consent. The prompt and generated output never
enter the report.

ATLAS-021B added the real state machine and coordinator-facing pipeline. ATLAS-021C
exposes only a narrow `./real` composition subpath to the private CLI coordinator;
the public probe root remains fixture-only. The output
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
before invocation and before interpreting its result. Once the write begins, its
exact result is `written`, proven `write-failed`, or `cleanup-uncertain`; an
unexpected boundary rejection is also uncertain and never claims that no local
report exists. A foreign no-clobber racer may occupy the private path.

ATLAS-021C constructs the interaction and output closures from one normalized,
immutable output path. This keeps the local-write confirmation bound to the
same path that was preflighted and eventually written. The confirmation closure
may display that path, but it is never passed through generic pipeline arguments or
results, nor to other interaction callbacks.

Coordinator results and nested evidence use exact-key parsing, detachment, bounded
enum/code allowlists, schema validation, and privacy scanning before draft preview
and again before final serialization. Exact normalized Doctor failures and
timeouts are retained; ordinary concrete Doctor errors become
`unknown/unavailable`, while a coordinator-boundary or cleanup-invariant failure
is fatal and produces no report.
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
in the probe package. The CLI-private coordinator composes the dormant resolver,
acquisition, and executor without exposing their capabilities through this pipeline
or the CLI interaction layer.

## Profile candidate

`profiles/candidates/smollm2-360m-instruct-q8.json` records the source-verified
candidate metadata and explicitly sets `claim_eligible: false`. Contained
acquisition is wired only behind the hardcoded-false private gate. It has been
exercised in a private human-operated attempt, but that fact is not an accepted
ATLAS-013 verdict or publication authority. Promotion requires the accepted
physical and privacy reviews, active repository trust, and a separate protected
profile-admission decision. Until then, the exported pipeline uses the existing
test-only profile and fixture provenance.
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
