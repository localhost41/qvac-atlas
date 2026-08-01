# QVAC Atlas CLI

`qvac-atlas@0.1.0` is a fixture-only developer preview. It creates sanitized QVAC
Atlas reports locally and never uploads them.

The candidate is fixture-only. Real QVAC execution is compiled behind a literal
`false` release gate and remains unavailable until the separate physical-device,
privacy, and activation reviews pass. Genuine report submission is also closed.

## Requirements

- Node.js 22
- No global QVAC installation

Atlas does not install QVAC. A future reviewed real probe will resolve only an
already-present, exact project-local QVAC installation from the selected project.

## Installation

After the public `0.1.0` release:

```bash
npm install --ignore-scripts --save-dev qvac-atlas@0.1.0
npx qvac-atlas --help
```

To review an exact local release artifact from a fresh directory:

From a fresh directory, install the reviewed local tarball without running package
scripts:

```bash
npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false /absolute/path/qvac-atlas-0.1.0.tgz
npx --offline qvac-atlas --help
```

The package has no runtime npm dependencies and does not need the Atlas monorepo.
Source, issues, security policy, and exact release notes are maintained at
<https://github.com/localhost41/qvac-atlas>.

## License

Apache-2.0. Third-party attributions are included in `NOTICE`.
