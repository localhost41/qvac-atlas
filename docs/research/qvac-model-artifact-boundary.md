# QVAC 0.16.0 model artifact boundary

Date: 2026-07-31

Normative QVAC baseline: release tag `sdk-v0.16.0`, commit
`034d3158daf39b247a79e89e2cd90599a070960d`

Artifact baseline: official Hugging Face repository at revision
`593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`

Runtime observation: none; this packet is a tag-scoped source audit only.

## Verdict: NARROW

A production Atlas model-grant issuer is feasible only if Atlas owns artifact
acquisition, private storage, and byte verification, then gives QVAC a canonical
absolute local GGUF path. SDK-managed `registry://` download is **blocked for the
production issuer** even though QVAC verifies the pinned model's size and SHA-256.

The blocking issues are destination control and fail-closed proof:

- `cacheDirectory` controls model files, but not the registry client's corestore.
- QVAC accepts `cacheDirectory` only through initialization config. Its Node client
  catches and logs a rejected worker config instead of rejecting the initiating SDK
  call, so Atlas cannot prove before network activity that the override took effect.
- Atlas's existing sanitized child boundary removes `QVAC_CONFIG_PATH` and rejects
  inherited/project config. A future Atlas-generated JSON config could carry the
  public knob, but it would not fix the missing acknowledgement or the separate
  registry corestore destination.
- QVAC hashes registry bytes before addon load, but it passes a path—not a verified
  handle—to the addon. The source does not provide cryptographic binding across that
  verify-to-open interval.

The safe V1 reduction is therefore: disclose and obtain consent for an Atlas-owned
download; stage the exact immutable Hugging Face object in an Atlas-private,
quiescent directory; verify size and SHA-256; pass only its canonical absolute path
to `loadModel`; confirm the loaded path locally with `getLoadedModelInfo`; and hash
the file again after the lifecycle. The path and hashes are executor-internal and
must never enter structured events or reports. This is a private-cache/absence-of-
other-writers safety assumption, not cryptographic proof that the addon opened the
same bytes.

| Decisive question                                                                                | Answer                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can QVAC 0.16 place the model file in an Atlas-private root without changing user/global config? | **Conditionally:** the public `cacheDirectory` field can be supplied in an Atlas-owned JSON config, but the present sanitized launcher has no approved config transport and QVAC does not propagate a worker rejection. |
| Does that one root contain all state created by a registry load?                                 | **No:** registry corestore state remains under `<HOME_DIR>/.qvac`.                                                                                                                                                      |
| Does the exact built-in descriptor enforce size and hash on cached reuse?                        | **Yes:** every cache-resolution attempt for that exact catalog path stats and hashes before returning the cached path.                                                                                                  |
| Is the hash check immediate/atomic with addon open?                                              | **No:** verification and native path open are separate operations.                                                                                                                                                      |
| Is a preverified local GGUF supported?                                                           | **Yes, narrowly:** as an absolute path, with validation owned by Atlas.                                                                                                                                                 |
| Final production-grant verdict                                                                   | **NARROW** for Atlas-managed local staging; **BLOCKED** for SDK-managed download.                                                                                                                                       |

## Evidence vocabulary

- **SOURCE FACT** — stated or implemented by the exact QVAC release source, or
  returned by the exact official Hugging Face revision/artifact endpoint.
- **SOURCE INFERENCE** — follows from the tagged call graph but was not runtime
  observed in this packet.
- **UNKNOWN** — cannot be established from the allowed sources.

No package or model was installed or downloaded for this research. No moving-main
QVAC source is used as evidence.

## Pinned artifact

**SOURCE FACT.** QVAC's release contract and generated registry export identify
`SMOLLM2_360M_INST_Q8` as:

| Field    | Pinned value                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Source   | `registry://hf/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf` |
| Revision | `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`                                                                                                |
| Size     | `386404992` bytes                                                                                                                         |
| SHA-256  | `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`                                                                        |
| License  | Apache-2.0                                                                                                                                |
| Engine   | `llamacpp-completion`                                                                                                                     |

