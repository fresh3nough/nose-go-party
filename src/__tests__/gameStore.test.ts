import { beforeEach, describe, expect, it } from 'vitest'
import type { PersonDetection, WinnerInfo } from '../lib/types'
import { GAME_TIMEOUT_MS } from '../lib/types'
import { selectCanStart, useGameStore } from '../store/gameStore'

const samplePerson = (n = 1): PersonDetection => ({
  id: n - 1,
  playerNumber: n,
  faceBox: { xMin: 0.3, yMin: 0.2, width: 0.2, height: 0.3 },
  trackBox: { xMin: 0.28, yMin: 0.18, width: 0.24, height: 0.34 },
  noseTip: { x: 0.4, y: 0.35 },
  forehead: { x: 0.4, y: 0.22 },
  hands: [],
})

describe('gameStore state machine', () => {
  beforeEach(() => {
    useGameStore.setState({
      phase: 'IDLE',
      persons: [],
      personCount: 0,
      elapsedMs: 0,
      winner: null,
      cameraStatus: 'ready',
      cameraError: null,
      visionReady: true,
      visionDelegate: 'CPU',
      handStartPositions: {},
      countdownValue: null,
      message: null,
    })
  })

  it('starts in IDLE and shows Step into frame when no persons', () => {
    useGameStore.getState().setPersons([])
    expect(useGameStore.getState().phase).toBe('IDLE')
    expect(useGameStore.getState().message).toBe('Step into frame!')
  })

  it('enables START only with >=1 person, camera ready, vision ready', () => {
    expect(selectCanStart(useGameStore.getState())).toBe(false)
    useGameStore.getState().setPersons([samplePerson()])
    expect(selectCanStart(useGameStore.getState())).toBe(true)

    useGameStore.getState().setCameraStatus('denied', 'nope')
    expect(selectCanStart(useGameStore.getState())).toBe(false)
  })

  it('pressStart moves IDLE -> COUNTDOWN when persons present', () => {
    useGameStore.getState().setPersons([samplePerson()])
    useGameStore.getState().pressStart()
    expect(useGameStore.getState().phase).toBe('COUNTDOWN')
    expect(useGameStore.getState().countdownValue).toBe(3)
  })

  it('pressStart is no-op without persons', () => {
    useGameStore.getState().pressStart()
    expect(useGameStore.getState().phase).toBe('IDLE')
  })

  it('beginActive transitions to ACTIVE with hand starts', () => {
    useGameStore.getState().setPersons([samplePerson()])
    useGameStore.getState().pressStart()
    useGameStore.getState().beginActive({ '0:0': { x: 0.1, y: 0.8 } })
    const s = useGameStore.getState()
    expect(s.phase).toBe('ACTIVE')
    expect(s.handStartPositions['0:0']).toEqual({ x: 0.1, y: 0.8 })
    expect(s.elapsedMs).toBe(0)
  })

  it('tick updates elapsed and times out at 15s', () => {
    useGameStore.getState().setPersons([samplePerson()])
    useGameStore.getState().pressStart()
    useGameStore.getState().beginActive({})
    useGameStore.getState().tick(1234)
    expect(useGameStore.getState().elapsedMs).toBe(1234)

    useGameStore.getState().tick(GAME_TIMEOUT_MS)
    const s = useGameStore.getState()
    expect(s.phase).toBe('TIMEOUT')
    expect(s.message).toBe('Nobody won!')
  })

  it('declareWinner freezes timer and stores winner', () => {
    useGameStore.getState().setPersons([samplePerson()])
    useGameStore.getState().pressStart()
    useGameStore.getState().beginActive({})
    const winner: WinnerInfo = {
      playerNumber: 1,
      personId: 0,
      timeSeconds: 2.345,
      noseTip: { x: 0.4, y: 0.35 },
      forehead: { x: 0.4, y: 0.22 },
      faceBox: samplePerson().faceBox,
    }
    useGameStore.getState().declareWinner(winner)
    const s = useGameStore.getState()
    expect(s.phase).toBe('WIN')
    expect(s.winner?.playerNumber).toBe(1)
    expect(s.elapsedMs).toBe(2345)
  })

  it('declareWinner ignored outside ACTIVE', () => {
    useGameStore.getState().declareWinner({
      playerNumber: 1,
      personId: 0,
      timeSeconds: 1,
      noseTip: { x: 0, y: 0 },
      forehead: { x: 0, y: 0 },
      faceBox: samplePerson().faceBox,
    })
    expect(useGameStore.getState().phase).toBe('IDLE')
    expect(useGameStore.getState().winner).toBeNull()
  })

  it('restart clears winner/timer and returns to IDLE', () => {
    useGameStore.getState().setPersons([samplePerson()])
    useGameStore.getState().pressStart()
    useGameStore.getState().beginActive({ '0:0': { x: 0.1, y: 0.1 } })
    useGameStore.getState().declareWinner({
      playerNumber: 1,
      personId: 0,
      timeSeconds: 1.5,
      noseTip: { x: 0.4, y: 0.35 },
      forehead: { x: 0.4, y: 0.22 },
      faceBox: samplePerson().faceBox,
    })
    useGameStore.getState().restart()
    const s = useGameStore.getState()
    expect(s.phase).toBe('IDLE')
    expect(s.winner).toBeNull()
    expect(s.elapsedMs).toBe(0)
    expect(s.handStartPositions).toEqual({})
    expect(s.personCount).toBe(1) // persons preserved
  })

  it('camera denied sets error message', () => {
    useGameStore.getState().setCameraStatus('denied', 'Camera permission denied')
    expect(useGameStore.getState().cameraStatus).toBe('denied')
    expect(useGameStore.getState().cameraError).toMatch(/denied/i)
  })
})
