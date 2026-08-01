# Support policy

QVAC Atlas currently supports development and review of its fixture-only release
candidate. It does not currently offer public hardware compatibility support,
production report submission, real-mode troubleshooting, package installation,
model download, or a hosted registry.

## Appropriate support requests

After a public repository is explicitly authorized, ordinary questions may use its
GitHub issue or discussion features if maintainers enable them. Appropriate topics
include fixture-only setup, documented schema and catalog behavior, contributor
workflow, and reproducible defects that contain no private data.

Before then, there is intentionally no public support URL or invented maintainer
identity. Keep questions local to the existing project collaboration channel.

## Boundaries

- Atlas is not `qvac doctor`, a repair tool, or a general QVAC support service.
- Atlas never installs QVAC, uploads a report, opens an issue, or submits a pull
  request for the user.
- Genuine report submissions and production-profile admission remain closed.
- V1 real execution is limited to macOS arm64 and remains shipped behind a literal
  `false` gate until the separate physical, privacy, repository, and activation
  decisions pass.
- Do not ask maintainers to infer an exact Metal, CUDA, Vulkan, or OpenCL backend
  from QVAC's observed `cpu|gpu` device class.
- Do not paste reports, logs, prompts, generated output, credentials, paths,
  environment values, or machine identifiers into a support request.

Security or privacy concerns follow [`SECURITY.md`](SECURITY.md), never the public
support path. Report cleanup and withdrawal limits are documented in
[`docs/contributing/privacy-removal-incidents.md`](docs/contributing/privacy-removal-incidents.md).
