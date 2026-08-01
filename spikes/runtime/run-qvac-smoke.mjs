import { fileURLToPath } from 'node:url'

import { runIsolated } from './isolation-supervisor.mjs'

const runner = fileURLToPath(new URL('./qvac-smoke-runner.mjs', import.meta.url))
const timeoutMs = Number.parseInt(process.env.ATLAS_SPIKE_TIMEOUT_MS ?? '180000', 10)
const result = await runIsolated({ entryPath: runner, timeoutMs })

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result.outcome !== 'success') process.exitCode = 1