The exact release values are in the
[QVAC model contract](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/contract/models.json#L4677-L4692)
and the descriptor is exported with those generated fields in
[the registry model module](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/models/registry/models.ts#L18478-L18494).
The official Hugging Face
[revision tree](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/tree/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f)
contains the pinned file. A HEAD request to the official
[immutable artifact endpoint](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/593b5a2e04c8f3e4ee880263f93e0bd2901ad47f/smollm2-360m-instruct-q8_0.gguf)
returned `x-linked-size: 386404992` and `x-linked-etag` equal to the QVAC SHA-256.
The official base-model
[license at its pinned revision](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/blob/cbcad7f4d160a10174f725b968ab6faf2a76399e/LICENSE)
is Apache-2.0. The bytes themselves were not downloaded or independently hashed in
this packet.

## `modelSrc` input and local-file support

### Accepted shape

**SOURCE FACT.** The public input is either a string or an object containing
`src: string`; the descriptor may also contain `name`, registry fields,
`expectedSize`, `sha256Checksum`, engine, and addon metadata. See
[`modelDescriptorSchema`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/model-src-utils.ts#L13-L30).

**SOURCE FACT.** For built-in model loads, the public client transforms that input
to a request containing only the descriptor's `src` string and optional `name`.
Descriptor `expectedSize` and `sha256Checksum` do not cross the normal public client
RPC boundary. See the
[`loadModel` request transform](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/load-model.ts#L234-L252).

This creates two materially different cases:

| Input                                              | Release behavior                                                                                            | Atlas decision                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Built-in pinned `registry://` descriptor           | The source string is matched against QVAC's generated registry catalog; catalog size/hash drive validation. | Byte validation is useful, but SDK-managed storage is not acceptable for the issuer. |
| Canonical absolute local path string               | Treated as a filesystem source and passed to the addon after existence checking.                            | Supported input for an Atlas-staged, Atlas-verified GGUF.                            |
| Relative local path string                         | Explicitly documented and accepted, but resolution depends on the worker/process context.                   | Do not use; canonicalize before granting.                                            |
| Descriptor containing a local `src` plus size/hash | Size/hash are removed by the client transform; local resolution does not validate them.                     | Do not rely on descriptor metadata.                                                  |
| `file://` URL                                      | Not documented and has no URL-decoding branch. It falls through as a filesystem-looking string.             | Unsupported; never grant a file URL.                                                 |

QVAC documents absolute and relative local paths in the public
[`loadModel` API](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/api/load-model.ts#L69-L109).
The resolver handles only `registry://`, HTTP(S), and `pear://` specially, then
passes strings containing a path separator through as filesystem paths; see
[`resolveModelPathCore`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/resolve.ts#L118-L238).
The Bare load path checks that the file's basename is present in its directory but
does not hash local files; see
[`loadModel`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/ops/load-model.ts#L58-L95).

**SOURCE INFERENCE.** A canonical absolute GGUF path is the least ambiguous public
way to load preverified local bytes. Atlas, not QVAC, must enforce containment,
regular-file status, size, and SHA-256 for this path.

**UNKNOWN.** Runtime acceptance of `file://` is not established. The tagged source
does not convert file URLs to operating-system paths, so source support must not be
claimed.

## Download and cache destinations

### Model artifact cache

**SOURCE FACT.** `cacheDirectory` is the public QVAC configuration field for the
model cache. It is documented as an absolute directory and defaults to
`~/.qvac/models`; configuration is loaded once and is immutable. See the
[`qvacConfigSchema`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/sdk-config.ts#L87-L102).

The worker requires an absolute, writable value, creates the directory, and writes
then removes `.qvac-test` before accepting it. Otherwise it uses the default. See
[`setSDKConfig` and `getConfiguredCacheDir`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/registry/config-registry.ts#L27-L63)
and the
[default selection](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/registry/config-registry.ts#L109-L119).

For a single registry file, the destination is:

```text
<cacheDirectory>/<first-16-hex-of-SHA256(registryPath)>_<source-filename>
```

The filename rule is implemented by
[`getSingleFileCachePath`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/cache/paths.ts#L97-L104)
and the prefix algorithm by
[`generateShortHash`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/formatting.ts#L4-L10).
For the pinned artifact, that filename is
`8ee81e589ce1440c_smollm2-360m-instruct-q8_0.gguf`.

### Registry metadata cache

**SOURCE FACT.** `cacheDirectory` does not control every cache created by a
registry load. Registry-client metadata/core data uses
`<HOME_DIR>/.qvac/registry-corestore/<default-core-key>` through `getCacheDir`,
which ignores `getConfiguredCacheDir`. See the registry client
[`storage` construction](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/registry/registry-client.ts#L45-L73),
[`getCacheDir`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/cache/paths.ts#L15-L26),
and [`getQvacPath`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/qvac-paths.ts#L1-L6).

**SOURCE FACT.** On Node, QVAC can obtain config from `QVAC_CONFIG_PATH`, a packaged
JSON config, a `qvac.config.*` under the project root, or defaults. JavaScript and
TypeScript config forms execute code; JSON is parsed as data. See
[`resolveConfig`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/config-loader/resolve-config.node.ts#L208-L249)
and the
[format loaders](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/config-loader/resolve-config.node.ts#L56-L133).

**SOURCE FACT.** If the worker rejects configuration, the client catches and logs
the error rather than rethrowing it to the public caller. See
[`initializeConfig`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/init-hooks.ts#L61-L88).

**Atlas boundary consequence.** The current sanitized launcher removes
`QVAC_CONFIG_PATH`, starts from a cwd whose ancestors contain no QVAC config, and
does not execute contributor config. It therefore cannot currently prove that an
Atlas-private model cache override was applied. A future narrowly authorized
change could create an Atlas-owned `qvac.config.json` after the clean-cwd check and
before SDK import, but QVAC 0.16.0 still supplies no fail-closed acknowledgement and
still writes registry metadata outside `cacheDirectory`. See Atlas's
[SDK resolver boundary](../architecture/sdk-resolver.md#child-launch-and-bootstrap).

**UNKNOWN.** The allowed QVAC source does not establish a public setting that moves
both the model cache and registry corestore under one Atlas-private root. Bare's
general environment and working-directory inheritance is also not established by
this source set.

## Size, hash, corruption, and partial downloads

### Pinned `registry://` path

**SOURCE FACT.** Registry resolution extracts the path, looks it up in the built-in
catalog, and forwards the catalog checksum and metadata into the registry download.
See
[`resolveModelPathCore`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/resolve.ts#L151-L180)
and the exact-match
[`getModelByPath`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/models/registry/models.ts#L24230-L24238).

For a cached file, QVAC:

1. checks access and size;
2. streams SHA-256 when a 64-character expected checksum exists;
3. returns the path only after both match; and
4. deletes a size-mismatched or checksum-mismatched file so the caller downloads
   again.

These behaviors are implemented in
[`validateCachedFile`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/registry-download-utils.ts#L38-L80).
The checksum function streams the file and returns lowercase hex; see
[`calculateFileChecksum`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/checksum.ts#L7-L29).

For a fresh registry download, the registry client writes to the final model path.
After it returns, QVAC stats the file, deletes and rejects a size mismatch, then
hashes, deletes, and rejects a checksum mismatch. See
[`downloadSingleFileFromRegistry`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/registry-download-utils.ts#L88-L167).

**SOURCE FACT.** Cancellation preserves a partial final-path file unless the
request's clear-cache state is set. A later attempt validates the partial file,
deletes it on size/hash mismatch, and redownloads. See the
[`registry download handler`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/registry.ts#L379-L443).

**SOURCE INFERENCE.** The pinned built-in registry descriptor gets meaningful size
and SHA-256 validation despite the public descriptor-to-string transform because
the exact registry path selects QVAC's generated metadata. An arbitrary descriptor
whose only trust data is its client-side `expectedSize` or `sha256Checksum` does
not retain that protection across the standard public call.

For the exact built-in source, **every cache-resolution attempt** calls
`validateCachedFile` before returning a cached path, so this is not a one-time
download check. The qualification matters: it is not a re-hash at the instant the
addon opens the file, and reuse of an already loaded in-memory model is not another
cache-resolution event.

**SOURCE INFERENCE.** The wrapper does not stage to a temporary filename and
atomically rename after verification. A partial file can therefore exist at the
final cache path, although the normal next load rejects it before use.

### HTTP and local paths

**SOURCE FACT.** Local-path resolution performs no size or checksum validation.
The public descriptor checksum cannot repair that because the client strips it.

**SOURCE FACT.** Direct QVAC HTTP cache validation compares the local file with an
HTTP `Content-Length`. If HEAD fails, it can accept a cached file based only on a
valid GGUF header. The HTTP path resumes partial files and contains no SHA-256
comparison analogous to the registry path. See HTTP
[`validateCachedFile`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/http.ts#L72-L135)
and
[`downloadModelFromHttp`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/http.ts#L627-L738).

**SOURCE INFERENCE.** Atlas must not replace `registry://` with a direct QVAC HTTP
load and assume equivalent pinning. The registry validation above is the proven
hash-aware path. The minimum safe alternative is for Atlas to acquire the immutable
official artifact itself, verify the pinned size and SHA-256, and invoke QVAC with
the verified local path.

## Import and heartbeat side effects

| Boundary      | SOURCE FACT                                                                                                                                                                                                                                              | SOURCE INFERENCE                                                                                                                          | UNKNOWN                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| SDK import    | The Node module resolves/checks worker paths and registers process termination handlers; it does not call `ensureRPC` merely by being imported.                                                                                                          | The tagged QVAC call graph does not create a worker, model cache, registry client, or QVAC network connection on import alone.            | Side effects inside transitive native/runtime imports are not exhaustively proven without executing the published package. |
| `heartbeat()` | The public API sends a local RPC; `ensureRPC` creates a local IPC socket, spawns Bare, and initializes config. Worker startup writes `<HOME_DIR>/.qvac/.worker.lock`; accepted `cacheDirectory` config creates the directory and transient `.qvac-test`. | Local heartbeat itself does not initialize the lazy registry client or download a model; its server handler only returns a random number. | Absence of every possible native/dependency network side effect is not proven by this QVAC-only source audit.              |

Sources:

- [Module-time worker-path resolution](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/rpc/node-rpc-client.ts#L42-L153)
  and
  [termination-handler registration](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/rpc/node-rpc-client.ts#L581-L590).
- [`heartbeat()`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/api/heartbeat.ts#L6-L41)
  and its
  [server handler](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/heartbeat.ts#L1-L5).
- [`ensureRPC` worker spawn and config initialization](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/rpc/node-rpc-client.ts#L350-L488).
- [Worker initialization and lock acquisition](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/worker-core.ts#L60-L79)
  and
  [worker-lock writes](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/worker-lock.ts#L39-L83).
- The registry client is created lazily only when
  [`getRegistryClient`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/registry/registry-client.ts#L98-L116)
  is called by registry download.

## Descriptor-to-byte binding

**SOURCE FACT.** The returned `modelId` is the first 16 hex characters of a hash of
model type, source string, and canonical model config. It is not a hash of model
bytes. The resolved filesystem path is passed separately into the Bare loader. See
the
[`loadModel` handler](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/handler.ts#L124-L172).

**SOURCE FACT.** A successfully registered local model retains its resolved path,
and the public `getLoadedModelInfo({ modelId })` response can return that path. See
the
[`LoadedModelInfo` schema](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/schemas/get-loaded-model-info.ts#L16-L54)
and
[`handleGetLoadedModelInfo`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/get-loaded-model-info.ts#L14-L61).

**SOURCE INFERENCE.** For the pinned registry source, the source string binds to
QVAC's catalog metadata and QVAC verifies the file found at the resulting cache
path. It does not bind the returned model ID to a content digest.

**SOURCE INFERENCE.** Verification and addon open are separate path operations.
QVAC exposes neither an already-verified file descriptor nor a byte-digest receipt
from the addon. Pre-hash, exact loaded-path comparison, and post-hash reduce the
risk only when Atlas owns a private directory with no other writer. They detect
many mutations; they do not provide atomic or cryptographic byte binding.

**UNKNOWN.** The tagged public API cannot establish exactly which bytes a native
addon consumed if another actor can replace or mutate the path between checks.

### Permissions and symlinks

**SOURCE FACT.** QVAC creates configured/cache directories with recursive
`mkdirSync` and no explicit permission mode. Its configured-cache test writes a
normal `.qvac-test` file. The effective directory and file permissions therefore
are not an owner-only invariant established by QVAC source. See
[`setSDKConfig`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/registry/config-registry.ts#L42-L63)
and
[`getModelsCacheDir`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/utils/cache/paths.ts#L29-L42).

**SOURCE FACT.** Local resolution does not call `realpath` or `lstat`, reject a
symlink, or retain an open file handle. Cached validation uses access, stat, and a
path-based read stream, all of which operate through the named path. The Bare load
check only requires the basename to appear in the containing directory. The
relevant implementations are
[`resolveModelPathCore`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/resolve.ts#L223-L238),
[`validateCachedFile`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/registry-download-utils.ts#L41-L80),
and the
[`Bare load check`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/ops/load-model.ts#L78-L95).

**SOURCE INFERENCE.** QVAC alone does not protect a local or cached path from
symlink substitution or a same-size mutation by another writer between hash and
open. Atlas must create and verify the private directory/file permissions, reject
symlinks at every path component, repeat canonical containment immediately before
granting, and keep the directory unavailable to other writers. Owner-only mode
such as `0700` directory/`0600` file is an Atlas POSIX design requirement, not a
QVAC guarantee; other platforms need an equivalent verified ACL policy.

**UNKNOWN.** Filesystem race freedom cannot be proven from pathname checks alone.
QVAC exposes no public descriptor/handle-based load API that would close this race.

## Failure and cleanup

**SOURCE FACT.** The Bare loader creates the plugin model and awaits
`model.load(false)`, then registers the model only after that promise succeeds. Its
`finally` block stops log buffering; it does not unload or destroy an object whose
load partially initialized and then rejected. See
[`loadModel`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/ops/load-model.ts#L98-L129).

**SOURCE FACT.** Addon load has no abort signal. If cancellation arrives during a
successful load, QVAC deliberately rejects the public request after the model has
been registered, documenting an orphan-model edge case. See the
[`loadModel` phase boundary](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/rpc/handlers/load-model/handler.ts#L124-L184).

**SOURCE FACT.** Public unload unregisters first and only then awaits the addon's
`unload`; if unload throws, that registry entry is already unavailable to a later
bulk cleanup. `clearStorage: false` preserves the artifact. See
[`unloadModel`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/bare/ops/unload-model.ts#L14-L52).
Worker shutdown attempts to unload all still-registered models and close registry,
download, and swarm resources; see
[`runCleanup`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/worker-core.ts#L123-L155).

**SOURCE FACT.** Node `close()` sends `SIGTERM` to the Bare worker and closes local
IPC, but its returned promise does not wait for the Bare process to emit exit. The
Bare worker has its own cleanup/forced-exit path. See
[`close()`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/rpc/node-rpc-client.ts#L533-L579)
and
[`shutdownBareDirectWorker`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/worker-core.ts#L187-L220).

**SOURCE INFERENCE.** A production lifecycle must attempt
`unloadModel({ modelId, clearStorage: false })` whenever a model ID was returned,
then always call `close()`. After a load rejection, it must call `close()`
immediately. In every case, the outer Atlas supervisor remains responsible for a
deadline and verified descendant termination because public cleanup does not cover
an unregistered partially loaded object and `close()` does not await worker exit.

**UNKNOWN.** The QVAC release source does not guarantee cleanup of native resources
created before `model.load(false)` rejects.

## Bare worker inheritance

**SOURCE FACT.** QVAC invokes `bare-runtime/spawn` with worker arguments, platform,
architecture, and stdio. It explicitly passes the IPC socket path and a `HOME_DIR`
chosen from `SNAP_USER_COMMON` or `os.homedir()`. The call does not explicitly pass
an environment object, cwd, detached flag, uid, or gid. See the
[`spawn` call](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/client/rpc/node-rpc-client.ts#L397-L419).
The Bare worker parses that JSON argument and merges validated `HOME_DIR` and socket
data over `bare-env`; see
[`initEnv`](https://github.com/tetherto/qvac/blob/034d3158daf39b247a79e89e2cd90599a070960d/packages/sdk/server/env.ts#L18-L57).

**UNKNOWN.** General environment, cwd, file-descriptor, signal, session, and process-
group inheritance are properties of `bare-runtime/spawn`, not established by the
allowed QVAC source. The tagged QVAC call therefore cannot prove that Bare remains
in Atlas's outer process group or that changing the Node child's environment safely
relocates all Bare state. Atlas must retain explicit descendant/process-tree
supervision and verify it on each supported operating system.

## Minimum production grant contract

The issuer should grant only this internal capability:

```text
{
  canonicalPath: <private regular file>,
  expectedSize: 386404992,
  expectedSha256: 48ab3034...2001,
  sourceRevision: 593b5a2e...ad47f
}
```

It must implement the following fail-closed sequence:

1. Before network activity, disclose exact size, license, immutable source,
   destination/cache behavior, and obtain explicit download consent.
2. Download with Atlas-owned code into a new private temporary file under an
   Atlas-private directory. Do not use QVAC `registry://`, QVAC HTTP download, the
   user's QVAC cache, or contributor config.
3. Bound bytes, require exactly `386404992`, stream SHA-256, compare exactly, then
   publish the file inside that private directory with an atomic same-filesystem
   rename. Keep the directory private and quiescent for the lifecycle.
4. Re-resolve and revalidate containment, regular-file status, size, and hash
   immediately before issuing the grant. Pass only the canonical absolute path to
   QVAC; do not pass a local descriptor or `file://` URL.
5. After `loadModel` returns, call `getLoadedModelInfo` inside the executor. Require
   a local model and an exact canonical-path match. Never serialize that path.
6. Run inference. Retain the internal path long enough to unload with
   `clearStorage: false`, then recompute size/hash. Any mismatch makes the lifecycle
   non-claim-producing.
7. Always call QVAC `close()`, enforce the outer deadline/process-tree cleanup, and
   report only fixed, path-free phase evidence.

This contract is **NARROW**, not **GO**, because it depends on a quiescent private
path between verification and native open and because native partial-load cleanup
is not source-guaranteed. If Atlas cannot own and isolate the artifact path, or if a
platform cannot prove descendant termination, the production model grant is
**BLOCKED** on that platform.
