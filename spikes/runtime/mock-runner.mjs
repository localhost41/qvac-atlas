import { spawn } from 'node:child_process'

let sequence = 0

function phase(name, state) {
  process.send?.({ type: 'phase', phase: name, state, sequence: sequence++ })
}

const mode = process.argv[2] ?? 'success'

if (mode === 'success') {
  phase('qvac-import', 'started')
  phase('qvac-import', 'succeeded')
  phase('worker-start', 'started')
  phase('worker-start', 'succeeded')
  phase('inference', 'started')
  process.send?.({ type: 'observation', name: 'backend-device', value: 'cpu' })
  phase('inference', 'succeeded')
  process.exit(0)
} else if (mode === 'crash') {
  phase('worker-start', 'started')
  process.kill(process.pid, 'SIGKILL')
} else if (mode === 'hang') {
  phase('worker-start', 'started')
  setInterval(() => {}, 10_000)
} else if (mode === 'grandchild-hang') {
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {
    stdio: 'ignore'
  })
  process.stdout.write(`GRANDCHILD_PID=${grandchild.pid}\n`)
  phase('worker-start', 'started')
  setInterval(() => {}, 10_000)
} else if (mode === 'large-stderr') {
  process.stderr.write('x'.repeat(128 * 1024))
  process.exit(2)
} else if (mode === 'invalid-ipc') {
  process.send?.({ type: 'observation', name: 'backend-device', value: '/Users/private/token' })
  process.send?.({ type: 'failure', phase: '/private/path', errorName: 'secret value' })
  process.send?.({ type: 'arbitrary', secret: 'must-not-cross-boundary' })
  phase('inference', 'succeeded')
  process.exit(0)
} else {
  throw new Error(`Unknown mock mode: ${mode}`)
}
