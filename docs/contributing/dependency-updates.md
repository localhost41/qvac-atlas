# Dependency and workflow update policy

Dependency changes are release-security changes. They must remain reviewable,
reproducible, and unable to install QVAC or activate the dormant real path.

## Runtime and package dependencies

- Use Node major 22 and pnpm exactly `11.10.0` as declared by the repository.
- Change manifest constraints and `pnpm-lock.yaml` together through pnpm; do not
  hand-edit resolved versions or integrity hashes.
- Keep the published CLI a bundled zero-runtime-dependency artifact. A new runtime,
  optional, peer, bundled, platform-specific, or install-script dependency changes
  the release contract and requires package-content review.
- Atlas must not declare, install, download, or resolve QVAC as its own dependency.
  The dormant execution path accepts only the already-present exact project-local
  SDK boundary documented in the V1 contract.
- Never add `preinstall`, `install`, `postinstall`, telemetry, automatic update,
  binary-download, or package-publication scripts without a separate security and
  release decision.

For an ordinary update, inspect upstream release notes and provenance, make the
smallest manifest change, regenerate the lockfile with the pinned toolchain, review
all transitive/integrity changes, then run a frozen install and
`pnpm ready:local`. Re-run the local package-content and fresh offline-install audit
for any dependency that can reach the CLI artifact.

QVAC SDK versions, model artifacts, profile pins, hashes, lifecycle behavior, and
claim semantics are not ordinary dependency updates. They require a versioned
architecture, privacy, evidence, and physical-validation decision.

## GitHub Actions

Every third-party `uses:` reference must be an authoritatively verified full
40-character commit SHA. A floating branch, version tag, or shortened SHA is never
accepted, even when an inline comment names the upstream release.

To update an action:

1. identify the intended upstream release from the action's official repository;
2. resolve and independently verify the release tag's peeled commit through the
   authoritative upstream Git object data;
3. review the diff between the current and proposed commits, including bundled
   JavaScript and changed permissions;
4. replace only the immutable SHA and update the human-readable version comment;
5. keep workflow permissions read-only unless the job has a separately reviewed,
   narrowly documented write requirement; and
6. run local readiness and protected CI before merge.

Automated update pull requests may propose changes but must not auto-merge, weaken
CODEOWNERS, bypass current approval, publish packages, deploy, or change branch
protection. Registry and host credentials remain human-controlled external gates.

## Security updates

For a credible vulnerability, the security owner determines exposure without
copying private advisories or exploit payloads into public logs. Prefer the smallest
compatible update. If immediate mitigation changes evidence, privacy, containment,
package contents, or the supported platform, stop release until the relevant
review is repeated. Credential or published-data incidents follow the private
security and history-remediation process rather than an ordinary dependency PR.
