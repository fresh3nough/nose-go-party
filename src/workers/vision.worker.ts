/// <reference lib="webworker" />
/**
 * MediaPipe FaceLandmarker + HandLandmarker off the main thread.
 *
 * WASM is same-origin (/wasm), patched so ModuleFactory + custom_dbg exist on
 * the worker global (required for dynamic import inside a module worker).
 *
 * MediaPipe nulls `self.ModuleFactory` after every successful WASM boot, so we
 * re-seed it before each FaceLandmarker / HandLandmarker createFromOptions call.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision'
import {
  FACE_MODEL_URL,
  FOREHEAD_INDEX,
  HAND_MODEL_URL,
  INDEX_TIP_INDEX,
  NOSE_TIP_INDEX,
  THUMB_TIP_INDEX,
  WASM_BASE_URL,
  WRIST_INDEX,
} from '../lib/constants'
import { associateHandsToFaces, assignPlayers } from '../lib/players'
import type {
  BoundingBox,
  HandLandmarks,
  Point2D,
  WorkerInMessage,
  WorkerOutMessage,
} from '../lib/types'

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

declare const self: DedicatedWorkerGlobalScope & {
  ModuleFactory?: unknown
  custom_dbg?: (...args: unknown[]) => void
  dbg?: (...args: unknown[]) => void
}

let faceLandmarker: FaceLandmarker | null = null
let handLandmarker: HandLandmarker | null = null
let busy = false
let wasmImportGeneration = 0

function post(msg: WorkerOutMessage) {
  self.postMessage(msg)
}

function lmToPoint(lm: { x: number; y: number }, mirror: boolean): Point2D {
  return {
    x: mirror ? 1 - lm.x : lm.x,
    y: lm.y,
  }
}

/** Absolute WASM directory URL for FilesetResolver. */
function resolveWasmBase(): string {
  if (/^https?:\/\//i.test(WASM_BASE_URL)) {
    return WASM_BASE_URL.replace(/\/$/, '')
  }
  const origin = self.location?.origin ?? ''
  const path = WASM_BASE_URL.startsWith('/') ? WASM_BASE_URL : `/${WASM_BASE_URL}`
  return `${origin}${path}`.replace(/\/$/, '')
}

/** Always-available debug hooks used by the Emscripten glue in strict mode. */
function installDebugGlobals() {
  if (typeof self.custom_dbg !== 'function') {
    self.custom_dbg = (...args: unknown[]) => {
      try {
        console.warn(...args)
      } catch {
        /* ignore */
      }
    }
  }
  if (typeof self.dbg !== 'function') {
    self.dbg = self.custom_dbg
  }
}

/**
 * Ensure ModuleFactory is present. MediaPipe clears it after each factory use,
 * so this must run before every createFromOptions.
 */
async function ensureModuleFactory(wasmBase: string): Promise<void> {
  installDebugGlobals()
  if (typeof self.ModuleFactory === 'function') {
    return
  }

  wasmImportGeneration += 1
  // Query bust forces a fresh module evaluation so UMD side effects re-run.
  const url = `${wasmBase}/vision_wasm_internal.js?v=${wasmImportGeneration}`
  await import(/* @vite-ignore */ url)
  if (typeof self.ModuleFactory !== 'function') {
    throw new Error(`ModuleFactory missing after importing ${url}`)
  }
}

async function createFace(vision: VisionFileset, delegate: 'GPU' | 'CPU') {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL,
      delegate,
    },
    runningMode: 'IMAGE',
    numFaces: 6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

async function createHand(vision: VisionFileset, delegate: 'GPU' | 'CPU') {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate,
    },
    runningMode: 'IMAGE',
    numHands: 12,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

/** Create face+hand for a delegate, re-seeding ModuleFactory before each call. */
async function createPair(wasmBase: string, delegate: 'GPU' | 'CPU') {
  await ensureModuleFactory(wasmBase)
  const vision = await FilesetResolver.forVisionTasks(wasmBase)

  await ensureModuleFactory(wasmBase)
  const face = await createFace(vision, delegate)

  await ensureModuleFactory(wasmBase)
  const hand = await createHand(vision, delegate)

  return { face, hand }
}

