/// <reference lib="webworker" />
/**
 * MediaPipe FaceLandmarker + HandLandmarker running off the main thread.
 * Tries GPU delegate first, falls back to CPU.
 *
 * WASM assets are served same-origin from /wasm and patched so ModuleFactory
 * is assigned on the worker global (required when the loader is pulled in via
 * dynamic import inside a module worker).
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

declare const self: DedicatedWorkerGlobalScope

let faceLandmarker: FaceLandmarker | null = null
let handLandmarker: HandLandmarker | null = null
let busy = false

function post(msg: WorkerOutMessage) {
  self.postMessage(msg)
}

function lmToPoint(lm: { x: number; y: number }, mirror: boolean): Point2D {
  return {
    x: mirror ? 1 - lm.x : lm.x,
    y: lm.y,
  }
}

/**
 * Resolve WASM base URL to an absolute path the worker can fetch.
 * Relative "/wasm" breaks under some worker base-URI cases.
 */
function resolveWasmBase(): string {
  if (/^https?:\/\//i.test(WASM_BASE_URL)) {
    return WASM_BASE_URL.replace(/\/$/, '')
  }
  const origin = self.location?.origin ?? ''
  const path = WASM_BASE_URL.startsWith('/') ? WASM_BASE_URL : `/${WASM_BASE_URL}`
  return `${origin}${path}`.replace(/\/$/, '')
}

async function createLandmarkers(delegate: 'GPU' | 'CPU') {
  const wasmBase = resolveWasmBase()
  const vision = await FilesetResolver.forVisionTasks(wasmBase)
  const face = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL,
      delegate,
    },
    runningMode: 'IMAGE',
    numFaces: 6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
  const hand = await HandLandmarker.createFromOptions(vision, {
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
  return { face, hand }
}

async function init() {
  try {
    try {
      const gpu = await createLandmarkers('GPU')
      faceLandmarker = gpu.face
      handLandmarker = gpu.hand
      post({ type: 'READY', delegate: 'GPU' })
      return
    } catch (gpuErr) {
      console.warn('[vision.worker] GPU delegate failed, trying CPU', gpuErr)
    }
    const cpu = await createLandmarkers('CPU')
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
