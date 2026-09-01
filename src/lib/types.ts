/** Shared game / vision types used across main thread and worker. */

export type GamePhase =
  | 'IDLE'
  | 'READY'
  | 'COUNTDOWN'
  | 'ACTIVE'
  | 'WIN'
  | 'TIMEOUT'

export interface Point2D {
  x: number
  y: number
}

export interface BoundingBox {
  xMin: number
  yMin: number
  width: number
  height: number
}

export interface HandLandmarks {
  /** Index fingertip (landmark 8) */
  indexTip: Point2D
  /** Thumb tip (landmark 4) */
  thumbTip: Point2D
  /** Wrist (landmark 0) – useful for travel tracking */
  wrist: Point2D
}

export interface PersonDetection {
  /** Stable id within a single frame batch (index after L->R sort) */
  id: number
  /** 1-based player number after left-to-right assignment */
  playerNumber: number
  faceBox: BoundingBox
  /** Nose tip in normalized [0,1] image coords (pre-mirror) */
  noseTip: Point2D
  /** Forehead approx for party-hat placement */
  forehead: Point2D
  hands: HandLandmarks[]
}

export interface VisionFrameResult {
  timestamp: number
  persons: PersonDetection[]
  /** Width/height of the analyzed frame (for scaling) */
  frameWidth: number
  frameHeight: number
}

export interface WinnerInfo {
  playerNumber: number
  personId: number
  timeSeconds: number
  noseTip: Point2D
  forehead: Point2D
  faceBox: BoundingBox
}

/** Messages main -> worker */
export type WorkerInMessage =
  | { type: 'INIT' }
  | {
      type: 'DETECT'
      /** Transferable ImageBitmap */
      bitmap: ImageBitmap
      timestamp: number
      mirror: boolean
    }
  | { type: 'DISPOSE' }

/** Messages worker -> main */
export type WorkerOutMessage =
  | { type: 'READY'; delegate: 'GPU' | 'CPU' }
  | { type: 'RESULT'; result: VisionFrameResult }
  | { type: 'ERROR'; message: string }

export const MAX_PLAYERS = 6
export const NOSE_TOUCH_THRESHOLD = 0.04
export const ANTI_CHEAT_TRAVEL = 0.15
export const GAME_TIMEOUT_MS = 15_000
export const COUNTDOWN_COLORS = ['#FF006E', '#3A86FF', '#FFBE0B', '#06D6A0'] as const
