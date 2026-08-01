import { fork, spawn } from 'node:child_process'
import { once } from 'node:events'

const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024
const DEFAULT_MAX_EVENTS = 128

class BoundedTail {
  constructor(limit) {
    this.limit = limit
    this.buffer = Buffer.alloc(0)
    this.truncated = false
  }

  append(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const combined = Buffer.concat([this.buffer, incoming])
    if (combined.length > this.limit) {
      this.truncated = true
      this.buffer = combined.subarray(combined.length - this.limit)
      return
    }
    this.buffer = combined
  }

  value() {
    return this.buffer.toString('utf8')
  }
}

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined
}

function boundedToken(value, maxLength, pattern) {
  const candidate = boundedString(value, maxLength)
  return candidate && pattern.test(candidate) ? candidate : undefined
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null

  if (message.type === 'phase') {
    const phase = boundedString(message.phase, 64)
    const state = boundedString(message.state, 16)
    if (!phase || !/^[a-z0-9-]+$/.test(phase)) return null
    if (!['started', 'succeeded', 'failed'].includes(state)) return null
    return {
      type: 'phase',
      phase,
      state,
      sequence: Number.isSafeInteger(message.sequence) ? message.sequence : undefined
    }
  }

  if (message.type === 'observation') {
    const name = boundedToken(message.name, 64, /^[a-z0-9-]+$/)
    const value = boundedToken(message.value, 64, /^[a-z0-9-]+$/)
    if (name !== 'backend-device' || !['cpu', 'gpu', 'unknown'].includes(value)) return null
    return { type: 'observation', name, value }
  }

  if (message.type === 'failure') {
    const phase = boundedToken(message.phase, 64, /^[a-z0-9-]+$/) ?? 'unknown'
    const errorName = boundedToken(message.errorName, 80, /^[A-Za-z][A-Za-z0-9_.-]*$/) ?? 'Error'
    const errorCode = boundedToken(message.errorCode, 80, /^[A-Za-z0-9_.-]+$/)
    return {
      type: 'failure',
      phase,
      errorName,
      errorCode
    }
  }

  return null
}

function safeChildEnvironment(overrides = {}) {
  const inheritedKeys = [
    'HOME',
    'LANG',
    'LC_ALL',
    'PATH',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'windir'
  ]
  const env = {}
  for (const key of inheritedKeys) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  return { ...env, ...overrides }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function terminateProcessTree(child, graceMs) {
  const pid = child.pid
  if (!pid) return

  if (process.platform === 'win32') {
    if (!isAlive(pid)) return
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    })
    await Promise.race([once(killer, 'exit'), delay(graceMs + 1_000)])
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    return
  }
  await delay(graceMs)
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The process group already exited.
  }
}

/**
 * Execute a probe runner in its own process group. IPC carries only a small,
 * allowlisted event vocabulary; stdout and stderr are retained as bounded
 * local debug tails and must not be copied into an Atlas report directly.
 */
export async function runIsolated(options) {
  const {
    entryPath,
    args = [],
    cwd = process.cwd(),
    env = {},
    timeoutMs = 30_000,
    terminationGraceMs = 250,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    maxEvents = DEFAULT_MAX_EVENTS
  } = options

  if (!entryPath) throw new TypeError('entryPath is required')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive integer')
  }

  const child = fork(entryPath, args, {
    cwd,
    detached: process.platform !== 'win32',
    env: safeChildEnvironment(env),
    silent: true,
    serialization: 'json'
  })

  const stdout = new BoundedTail(maxOutputBytes)
  const stderr = new BoundedTail(maxOutputBytes)
  const events = []

  child.stdout?.on('data', (chunk) => stdout.append(chunk))
  child.stderr?.on('data', (chunk) => stderr.append(chunk))
  child.on('message', (message) => {
    const normalized = normalizeMessage(message)
    if (normalized && events.length < maxEvents) events.push(normalized)
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    void terminateProcessTree(child, terminationGraceMs)
  }, timeoutMs)
  timeout.unref()

  const [code, signal] = await once(child, 'exit')
  clearTimeout(timeout)

  // A successful runner is expected to close QVAC itself. On POSIX this final
  // process-group sweep catches a nested Bare worker that survived its Node
  // parent. Windows still needs a durable Job Object; taskkill cannot discover
  // descendants reliably once their root PID is gone.
  await terminateProcessTree(child, timedOut ? 0 : Math.min(terminationGraceMs, 25))

  return {
    outcome: timedOut ? 'timeout' : code === 0 ? 'success' : 'failure',
    code,
    signal,
    timedOut,
    events,
    stdoutTail: stdout.value(),
    stderrTail: stderr.value(),
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated
  }
}
