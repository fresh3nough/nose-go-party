import { create } from 'zustand'
import type { GamePhase, PersonDetection, Point2D, WinnerInfo } from '../lib/types'
import { GAME_TIMEOUT_MS } from '../lib/types'

interface GameState {
  phase: GamePhase
  persons: PersonDetection[]
  personCount: number
  /** Elapsed active time in ms */
  elapsedMs: number
  winner: WinnerInfo | null
  /** Camera / permission status */
  cameraStatus: 'pending' | 'ready' | 'denied' | 'error'
  cameraError: string | null
  /** Vision worker ready */
  visionReady: boolean
  visionDelegate: 'GPU' | 'CPU' | null
  /** Hand start positions keyed by `${personId}:${handIndex}` captured at GO! */
  handStartPositions: Record<string, Point2D>
  countdownValue: number | 'GO!' | null
  message: string | null

  // Actions
  setCameraStatus: (status: GameState['cameraStatus'], error?: string | null) => void
  setVisionReady: (ready: boolean, delegate?: 'GPU' | 'CPU') => void
  setPersons: (persons: PersonDetection[]) => void
  setMessage: (message: string | null) => void
  pressStart: () => void
  setCountdownValue: (v: number | 'GO!' | null) => void
  beginActive: (handStarts: Record<string, Point2D>) => void
  tick: (elapsedMs: number) => void
  declareWinner: (winner: WinnerInfo) => void
  declareTimeout: () => void
  restart: () => void
}

const initialState = {
  phase: 'IDLE' as GamePhase,
  persons: [] as PersonDetection[],
  personCount: 0,
  elapsedMs: 0,
  winner: null as WinnerInfo | null,
  cameraStatus: 'pending' as const,
  cameraError: null as string | null,
  visionReady: false,
  visionDelegate: null as 'GPU' | 'CPU' | null,
  handStartPositions: {} as Record<string, Point2D>,
  countdownValue: null as number | 'GO!' | null,
  message: null as string | null,
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setCameraStatus: (status, error = null) =>
    set({ cameraStatus: status, cameraError: error ?? null }),

  setVisionReady: (ready, delegate) =>
    set({
      visionReady: ready,
      visionDelegate: delegate ?? get().visionDelegate,
    }),

  setPersons: (persons) => {
    const phase = get().phase
    set({
      persons,
      personCount: persons.length,
      message:
        phase === 'IDLE' && persons.length === 0
          ? 'Step into frame!'
          : get().message === 'Step into frame!' && persons.length > 0
            ? null
            : get().message,
    })
  },

  setMessage: (message) => set({ message }),

  pressStart: () => {
    const { phase, personCount } = get()
    if (phase !== 'IDLE' && phase !== 'READY') return
    if (personCount < 1) return
    set({
      phase: 'COUNTDOWN',
      countdownValue: 3,
      winner: null,
      elapsedMs: 0,
      handStartPositions: {},
      message: null,
    })
  },

  setCountdownValue: (v) => set({ countdownValue: v }),

  beginActive: (handStarts) =>
    set({
      phase: 'ACTIVE',
      countdownValue: null,
      elapsedMs: 0,
      handStartPositions: handStarts,
      message: null,
    }),

  tick: (elapsedMs) => {
    if (get().phase !== 'ACTIVE') return
    if (elapsedMs >= GAME_TIMEOUT_MS) {
      get().declareTimeout()
      return
    }
    set({ elapsedMs })
  },

  declareWinner: (winner) => {
    if (get().phase !== 'ACTIVE') return
    set({
      phase: 'WIN',
      winner,
      elapsedMs: Math.round(winner.timeSeconds * 1000),
      message: null,
    })
  },

  declareTimeout: () => {
    if (get().phase !== 'ACTIVE') return
    set({
      phase: 'TIMEOUT',
      winner: null,
      elapsedMs: GAME_TIMEOUT_MS,
      message: 'Nobody won!',
    })
  },

  restart: () =>
    set({
      phase: 'IDLE',
      elapsedMs: 0,
      winner: null,
      handStartPositions: {},
      countdownValue: null,
      message: get().personCount === 0 ? 'Step into frame!' : null,
      // keep camera + vision + persons
    }),
}))

/** Selectors */
export const selectCanStart = (s: GameState) =>
  (s.phase === 'IDLE' || s.phase === 'READY') &&
  s.personCount >= 1 &&
  s.cameraStatus === 'ready' &&
  s.visionReady
