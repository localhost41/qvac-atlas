# Private-beta instructions

Status: **prepared, not authorized or started**.

This packet is for a future invitation-only, fixture-only evaluation of the local
`qvac-atlas@0.1.0` artifact and static site. It does not authorize package
publication, site deployment, real QVAC execution, model acquisition, report
submission, or a public announcement.

## Roles and entry gates

| Gate | Owner | Action | Acceptance check |
| --- | --- | --- | --- |
| Exact candidate | Release captain | Record the full commit, `.artifacts/qvac-atlas-0.1.0.tgz` SHA-256, Node 22, and pnpm version | Values match the independently reviewed candidate |
| Local readiness | Release reviewer | Run `pnpm install --frozen-lockfile` and `pnpm ready:local` from a fresh checkout | Both exit zero; tree remains clean |
| Distribution | Distribution reviewer | Run `pnpm package:local` and the offline fresh-install audit | Package contents and disabled real gate pass |
| Static site | Site reviewer | Run `pnpm --filter @qvac-atlas/site test` | Root/subpath, fixture separation, evidence, accessibility, and workflow tests pass |
| Invitation | Human beta captain | Name the participants, exact feedback channel, retention period, and artifact-transfer method | Written approval exists before any artifact leaves the release machine |

If any value or approval is missing, the beta does not start. Do not use the old
private physical report, enabled clone, model cache, or terminal transcript as beta
material.

## Participant flow

1. Give the participant only the exact reviewed package artifact, its digest, the
   [five-minute fixture walkthrough](../contributing/five-minute-fixture-walkthrough.md),
   and these boundaries.
2. Ask them to use a fresh directory and Node 22. QVAC is neither needed nor
   installed.
3. They run only `--help` and one `--fixture success` probe, choose **No** for
   publication intent, and keep the result local.
4. If the beta captain separately provides a local static build, browse it only
   from that local directory/server. Do not deploy it or share a URL.
5. Collect bounded usability feedback, not report content.

Allowed feedback:

- whether installation and commands were understandable;
- whether prompts made local-only behavior and fingerprint risk clear;
- whether fixture/non-claim labeling and evidence limitations were clear;
- keyboard, zoom, narrow-screen, contrast, or broken-link observations; and
- the exact step number where the participant stopped.

Do not collect the generated JSON, hardware/software values, paths, usernames,
hostnames, screenshots containing identifiers, terminal history, QVAC logs,
credentials, or model/cache contents.

## Stop conditions

Stop distribution immediately and follow the
[rollback packet](rollback.md) if any participant observes:

- real mode proceeding past the fixed disabled message;
- an install attempting to fetch or install QVAC or another runtime dependency;
- any upload, telemetry, external request, or automatic submission;
- a fixture presented as genuine evidence or a compatibility claim;
- an unexpected local path, identity, credential, or network value in output;
- broken root/subpath navigation, missing evidence limitations, or an inaccessible
  blocking interaction; or
- a package digest, commit, or site artifact that differs from the approved record.

## Exit record

The beta captain records only participant count, bounded feedback, stopped/passed
status, exact candidate digest, and the retention/removal decision. Beta success
does not satisfy ATLAS-013, admit a profile/report, activate real mode, or authorize
external release.
