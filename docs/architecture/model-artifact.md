# Private model artifact boundary

Status: ATLAS-021A dormant contained-acquisition foundation. No CLI command, probe
binding, report field, candidate eligibility, or profile allowlist is enabled.

## Candidate and disclosure

`@qvac-atlas/model-artifact` contains one immutable candidate:

- SmolLM2-360M-Instruct Q8_0 at revision
  `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`.
- Exact source
  `https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf`.
- Exact size 386,404,992 bytes and SHA-256
  `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`.
- Apache-2.0 license and `llamacpp-completion` engine.

The pure disclosure function performs no filesystem or network operation. It
identifies the candidate, immutable source, revision, exact size and digest,
license, private destination, full-verification cache policy, and the three future
effects: private-directory creation, private-file creation, and, only on a cache
miss, the exact pinned HTTPS download. Acquisition cannot begin without a matching
opaque consent.

## Capability boundary

Consent and verified-artifact capabilities have private constructors backed by
module-private weak collections. They have no enumerable state, serialize as
`undefined`, reject prototype forgery, and are prepared for single-use consumption.
Consent is bound to the candidate and requested private root and is consumed before
the first filesystem or byte-source effect, including when acquisition later
fails. ATLAS-019 includes only an unexported synthetic consent issuer for tests;
the package export map exposes neither that issuer nor general artifact inspection
or consumption. Its narrow `./executor-bridge` export consumes a capability exactly
once, requires the exact pinned candidate, and returns only frozen path, size,
SHA-256, and engine material to the trusted executor. Forged, reused, and
non-pinned capabilities fail with one fixed path-free code.

## Filesystem and source controls

Atlas refuses Windows because private ACL, directory-fsync, and atomic publication
semantics are not established there. On POSIX, it requires a canonical,
owner-controlled `0700` physical artifact directory with no symlink at any path
component, plus `0600` regular files with exactly one link. It opens directories
and files with `O_NOFOLLOW`, compares path and descriptor identity, and rechecks
the physical component chain and canonical root around mutations and immediately
before capability issue. A cache hit requires descriptor-bounded streaming of
exactly the pinned byte count, a full SHA-256 match, stable identity, and private
permissions; an invalid existing target is never repaired or overwritten.

Acquisition streams through an exclusive unpredictable partial file. Every chunk
is bounded, overflow is rejected before a write, the exact length and digest are
required, and the file is synced and descriptor-rehashed before publication.
Publication uses a same-filesystem hard link as an atomic no-clobber operation,
then removes the staging name, rehashes the published descriptor, rechecks its
single-link identity, and syncs the directory. Failure cleanup removes only an
inode whose identity matches Atlas's immediately before pathname unlink. Node does
not provide descriptor-relative guarded unlink, so this last check is still a
same-UID TOCTOU boundary. ATLAS-019 therefore requires a quiescent private artifact
directory; stronger same-user process containment remains an activation gate.

The source receives an `AbortSignal`, and callers may provide their own abort
signal. The production timeout defaults to 30 minutes. A validated deadline races
source creation, every iterator step, and injected hooks, with monotonic checks
between bounded writes, descriptor-hash reads, setup, and publication operations.
Monotonic checks also prevent resolved-promise microtask starvation; zero-byte
chunks are invalid. Timeout owns the terminal reason, aborts the source signal, and
settles after owned-file cleanup even if the source never yields or ignores abort.
Local filesystem operations and cleanup are deliberately awaited instead of being
abandoned after a race: this prevents late handle leaks and post-return mutation.
Production acquisition owns the exact pinned HTTPS request. ATLAS-021A replaces
automatic redirects with at most three manually validated HTTPS redirects through
a finite reviewed Hugging Face host set. The transport sends only exact Host,
Accept, and Atlas User-Agent headers, accepts only an unencoded exact `200`, rejects
ambiguous scalar headers, and retains exact stream length and hash as authority.
Acceptance tests use only unexported relative transport/byte-source seams and
disable real network access.

All boundary failures have fixed codes and messages. They contain no URL, local
path, response body, upstream exception, or digest material.

## Contained acquisition and recovery

The narrow `./contained` transaction creates the exact frozen disclosure for the
OS-account-owned `~/.qvac-atlas-models` root, awaits one callback decision, and
internally issues and consumes a non-exported consent before any cache or network
effect. It exposes no cache-root, source, candidate, timeout, runner, nonce, or
cleanup control. It remains dormant behind the CLI's hardcoded-false private
composition path and is not imported by the public probe API.

After approval the root process generates one 192-bit lowercase-hex attempt nonce
and forks only the package-owned acquisition child in a detached POSIX process
group with empty environment, empty `execArgv`, ignored stdin, bounded/drained
stdio, and exact bounded JSON IPC. Windows refuses before spawn. The parent owns a
hard deadline and abort path, applies TERM then KILL, reaps the root, sweeps the
whole process group to absence, waits for IPC close, and accepts only the exact
state grammar plus a clean terminal/exit pairing. Only then does the parent mint
the expected pinned capability; no child-supplied path or digest is accepted.

The child fully verifies cache state, then requires 512 MiB available reserve for
a valid hit or exactly 923,275,904 bytes for a miss before source creation. A miss
uses the exact nonce-derived `0600` staging name. After abnormal termination and a
legal `staging-open` acknowledgement, the parent runs at most one separately
bounded package-owned recovery child for that name. Recovery opens only an
existing safe `0700` root, never scans, deletes a safe one-link partial after an
adjacent identity check, and normalizes a two-link publication only after exact
inode, size, and full descriptor hash verification. Unsafe or uncertain entries
are preserved with a fixed path-free cleanup failure; recovery never issues a
capability.

## Execution revalidation and dormancy

The bridge reopens only an existing owner-controlled `0700` root and its `0600`,
single-link regular artifact. It performs descriptor-bounded exact-size hashing and
stable path/descriptor checks before local load and after close. The two successful
validations retain and compare private root/file identity snapshots, detecting even
a byte-identical permanent inode replacement across QVAC exposure. D-014's
same-UID quiescence limitation still applies; this does not claim cryptographic
binding against swap-and-restore races.

The package is imported only by the dormant QVAC executor and CLI-private
coordinator, not the public probe API, catalog, or schema. The candidate remains
ineligible for claims. The CLI coordinator composes the project/SDK/GPU ceremony
and the two directly supervised worker waves behind a hardcoded-false release
gate; neither this contained transaction nor the execution-grant wrapper runs the
model by itself.
