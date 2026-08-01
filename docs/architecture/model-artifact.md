# Private model artifact boundary

Status: ATLAS-019 dormant acquisition foundation. No CLI command, probe binding,
model execution grant, report field, candidate eligibility, or profile allowlist is
added by this work.

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
the package export map exposes neither that issuer nor artifact inspection or
consumption. A later reviewed bridge can add a production issuer/consumer without
weakening the capability representation.

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
Consequently, activation still requires process-level containment for a stalled or
hostile filesystem in ATLAS-020/021; this dormant package alone does not claim that
hard bound. Production acquisition owns the exact pinned HTTPS request. Acceptance
tests use only an unexported injected byte-source seam and disable network access.

All boundary failures have fixed codes and messages. They contain no URL, local
path, response body, upstream exception, or digest material.

## Dormancy and next boundary

The package is not imported by probe, CLI, catalog, schema, or the QVAC executor.
The candidate remains ineligible for compatibility claims. ATLAS-020 must first
review the local-file SDK bridge, connect explicit interactive disclosure and
consent, consume the verified artifact capability exactly once, and ensure QVAC
receives the canonical path whose descriptor Atlas verified. Merely adding a
consent issuer must not activate model execution.
