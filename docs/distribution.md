# Local distribution and package audit

QVAC Atlas V1 uses one npm package: `qvac-atlas@0.2.0`, exposing the
`qvac-atlas` binary. The schema, probe, resolver, artifact, and executor workspace
packages remain private implementation units. Bundling them into the CLI is the
smallest supportable topology: an installer receives one zero-dependency artifact,
while the supervised executor and acquisition processes still start from distinct
fixed package-owned entry files.

The project owner approved Apache-2.0, the unscoped npm name, and `@localhost41`
as repository owner. Building and reviewing the `0.2.0` candidate does not itself
authorize an external npm publication. If publication is separately approved,
registry authentication and exact-byte verification remain mandatory; that
authorization would apply only to the exact independently reviewed artifact.

## Build the local artifact

Use Node 22 and the repository-pinned pnpm version after a frozen install:

```bash
pnpm package:local
pnpm package:audit -- .artifacts/qvac-atlas-0.2.0.tgz
```

The first command uses the repository-pinned pnpm version to rebuild four
self-contained runtime entries, copy the two normative JSON Schemas, construct the
tarball in a temporary staging directory, and audit the result. Repeating it from
the same tree must produce the same SHA-256. Audit completes before publication to
the canonical local filename. An identical existing artifact is reused; different
or concurrently created destination bytes are preserved and make the command fail
closed instead of being overwritten.
The artifact allowlist is exactly:

```text
package/package.json
package/README.md
package/LICENSE
package/NOTICE
package/bundle/bin.js
package/bundle/child-runner.js
package/bundle/acquisition-child.js
package/bundle/recovery-child.js
package/schemas/report.schema.json
package/schemas/claim.schema.json
```

The audit rejects any other entry, symlink, runtime dependency, install hook,
workspace reference, unresolved internal import, embedded repository/home path,
missing third-party notice, missing shebang, or unsafe CLI mode. The build also
reads each bundled dependency's installed manifest and fails if its actual version
differs from the exact license inventory checked against the lockfile. The current
validator pin is `ajv@8.18.0`; the known `$data` ReDoS advisory affecting the prior
8.17.1 candidate is absent from the production dependency audit.

## Fresh offline installation

Copy only the tarball to a new directory outside the monorepo, then run:

```bash
npm init --yes
npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false /absolute/path/qvac-atlas-0.2.0.tgz
./node_modules/.bin/qvac-atlas --help
./node_modules/.bin/qvac-atlas probe --real --output should-not-exist.json
```

Help succeeds. The real command exits with the fixed disabled-build message and
does not create the output, even if configuration, environment, stdin, `NODE_PATH`,
or a global QVAC installation tries to enable or satisfy it. Installation has no
network-resolved dependency and does not install QVAC. Fixture probing remains
interactive, local-only, synthetic, and unsuitable as compatibility evidence.
The accountless submission implementation is bundled, but its source-pinned relay
origin remains literal `null` until a separately reviewed HTTPS deployment is
activated. The artifact contains no GitHub App credential or arbitrary endpoint
configuration.
