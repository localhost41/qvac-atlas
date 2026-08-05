# Anonymous relay operations

The Atlas relay is a narrow Node 22 ingress to one private GitHub review queue. It
has no contributor accounts, service database, public-registry credential,
telemetry, request-body log, background retry, or publication authority.

## Deployment boundary

The reference deployment is exactly one `@qvac-atlas/submission-relay` process on
exact Node major 22. Its in-process admission serialization makes the configured
queue cap fail closed across concurrent requests, and its capacity check counts
both open pull requests and partial queue refs. Do not horizontally scale or run a
second process without adding and independently reviewing a distributed admission
lock. Build and test it from a frozen checkout:

```text
pnpm install --frozen-lockfile
pnpm --filter @qvac-atlas/submission-relay test
pnpm --filter @qvac-atlas/submission-relay build
```

The host must run as a non-root identity with a read-only application filesystem,
no persistent volume, no shell exposed to the network, and egress restricted to
`api.github.com:443`. Terminate TLS before the Node process and preserve the exact
public `Host` value. The application accepts only `POST /v1/submissions` and fixed
`GET /healthz`.

The edge must enforce all of these before deployment is acknowledged:

- TLS and HSTS for the exact public origin;
- a 65,536-byte request-body cap, short header/body timeouts, and no compression;
- global and short-window per-network rate limiting with a fixed queue-cap alert;
- a concurrent-request cap no greater than the configured application cap;
- no request/response body capture and no forwarding of cookies, authorization,
  client-address, or tracing headers to the application;
- documented minimal security-log retention, with network identifiers redacted or
  removed as early as the host permits.

Rate limiting without accounts or a database is best-effort abuse resistance, not
exact identity or accounting. If the edge controls are absent or unavailable, take
the relay out of service. Set `ATLAS_HOST_ABUSE_CONTROLS` only after the independent
host reviewer verifies those controls; the environment value is an assertion, not
proof by itself.

## Private GitHub queue and App

Create a dedicated private repository with an initial protected `main` branch. It
must contain no public-registry checkout or secret. Record its immutable numeric
repository ID, owner, name, and base branch.

Register a GitHub App with only:

- Metadata: read;
- Contents: read and write;
- Pull requests: read and write.

Install it on exactly that private queue repository. Do not install it on
`localhost41/qvac-atlas`, an organization, or “all repositories.” The relay mints
short-lived installation tokens narrowed again to the configured repository and
permissions. Before listening and before every queue operation it verifies the
exact numeric repository ID, full name, private visibility, default branch,
non-archived/non-disabled state, and push capability.

Provide secrets through the host's secret manager only:

| Variable | Contract |
| --- | --- |
| `ATLAS_RELAY_ORIGIN` | Exact reviewed HTTPS origin; no path/query/fragment |
| `ATLAS_RELAY_LISTEN_HOST` | `0.0.0.0` behind the edge, or `127.0.0.1` locally |
| `PORT` | Host-assigned port, 1–65535 |
| `ATLAS_RELAY_MAX_CONCURRENT` | 1–32; normally 4 |
| `ATLAS_HOST_ABUSE_CONTROLS` | Exact reviewed acknowledgement from `config.ts` |
| `ATLAS_QUEUE_OWNER` | Exact private repository owner |
| `ATLAS_QUEUE_REPOSITORY` | Exact private repository name |
| `ATLAS_QUEUE_REPOSITORY_ID` | Immutable numeric repository ID |
| `ATLAS_QUEUE_BASE_BRANCH` | Protected default branch, normally `main` |
| `ATLAS_QUEUE_MAX_PENDING` | Fail-closed open-queue cap, 1–100 |
| `ATLAS_GITHUB_APP_ID` | Numeric App ID |
| `ATLAS_GITHUB_INSTALLATION_ID` | Numeric installation ID |
| `ATLAS_GITHUB_APP_PRIVATE_KEY_BASE64` | Canonical base64 of the RSA PEM secret |

Start only after the build and read-only GitHub readiness check pass:

```text
pnpm --filter @qvac-atlas/submission-relay start
```

Startup emits only one fixed readiness line. A failure emits one fixed error line.
Do not add exception, request, report, token, path, address, or GitHub-response
logging.

## Queue behavior and idempotency

The report ID determines one path, branch, and receipt:

```text
submissions/v1/sha256-<digest>.json
atlas-anonymous/sha256-<digest>
sha256:<digest>
```

The App creates a blob, a tree based on the current queue base, and a one-parent
commit, then atomically creates the deterministic ref. It never overwrites or
force-pushes. A race loser or explicit user replay must byte-verify that the
existing commit differs from its parent by exactly one `100644` report file. It
then reconciles a missing draft PR. Open, closed, merged, and deleted-head PR states
all converge on the same receipt. A timeout after the request begins is reported as
an unknown outcome; neither client nor relay retries automatically.

## Review, retention, and promotion

Review queue items within 30 days using
[`maintainer-admission.md`](../contributing/maintainer-admission.md). Queue
acceptance is not public evidence. Rejected items get a fixed reason code, a closed
PR, and branch-ref deletion scheduled within 30 days. GitHub may retain commits,
PR metadata, or backups after ref deletion; do not promise erasure. A privacy
incident may require taking the relay offline, revoking the App key, deleting and
recreating the private queue, and contacting GitHub.

Accepted bytes are transferred through a separate maintainer-owned public PR and
must use `unverified-anonymous` plus `source:anonymous-relay`. Only protected public
CI and human review can publish them. The relay App must remain technically unable
to perform that promotion.

## Activation and rollback

The released CLI keeps `REVIEWED_ANONYMOUS_RELAY_ORIGIN` equal to literal `null`.
After deployment, an independent reviewer must verify the edge controls, GitHub App
installation scope, private repository ID/visibility, secret handling, log policy,
timeouts, health behavior, and a fake-report end-to-end test. Activation is a
separate source change that pins the exact HTTPS origin in a new package version,
repeats the package/clean-room/privacy reviews, and does not change the literal
real-probe gate. Never rebuild or publish `0.2.0` with different enabled-origin
bytes.

To roll back, first set the edge to fixed `503`, then revoke the App installation
token/key, stop the process, and return the CLI origin to `null` in a reviewed
release. Preserve private queue state for incident review unless removal is the
incident response itself.
