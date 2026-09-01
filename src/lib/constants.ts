/** Model + WASM locations for MediaPipe Tasks Vision. */

/** Face / hand .task models (Google-hosted, versioned independently of the JS SDK). */
export const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * Same-origin WASM bundle copied from node_modules/@mediapipe/tasks-vision/wasm
 * and patched so ModuleFactory is visible on the worker global.
 * Must match the installed @mediapipe/tasks-vision package version.
 */
export const WASM_BASE_URL = '/wasm'

/** @deprecated use WASM_BASE_URL - kept for smoke tests / external docs */
export const WASM_CDN = WASM_BASE_URL

/** MediaPipe face landmark indices */
export const NOSE_TIP_INDEX = 1
/** Approximate top-of-forehead landmark for party-hat anchor */
export const FOREHEAD_INDEX = 10

/** Hand landmark indices */
export const WRIST_INDEX = 0
export const THUMB_TIP_INDEX = 4
export const INDEX_TIP_INDEX = 8

export const PARTY_HAT_SRC = '/party-hat.png'
