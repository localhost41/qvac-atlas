# Runtime feasibility spike

This spike proves the Atlas-owned isolation boundary without installing QVAC or
downloading a model automatically.

Run the isolation checks:

```bash
node --test spikes/runtime/isolation-supervisor.test.mjs
```

If `@qvac/sdk@0.16.0` and its native dependencies are already installed in the
current project, run the controlled QVAC lifecycle probe with:

```bash
ATLAS_SPIKE_TIMEOUT_MS=180000 node spikes/runtime/run-qvac-smoke.mjs
```

The QVAC runner requests GPU execution, starts the public SDK worker with
`heartbeat()`, loads the pinned `SMOLLM2_360M_INST_Q8` descriptor, produces at
most eight tokens, records `CompletionFinal.stats.backendDevice`, unloads the
model without clearing its cache, and calls the public `close()` API.

The first model load may download 386,404,992 bytes. Nothing is uploaded. Do not
run it without first reviewing `model-candidate.json`, confirming sufficient
disk space, and accepting the model's Apache-2.0 license.

The supervisor's stdout/stderr tails are local debugging material. They are not
safe report fields and must not be copied into a public Atlas report.
