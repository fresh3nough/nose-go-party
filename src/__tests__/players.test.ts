import { describe, expect, it } from 'vitest'
import { assignPlayers, associateHandsToFaces, boxCenter, expandTrackBox } from '../lib/players'
import type { HandLandmarks, PersonDetection } from '../lib/types'

const face = (x: number, y = 0.4) => ({
  faceBox: { xMin: x - 0.08, yMin: y - 0.1, width: 0.16, height: 0.22 },
  noseTip: { x, y },
  forehead: { x, y: y - 0.08 },
  hands: [] as HandLandmarks[],
})

const handAt = (x: number, y = 0.6): HandLandmarks => ({
  indexTip: { x, y },
  thumbTip: { x: x + 0.02, y },
  middleTip: { x: x + 0.01, y: y - 0.01 },
  wrist: { x, y: y + 0.1 },
})

describe('assignPlayers', () => {
  it('sorts left-to-right and assigns 1-based numbers', () => {
    const raw = [face(0.7), face(0.2), face(0.5)]
    const players = assignPlayers(raw)
    expect(players.map((p) => p.noseTip.x)).toEqual([0.2, 0.5, 0.7])
    expect(players.map((p) => p.playerNumber)).toEqual([1, 2, 3])
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

  it('keeps stable ids across frames for multi-person tracking', () => {
    const frame1 = assignPlayers([face(0.2), face(0.7)])
    expect(frame1.map((p) => p.playerNumber)).toEqual([1, 2])
    const prev: PersonDetection[] = frame1
    // slight movement, same two people
    const frame2 = assignPlayers(
      [
        { ...face(0.22), hands: [handAt(0.2)] },
        { ...face(0.72), hands: [handAt(0.7)] },
      ],
      6,
      prev,
    )
    expect(frame2).toHaveLength(2)
    // ids should match previous people, not reshuffle randomly
    const left = frame2.find((p) => p.playerNumber === 1)!
    const right = frame2.find((p) => p.playerNumber === 2)!
    expect(left.id).toBe(frame1[0].id)
    expect(right.id).toBe(frame1[1].id)
    // each has own track box
    expect(left.trackBox.width).toBeGreaterThan(0)
    expect(right.trackBox.width).toBeGreaterThan(0)
  })
})

describe('associateHandsToFaces', () => {
  it('gives nearest hands to each face', () => {
    const faces = [face(0.25), face(0.75)].map(({ hands: _h, ...rest }) => rest)
    const hands = [handAt(0.22), handAt(0.78), handAt(0.5)]
    const result = associateHandsToFaces(faces, hands)
    expect(result[0].hands.length).toBeGreaterThanOrEqual(1)
    expect(result[1].hands.length).toBeGreaterThanOrEqual(1)
    expect(result[0].hands.length).toBeLessThanOrEqual(2)
    expect(result[1].hands.length).toBeLessThanOrEqual(2)
    expect(result[0].trackBox).toBeDefined()
    expect(result[1].trackBox).toBeDefined()
  })

  it('does not duplicate hands across faces', () => {
    const faces = [face(0.3), face(0.7)].map(({ hands: _h, ...rest }) => rest)
    const hands = [handAt(0.3)]
    const result = associateHandsToFaces(faces, hands)
    const total = result.reduce((n, f) => n + f.hands.length, 0)
    expect(total).toBe(1)
  })
})

describe('expandTrackBox', () => {
  it('expands face box and includes hands', () => {
    const faceBox = { xMin: 0.4, yMin: 0.3, width: 0.2, height: 0.25 }
    const box = expandTrackBox(faceBox, [handAt(0.7, 0.5)])
    expect(box.xMin).toBeLessThan(faceBox.xMin)
    expect(box.xMin + box.width).toBeGreaterThan(0.7)
  })
})

describe('boxCenter', () => {
  it('returns center of bounding box', () => {
    const c = boxCenter({ xMin: 0.2, yMin: 0.2, width: 0.2, height: 0.4 })
    expect(c.x).toBeCloseTo(0.3, 10)
    expect(c.y).toBeCloseTo(0.4, 10)
  })
})
