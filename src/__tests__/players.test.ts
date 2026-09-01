import { describe, expect, it } from 'vitest'
import { assignPlayers, associateHandsToFaces, boxCenter } from '../lib/players'
import type { HandLandmarks } from '../lib/types'

const face = (x: number, y = 0.4) => ({
  faceBox: { xMin: x - 0.08, yMin: y - 0.1, width: 0.16, height: 0.22 },
  noseTip: { x, y },
  forehead: { x, y: y - 0.08 },
  hands: [] as HandLandmarks[],
})

const handAt = (x: number, y = 0.6): HandLandmarks => ({
  indexTip: { x, y },
  thumbTip: { x: x + 0.02, y },
  wrist: { x, y: y + 0.1 },
})

describe('assignPlayers', () => {
  it('sorts left-to-right and assigns 1-based numbers', () => {
    const raw = [face(0.7), face(0.2), face(0.5)]
    const players = assignPlayers(raw)
    expect(players.map((p) => p.noseTip.x)).toEqual([0.2, 0.5, 0.7])
    expect(players.map((p) => p.playerNumber)).toEqual([1, 2, 3])
    expect(players.map((p) => p.id)).toEqual([0, 1, 2])
  })

  it('caps at max 6 players', () => {
    const raw = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((x) => face(x))
    const players = assignPlayers(raw, 6)
    expect(players).toHaveLength(6)
    expect(players[5].playerNumber).toBe(6)
    expect(players[5].noseTip.x).toBe(0.6)
  })

  it('handles empty input', () => {
    expect(assignPlayers([])).toEqual([])
  })

  it('handles a single person as Player 1', () => {
    const players = assignPlayers([face(0.5)])
    expect(players).toHaveLength(1)
    expect(players[0].playerNumber).toBe(1)
  })
})

describe('associateHandsToFaces', () => {
  it('gives nearest hands to each face', () => {
    const faces = [face(0.25), face(0.75)].map(({ hands: _h, ...rest }) => rest)
    const hands = [handAt(0.22), handAt(0.78), handAt(0.5)]
    const result = associateHandsToFaces(faces, hands)
    expect(result[0].hands.length).toBeGreaterThanOrEqual(1)
    expect(result[1].hands.length).toBeGreaterThanOrEqual(1)
    // middle hand may go to either depending on distance; both faces get <=2
    expect(result[0].hands.length).toBeLessThanOrEqual(2)
    expect(result[1].hands.length).toBeLessThanOrEqual(2)
  })

  it('does not duplicate hands across faces', () => {
    const faces = [face(0.3), face(0.7)].map(({ hands: _h, ...rest }) => rest)
    const hands = [handAt(0.3)]
    const result = associateHandsToFaces(faces, hands)
    const total = result.reduce((n, f) => n + f.hands.length, 0)
    expect(total).toBe(1)
  })
})

describe('boxCenter', () => {
  it('returns center of bounding box', () => {
    const c = boxCenter({ xMin: 0.2, yMin: 0.2, width: 0.2, height: 0.4 })
    expect(c.x).toBeCloseTo(0.3, 10)
    expect(c.y).toBeCloseTo(0.4, 10)
  })
})
