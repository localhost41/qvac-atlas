# ATLAS-035 — Authorized fixture-only community launch

Status: local candidate verified; independent review and external gates in progress

## Objective

Execute the five owner-approved launch steps for QVAC Atlas `0.1.0`: finalize the
Apache-2.0 release identity, bind repository ownership, create and protect the
public GitHub host, publish the exact audited npm artifact, deploy the reviewed
GitHub Pages site, create the `v0.1.0` release, and send the prepared GitHub and
Discord announcements.

## Human authorization

On 2026-08-01, the project owner:

- selected the recommended Apache-2.0 code license;
- named GitHub user `@localhost41` for the primary, evidence, and security owner
  roles;
- authorized creation of the public `localhost41/qvac-atlas` repository;
- authorized publication of the exact reviewed `qvac-atlas@0.1.0` npm artifact;
- authorized GitHub Pages deployment, the `v0.1.0` tag/release, and the prepared
  GitHub and Discord announcements; and
- directed the launch to skip a new physical gate, preserving fixture-only scope.

The independent Pages reviewer is a different human and must supply their GitHub
login before the protected deployment environment can be configured. The npm
publisher must authenticate locally before registry publication. The Discord
server/channel must be named before the announcement is sent.

## Frozen boundaries

- The shipped real-mode gate remains literal `false`.
- ATLAS-013 remains `rerun required`; the earlier private physical attempt remains
  `STOP / MANUAL REVIEW` and is not launch evidence.
- Production profiles, genuine reports, production claims, and uploads remain
  empty or disabled.
- The launch may describe only a fixture-only developer preview and must not imply
  demonstrated community hardware compatibility.
- Only the exact package bytes that pass local audit, clean-room installation, and
  independent review may be published.
- Public-host protection verification must pass before npm publication, Pages
  deployment, release creation, or announcements.
- Pages deployment requires approval by the named independent reviewer, not the
  author or release captain.

## Execution sequence

1. Apply Apache-2.0, concrete owner identities, and canonical public repository
   metadata; update package-content policy and launch copy.
2. Run the complete local readiness suite, recreate the deterministic package,
   test it in a clean non-workspace project, and record new exact size/digest.
3. Obtain independent architecture/security and operations/release review of the
   exact candidate.
4. Fast-forward the reviewed candidate to `main`, create the public repository,
   push the exact commit, configure and mechanically verify host protections.
5. Publish the exact audited tarball, deploy Pages through independent approval,
   create the annotated `v0.1.0` release with checksums, and send only the reviewed
   fixture-only announcements.

## Allowed paths

- `LICENSE`
- `.github/CODEOWNERS`
- `README.md`
- `package.json`
- `packages/cli/**`
- `scripts/package-*.mjs`
- `scripts/readiness.test.mjs`
- `scripts/verify-host-protection.mjs`
- `scripts/host-protection.test.mjs`
- `docs/**`
- `.artifacts/qvac-atlas-0.1.0.tgz` (generated, ignored release artifact)

Other paths may change only when an exact host-generated value or a failing
acceptance check proves the need and the change is recorded here first.

## Exit criteria

- Repository and public CLI package are Apache-2.0 with consistent notices and
  canonical `localhost41/qvac-atlas` metadata.
- All owner placeholders are replaced without weakening independent deployment
  review.
- A fresh deterministic artifact passes audit, offline clean-room install, the
  complete suite, and independent exact-commit review.
- Public-host protections pass `verify-host-protection.mjs` for the exact release
  commit.
- npm metadata and downloaded bytes match the locally reviewed package.
- The Pages deployment and `v0.1.0` release resolve publicly from the reviewed
  commit and artifact.
- Announcements are sent only after all prior checks pass and truthfully identify
  the release as a fixture-only developer preview.

## Blocked-action protocol

If a required human identity, authentication session, independent approval, or
announcement destination is unavailable, stop before that external action, retain
the reviewed candidate, and report the exact missing value or command. Do not
substitute the release captain for independent review and do not publish a nearby
artifact.

## 2026-08-01 candidate checkpoint

The package-source commit is
`6db47361d01da9ae61724a20386708f8f4e93db7`. Its deterministic 122,278-byte
artifact has SHA-256
`dec3ab4e41ec262396232a796ecb5ff772de008b4807bc90988f6e776afb4a2c` and passed
the full suite plus a no-local clean-room recreation. The complete evidence and
current external blockers are recorded in
`docs/reviews/ATLAS-035-public-launch.md`.

Initial independent review held launch because reviewer independence was not
mechanically enforced. The parser, verifier, bootstrap runbook, and regression
tests now reject the repository owner as reviewer case-insensitively. The reviewer
login is also required as a co-owner before freeze so owner-authored future pull
requests do not deadlock under mandatory code-owner approval.
