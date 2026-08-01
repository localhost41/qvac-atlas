# QVAC executor boundary

Status: ATLAS-016A dormant integration foundation. The executor has no production
model authorization issuer, probe-pipeline binding, CLI command, downloader,
uploader, or claim-producing path.

## Package boundary

`@qvac-atlas/qvac-executor` depends at runtime only on the project-local SDK
resolver. It structurally implements the probe package's `RunnerExecutor` contract
without importing probe at runtime. Probe is used only by the synthetic integration
test. Neither `@qvac-atlas/probe` nor `@qvac-atlas/cli` depends on the executor.

`ProjectLocalQvacExecutor` stores the resolver handle and model grant in JavaScript
private fields. The model grant is backed by private weak collections, is
single-use, has no enumerable state, serializes as `undefined`, and cannot be
forged by constructing an object with the public prototype. ATLAS-016A has an
internal test issuer in its compiled implementation, but the package export map
does not expose that subpath. There is no production issuer.

The child uses the built-in `SMOLLM2_360M_INST_Q8` registry descriptor only against
the synthetic SDK fixture in ATLAS-016A. Adding a production issuer is not enough
to activate this code. Before any production issuer or wiring, the child must be
changed to load an Atlas-staged canonical local artifact through a tag-verified SDK
0.16 public API, so the bytes actually given to QVAC are the bytes Atlas hashed.
ATLAS-016A is not a network sandbox: deliberately combining the internal synthetic
grant with a real resolved SDK could allow that registry descriptor to invoke
QVAC's own download behavior. Dormancy is enforced by the unexported issuer and
absence from probe/CLI wiring, not by intercepting SDK network calls.

This is an intentional stop boundary. A later issuer must display the candidate's
Apache-2.0 license, exact 386,404,992-byte size, immutable source and destination,
obtain explicit interactive consent, and recompute the pinned SHA-256 from local
bytes before it can authorize real execution. The exact SDK 0.16 local-file/cache
contract still needs tag-scoped source verification. The checked-in candidate
remains claim-ineligible.

## Launch and containment

The executor creates a fresh temporary cwd and calls the resolver's
`launchResolvedSdkChild`. Its `beforeBootstrap` callback synchronously installs
IPC, exit, error, stdout, stderr, deadline, and process-group supervision before
the resolver transmits SDK path material. The audited SDK entry travels only in
the resolver's private bootstrap IPC. It is absent from argv, environment,
structured events, errors, and returned evidence.

POSIX children are detached process-group leaders. Timeout or protocol failure
sends group `SIGTERM`, waits 250 ms, sends group `SIGKILL`, and has a bounded
two-second root settle. Every root exit, including a clean exit, is followed by a
short TERM-to-KILL group sweep so a surviving nested Bare worker cannot be orphaned.
The resolver performs the same group sweep when bootstrap setup or send fails,
including when the root has already exited. Windows refuses before temporary cwd
creation or spawn; durable Job Object containment remains ATLAS-014.

Stdout and stderr are always drained into separate 16 KiB in-memory tails. The
tails are zeroed after the child is reaped and have no getter, log, event, error, or
report surface.

## Child protocol

The child emits at most 16 messages and 16 KiB in aggregate. An individual message
may be at most 4 KiB. The exact grammar is:

```text
{ type: phase, sequence, phase, state: started|succeeded|failed }
{ type: backend, sequence, backend: cpu|gpu }
```

Keys must be exact, sequences contiguous from zero, phases ordered, transitions
paired, and backend emitted at most once while inference is open. Invalid,
excessive, oversized, duplicate, reordered, or post-terminal messages terminate
the group. The parent then emits fixed inconclusive evidence with an explicit
unknown terminal phase; contributor-controlled values never pass through.

The parent owns all durations, termination classification, result classification,
and failure codes. It preserves the first failed lifecycle phase even when cleanup
also fails. The child always attempts cleanup, but the V1 report contract forbids a
later attempted phase after a defined failure, so post-failure cleanup transitions
are intentionally omitted from returned report events. `last_completed_phase` is
therefore the final reported passed phase immediately before the failure. Every
non-passing result records `completion_observed: false`, including a shutdown
failure after inference, as required by the V1 semantic validator.
If cleanup times out after an earlier lifecycle failure, V1 cannot represent both
failures as one defined failure claim. Atlas retains the first failure phase and
the real timeout termination but downgrades the result to fixed unknown evidence
with `CLEANUP_TIMEOUT_AFTER_FAILURE`.

Default deadlines are 180 seconds overall; 15 seconds for bootstrap/import; 10
seconds for heartbeat; 120 seconds for model load; 30 seconds for inference; and
10 seconds for shutdown.

## Audited child lifecycle

The call shape is pinned to the public SDK 0.16 boundaries recorded in
`docs/research/runtime-feasibility.md` at release commit
`034d3158daf39b247a79e89e2cd90599a070960d`:

1. Receive, revalidate, and import the resolver-provided SDK entry.
2. Require `heartbeat`, `loadModel`, `completion`, `unloadModel`, `close`, and the
   `SMOLLM2_360M_INST_Q8` descriptor.
3. `await heartbeat()`.
4. Load the descriptor with context 512, requested `gpu`, and 999 GPU layers.
5. Request the fixed eight-token, seed-one, temperature-zero completion and await
   `run.final`.
6. Require nonempty trimmed content without transmitting or storing that content.
7. Emit only an exact terminal `cpu|gpu` observation when present.
8. In `finally`, unload the loaded model with `clearStorage: false`, then call
   `close()` even when unload fails.

Synthetic tests use an exact accepted `@qvac/sdk@0.16.0` manifest and a module with
that public runtime shape. They prove Atlas's binding, protocol, privacy, and
containment behavior; they do not prove the native QVAC runtime, backend, model
download, cache, or real-device behavior.

## Verification corpus

Tests cover the exact happy lifecycle through `StructuredRunnerAdapter`, absent
optional backend evidence, single-use and nonserializable grants, fixed SDK call
arguments, first-failure preservation, unload failure followed by close, bounded
private stdout/stderr, mid-lifecycle hostile IPC, timeout, root crash, nested-child
cleanup at timeout, nested-child cleanup after a clean root exit, bootstrap cleanup
after an already-exited root, and pre-spawn Windows refusal.