async function init() {
  try {
    const wasmBase = resolveWasmBase()
    installDebugGlobals()

    try {
      const gpu = await createPair(wasmBase, 'GPU')
      faceLandmarker = gpu.face
      handLandmarker = gpu.hand
      post({ type: 'READY', delegate: 'GPU' })
      return
    } catch (gpuErr) {
      console.warn('[vision.worker] GPU delegate failed, trying CPU', gpuErr)
      try {
        faceLandmarker?.close()
      } catch {
        /* ignore */
      }
      try {
        handLandmarker?.close()
      } catch {
        /* ignore */
      }
      faceLandmarker = null
      handLandmarker = null
    }

    const cpu = await createPair(wasmBase, 'CPU')
    faceLandmarker = cpu.face
    handLandmarker = cpu.hand
    post({ type: 'READY', delegate: 'CPU' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'ERROR', message: `Vision init failed: ${message}` })
  }
}

function detect(bitmap: ImageBitmap, timestamp: number, mirror: boolean) {
  if (!faceLandmarker || !handLandmarker) {
    bitmap.close()
    return
  }
  if (busy) {
    bitmap.close()
    return
  }
  busy = true
  try {
    const faceResult = faceLandmarker.detect(bitmap)
    const handResult = handLandmarker.detect(bitmap)

    const faces: Array<{
      faceBox: BoundingBox
      noseTip: Point2D
      forehead: Point2D
    }> = []

    const faceLandmarks = faceResult.faceLandmarks ?? []
    for (const lms of faceLandmarks) {
      if (!lms || lms.length === 0) continue
      const nose = lms[NOSE_TIP_INDEX]
      const forehead = lms[FOREHEAD_INDEX] ?? lms[NOSE_TIP_INDEX]
      if (!nose) continue

      let xMin = 1
      let yMin = 1
      let xMax = 0
      let yMax = 0
      for (const p of lms) {
        if (p.x < xMin) xMin = p.x
        if (p.y < yMin) yMin = p.y
        if (p.x > xMax) xMax = p.x
        if (p.y > yMax) yMax = p.y
      }
      const box: BoundingBox = mirror
        ? {
            xMin: 1 - xMax,
            yMin,
            width: xMax - xMin,
            height: yMax - yMin,
          }
        : {
            xMin,
            yMin,
            width: xMax - xMin,
            height: yMax - yMin,
          }

      faces.push({
        faceBox: box,
        noseTip: lmToPoint(nose, mirror),
        forehead: lmToPoint(forehead, mirror),
      })
    }

    const hands: HandLandmarks[] = []
    const handLandmarks = handResult.landmarks ?? []
    for (const lms of handLandmarks) {
      if (!lms || lms.length < 9) continue
      hands.push({
        indexTip: lmToPoint(lms[INDEX_TIP_INDEX], mirror),
        thumbTip: lmToPoint(lms[THUMB_TIP_INDEX], mirror),
        wrist: lmToPoint(lms[WRIST_INDEX], mirror),
      })
    }

    const associated = associateHandsToFaces(faces, hands)
    const persons = assignPlayers(associated)

    post({
      type: 'RESULT',
      result: {
        timestamp,
        persons,
        frameWidth: bitmap.width,
        frameHeight: bitmap.height,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'ERROR', message: `Detect failed: ${message}` })
  } finally {
    bitmap.close()
    busy = false
  }
}

function dispose() {
  faceLandmarker?.close()
  handLandmarker?.close()
  faceLandmarker = null
  handLandmarker = null
}

self.onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data
  switch (msg.type) {
    case 'INIT':
      void init()
      break
    case 'DETECT':
      detect(msg.bitmap, msg.timestamp, msg.mirror)
      break
    case 'DISPOSE':
      dispose()
      break
  }
}
