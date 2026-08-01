let sequence = 0
let currentPhase = 'qvac-import'
let sdk
let modelId

function event(message) {
  process.send?.(message)
}

function phase(name, state) {
  currentPhase = name
  event({ type: 'phase', phase: name, state, sequence: sequence++ })
}

function failure(error) {
  event({
    type: 'failure',
    phase: currentPhase,
    errorName: error instanceof Error ? error.name : 'Error',
    errorCode:
      error && typeof error === 'object' && 'code' in error ? String(error.code).slice(0, 80) : undefined
  })
}

try {
  phase('qvac-import', 'started')
  sdk = await import('@qvac/sdk')
  phase('qvac-import', 'succeeded')

  phase('worker-start', 'started')
  await sdk.heartbeat()
  phase('worker-start', 'succeeded')

  phase('model-load', 'started')
  modelId = await sdk.loadModel({
    modelSrc: sdk.SMOLLM2_360M_INST_Q8,
    modelConfig: {
      ctx_size: 512,
      device: 'gpu',
      gpu_layers: 999
    },
    onProgress: () => {}
  })
  phase('model-load', 'succeeded')

  phase('inference', 'started')
  const run = sdk.completion({
    modelId,
    history: [{ role: 'user', content: 'Reply with exactly: atlas' }],
    stream: true,
    generationParams: {
      predict: 8,
      seed: 1,
      temp: 0
    }
  })
  const final = await run.final
  if (final.contentText.trim().length === 0) {
    const error = new Error('Completion returned no content')
    error.name = 'AtlasEmptyCompletionError'
    error.code = 'ATLAS_EMPTY_COMPLETION'
    throw error
  }
  event({
    type: 'observation',
    name: 'backend-device',
    value: final.stats?.backendDevice ?? 'unknown'
  })
  phase('inference', 'succeeded')
} catch (error) {
  phase(currentPhase, 'failed')
  failure(error)
  process.exitCode = 1
} finally {
  phase('clean-shutdown', 'started')
  try {
    if (modelId && sdk?.unloadModel) {
      await sdk.unloadModel({ modelId, clearStorage: false })
    }
    if (sdk?.close) await sdk.close()
    phase('clean-shutdown', 'succeeded')
  } catch (error) {
    phase('clean-shutdown', 'failed')
    failure(error)
    process.exitCode = 1
  }
}
