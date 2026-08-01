# QVAC executor boundary

Status: ATLAS-020 dormant verified-artifact integration. The executor has no
acquisition-consent issuer, probe-pipeline binding, CLI command, downloader,
uploader, profile approval, or claim-producing path.

## Package boundary

`@qvac-atlas/qvac-executor` depends at runtime on the project-local SDK resolver
and the narrow model-artifact executor bridge. It implements the probe package's
`RunnerExecutor` shape without importing probe at runtime. Probe is used only by
synthetic integration tests. Neither probe nor CLI depends on the executor.

`ProjectLocalQvacExecutor` stores the resolver handle and model grant in JavaScript
private fields. The model grant is backed by private weak collections, is
single-use, has no enumerable state, serializes as `undefined`, and cannot be
forged by constructing an object with the public prototype. Its public issuer
accepts only a consumed capability for the exact pinned artifact. An arbitrary
material issuer remains confined to the unexported synthetic-test surface.

The child never reads a registry descriptor. It accepts only the canonical local
path, size, digest, and `llamacpp-completion` engine bound into the grant. The path
is fully verified before local load and after close, and QVAC's loaded-model info
must confirm the same ID, type, non-delegated status, and exact path.

This is an intentional stop boundary. A later activation and consent flow must
display the candidate's Apache-2.0 license, exact 386,404,992-byte size, immutable
source and destination, obtain explicit interactive consent, and recompute the
pinned SHA-256 from local bytes before it can authorize real execution. The
checked-in candidate remains claim-ineligible, and no public command can issue
acquisition consent.

## Launch and containment

The executor creates a fresh temporary cwd and calls the resolver's
`launchResolvedSdkChild`. Its `beforeBootstrap` callback synchronously installs
IPC, exit, error, stdout, stderr, deadline, and process-group supervision before
the resolver transmits SDK path material. The audited SDK entry travels only in
the resolver's first private bootstrap IPC. The exact artifact material follows in
one second parent-to-child message inside the same launch-failure cleanup envelope.
Neither bootstrap enters argv, environment, structured events, errors, or returned
evidence.

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
Likewise, if all five phases pass but the Node root remains alive until the outer
deadline, Atlas retains the timeout termination and the fully passed lifecycle but
records fixed inconclusive `TIMEOUT_AFTER_LIFECYCLE` evidence. It does not relabel
the already-passed shutdown phase as a defined timeout failure.

Default deadlines are 180 seconds overall; 15 seconds for bootstrap/import; 10
seconds for heartbeat; 120 seconds for model load; 30 seconds for inference; and
30 seconds for shutdown so the second full hash remains phase-bounded.

## Audited child lifecycle

The call shape is pinned to the public SDK 0.16 boundaries recorded in
`docs/research/runtime-feasibility.md` at release commit
`034d3158daf39b247a79e89e2cd90599a070960d`:

1. Install both bootstrap receivers synchronously, then receive/import the SDK and
   parse the exact artifact bootstrap.
2. Require `heartbeat`, `loadModel`, `getLoadedModelInfo`, `completion`,
   `unloadModel`, and `close`.
3. `await heartbeat()`.
4. Descriptor-safely verify the private root and artifact, exact size, and SHA-256.
5. Load only the canonical path as `llamacpp-completion` with context 512,
   requested `gpu`, and 999 GPU layers.
6. Require loaded-model info to report the same ID, non-delegated type, and path.
7. Run the fixed completion and emit only an exact terminal `cpu|gpu` observation.
8. Unload any returned ID with `clearStorage: false`, always call `close()`, then
   fully revalidate artifact bytes and pre-load root/file identity.

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
