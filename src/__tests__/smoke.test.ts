import { describe, expect, it } from 'vitest'
import { ANTI_CHEAT_TRAVEL, COUNTDOWN_COLORS, GAME_TIMEOUT_MS, MAX_PLAYERS, NOSE_TOUCH_THRESHOLD } from '../lib/types'
import {
  FACE_MODEL_URL,
  FOREHEAD_INDEX,
  HAND_MODEL_URL,
  INDEX_TIP_INDEX,
  NOSE_TIP_INDEX,
  THUMB_TIP_INDEX,
} from '../lib/constants'
import * as collision from '../lib/collision'
import * as players from '../lib/players'

describe('smoke: critical modules load', () => {
  it('exports collision helpers', () => {
    expect(typeof collision.distance).toBe('function')
    expect(typeof collision.isHandTouchingNose).toBe('function')
    expect(typeof collision.isValidNoseTouch).toBe('function')
    expect(typeof collision.createStreakCounter).toBe('function')
    expect(typeof collision.hasTraveledEnough).toBe('function')
  })

  it('exports player assignment helpers', () => {
    expect(typeof players.assignPlayers).toBe('function')
    expect(typeof players.associateHandsToFaces).toBe('function')
  })

  it('has expected game constants', () => {
    expect(MAX_PLAYERS).toBe(6)
    expect(NOSE_TOUCH_THRESHOLD).toBe(0.04)
    expect(ANTI_CHEAT_TRAVEL).toBe(0.15)
    expect(GAME_TIMEOUT_MS).toBe(15_000)
    expect(COUNTDOWN_COLORS[0]).toBe('#FF006E')
    expect(COUNTDOWN_COLORS[1]).toBe('#3A86FF')
    expect(COUNTDOWN_COLORS[2]).toBe('#FFBE0B')
  })

  it('points MediaPipe models at Google storage CDN', () => {
    expect(FACE_MODEL_URL).toContain('storage.googleapis.com/mediapipe-models')
    expect(HAND_MODEL_URL).toContain('storage.googleapis.com/mediapipe-models')
    expect(NOSE_TIP_INDEX).toBe(1)
    expect(FOREHEAD_INDEX).toBe(10)
    expect(INDEX_TIP_INDEX).toBe(8)
    expect(THUMB_TIP_INDEX).toBe(4)
  })

  it('game store module is importable', async () => {
    const mod = await import('../store/gameStore')
    expect(mod.useGameStore).toBeTypeOf('function')
    expect(mod.selectCanStart).toBeTypeOf('function')
  })
})
