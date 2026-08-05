# ATLAS-036 — Explicit anonymous submission relay

Status: **completed locally; deployment and activation held**

Owner: root with independent architecture and operations review

## Objective

Replace the account-dependent manual GitHub submission step with one accessible,
explicit anonymous action while preserving Atlas's privacy, evidence, and review
boundaries.

## Product contract

1. The probe produces, previews, and writes the same canonical local report as
   before.
2. Only after a successful local write, Atlas shows the exact pinned relay origin
   and asks a separate default-no submission question.
3. `no`, EOF, a disabled endpoint, or a fixture/non-publishable report causes no
   request. Queue ingress has its own source-pinned profile allowlist and does not
   itself require production-profile admission or claim eligibility.
4. `yes` sends only the exact JSON already previewed and written, once, with a
   strict size and time bound. There is no background retry or telemetry.
5. The relay independently validates the request and stores it in a configured
   private GitHub queue using the report ID as the idempotency key.
6. Queue acceptance is not publication. It cannot change the public catalog,
   source metadata, production profiles, or claim state. Maintainer review and
   promotion remain mandatory.

## Trust and privacy boundaries

- Anonymous submissions never count toward independent reproduction, including
  when combined with independently attributed evidence.
- Fixture, preview-only, noncanonical, unpublished, semantically invalid, or
  privacy-invalid reports are rejected before GitHub effects.
- The CLI contains no GitHub credential and accepts no arbitrary upload URL.
- The relay credential is server-only and limited to one private queue repository.
- The application does not persist or log bodies, report contents, client network
  addresses, authorization headers, or credentials.
- Deployment must provide TLS, request-rate limiting, concurrent-request caps, and
  secret management outside the application. Missing controls fail readiness.
- The shipped endpoint remains a literal disabled value until the exact reviewed
  production HTTPS origin is known and separately activated.

## Deliverables

- A small submission client with a source-pinned endpoint policy, exact-body POST,
  timeout, fixed response grammar, and deterministic errors.
- CLI integration at the post-write boundary for real probe reports only.
- A deployable Node 22 relay with strict HTTP admission and a private GitHub queue
  adapter that safely handles duplicates and races.
- Protected `unverified-anonymous` registry metadata whose reports can be
  published as observations but can never multiply source independence.
- Queue contribution documentation and a maintainer promotion runbook.
- Unit, adversarial, integration, local network, bundle-secret, and clean-room
  package tests.
- Independent architecture/security and operations/release verdicts.

## Allowed paths

- `docs/**`
- `packages/submission/**`
- `packages/cli/**`
- `packages/catalog/**`
- `packages/schema/src/claims.js`
- `packages/schema/test/validation.test.js`
- `apps/submission-relay/**`
- `apps/site/**`
- `registry/**`
- `scripts/**`
- `.github/workflows/**`
- workspace manifests and lockfile

Production profile admission, the real-mode release gate, report schema, and
existing genuine reports are out of scope.

## Acceptance criteria

- Decline/EOF/disabled/fixture paths make zero network calls.
- Consent happens after exact preview and local persistence and names the origin.
- Exactly one bounded request contains byte-for-byte canonical report JSON and no
  additional machine data.
- Relay validation rejects malformed methods, paths, media types, oversized or
  noncanonical bodies, fixtures, non-publication consent, report-ID mismatches,
  schema/semantic/privacy failures, and unknown fields without GitHub effects.
- A valid report creates one deterministic private-queue contribution; a replay or
  creation race returns the same opaque submission identity without another item.
- Relay responses and logs do not reflect report contents, GitHub errors, secrets,
  or client identity.
- Missing credential, non-private queue assertion, missing host abuse-control
  assertion, or non-HTTPS production configuration fails readiness before listen.
- Existing tests pass; the package artifact remains locally installable; its bundle
  contains neither a GitHub credential nor an enabled/unreviewed relay origin.
- The hardcoded real-probe gate remains literal `false` and the production profile
  allowlist remains empty.
- `unverified-anonymous` reports never derive or complete an independently
  reproduced claim, whether alone or mixed with independent reports, and are
  visibly labeled on the public site.

## Verification commands

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm package:local
pnpm package:audit -- .artifacts/qvac-atlas-0.2.0.tgz
pnpm ready:local
```
