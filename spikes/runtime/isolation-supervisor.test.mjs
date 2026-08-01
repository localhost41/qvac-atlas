import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { runIsolated } from './isolation-supervisor.mjs'

const mockRunner = fileURLToPath(new URL('./mock-runner.mjs', import.meta.url))

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('captures structured phase and backend observations', async () => {
  const result = await runIsolated({ entryPath: mockRunner, args: ['success'], timeoutMs: 2_000 })

  assert.equal(result.outcome, 'success')
  assert.equal(result.code, 0)
  assert.deepEqual(result.events.at(-2), {
    type: 'observation',
    name: 'backend-device',
    value: 'cpu'
  })
  assert.equal(result.events.at(-1)?.phase, 'inference')
  assert.equal(result.events.at(-1)?.state, 'succeeded')
})

test('turns a child crash into bounded failure evidence', async () => {
  const result = await runIsolated({ entryPath: mockRunner, args: ['crash'], timeoutMs: 2_000 })

  assert.equal(result.outcome, 'failure')
  assert.equal(result.signal, 'SIGKILL')
  assert.deepEqual(result.events[0], {
    type: 'phase',
    phase: 'worker-start',
    state: 'started',
    sequence: 0
  })
})

test('enforces a deadline and terminates the process group', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX process-group assertion; Windows uses taskkill /T /F')
    return
  }

  const result = await runIsolated({
    entryPath: mockRunner,
    args: ['grandchild-hang'],
    timeoutMs: 200,
    terminationGraceMs: 50
  })

  assert.equal(result.outcome, 'timeout')
  const pid = Number.parseInt(/GRANDCHILD_PID=(\d+)/.exec(result.stdoutTail)?.[1] ?? '', 10)
  assert.ok(Number.isSafeInteger(pid), 'mock runner emitted the grandchild pid')

  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(processExists(pid), false, 'the nested process was not orphaned')
})

test('bounds local debug output', async () => {
  const result = await runIsolated({
    entryPath: mockRunner,
    args: ['large-stderr'],
    timeoutMs: 2_000,
    maxOutputBytes: 1_024
  })

  assert.equal(result.outcome, 'failure')
  assert.equal(result.stderrTruncated, true)
  assert.equal(Buffer.byteLength(result.stderrTail), 1_024)
})

test('drops arbitrary IPC and normalizes non-token failure identity', async () => {
  const result = await runIsolated({
    entryPath: mockRunner,
    args: ['invalid-ipc'],
    timeoutMs: 2_000
  })

  assert.equal(result.outcome, 'success')
  assert.deepEqual(result.events, [
    { type: 'failure', phase: 'unknown', errorName: 'Error', errorCode: undefined },
    { type: 'phase', phase: 'inference', state: 'succeeded', sequence: 0 }
  ])
  assert.equal(JSON.stringify(result.events).includes('private'), false)
  assert.equal(JSON.stringify(result.events).includes('secret'), false)
})
