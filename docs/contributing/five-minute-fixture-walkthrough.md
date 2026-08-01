# Five-minute fixture-only walkthrough

This walkthrough tests the install and consent experience with synthetic data. It
does **not** run QVAC, inspect hardware, download a model, produce compatibility
evidence, or submit anything.

> **Current boundary:** the package is a local release candidate, real mode is
> disabled, and genuine report submissions are closed. Fixture output must never
> be presented or submitted as hardware evidence.

## 1. Obtain the reviewed local artifact

The release candidate is not published to npm. A maintainer builds it from the
reviewed repository commit with:

```sh
pnpm package:local
```

That command produces `.artifacts/qvac-atlas-0.1.0.tgz`. The maintainer must give
you the artifact through the separately approved private-beta channel together
with its SHA-256. Do not substitute a similarly named download or npm package.

## 2. Install it in a fresh directory

Use Node 22. Replace the placeholder with the absolute path to the reviewed local
artifact:

```sh
mkdir qvac-atlas-fixture-tour
cd qvac-atlas-fixture-tour
npm install --offline --ignore-scripts --no-audit --no-fund --package-lock=false \
  /absolute/path/qvac-atlas-0.1.0.tgz
./node_modules/.bin/qvac-atlas --help
```

The help must say that this build accepts synthetic fixture scenarios only and
that real execution requires separate physical/privacy and activation decisions.
The package has no runtime dependencies and does not install QVAC.

## 3. Create one local synthetic report

Run:

```sh
./node_modules/.bin/qvac-atlas probe \
  --fixture success \
  --output ./atlas-fixture.json
```

Answer the prompts as follows:

1. Fingerprint acknowledgement: **Yes**, after reading the disclosure.
2. Intended for later public submission: **No**.
3. Write the exact JSON locally: **Yes**.

Atlas previews the exact JSON before the publication choice and again before the
write decision. The final message must say that the fixture report was written
locally and nothing was uploaded.

## 4. Verify the boundary

```sh
node --input-type=module -e '
import fs from "node:fs";
const report=JSON.parse(fs.readFileSync("./atlas-fixture.json","utf8"));
if (report.provenance.kind !== "fixture") throw new Error("not-fixture");
if (report.consent.publication !== false) throw new Error("not-private");
if (report.provenance.fixture_id !== "success") throw new Error("wrong-scenario");
console.log("PASS: private synthetic fixture; not compatibility evidence");'
```

Success means only that the local package, prompts, preview, and fixture writer
worked. It says nothing about whether QVAC runs on this computer.

## 5. Submission stops here

There is deliberately no submission command. Do not open a report pull request,
upload the JSON, paste it into an issue or chat, or add it under `reports/v1/`.
Genuine submissions stay closed until a production profile, conforming physical
evidence, named repository ownership, protected review, and maintainer-controlled
admission all exist.

If this is an authorized private beta, return only bounded usability feedback
described in the [private-beta instructions](../launch/private-beta.md). Keep or
remove `atlas-fixture.json` as a deliberate local choice.
