import { describe, expect, it } from 'vitest'
import {
  createStreakCounter,
  distance,
  hasTraveledEnough,
  isHandTouchingNose,
  isValidNoseTouch,
  personNoseTouch,
  primaryHandPoint,
} from '../lib/collision'
import type { HandLandmarks, PersonDetection, Point2D } from '../lib/types'

const hand = (
  index: Point2D,
  thumb?: Point2D,
  wrist?: Point2D,
  middle?: Point2D,
): HandLandmarks => ({
  indexTip: index,
  thumbTip: thumb ?? { x: index.x + 0.05, y: index.y },
  middleTip: middle ?? { x: index.x + 0.02, y: index.y + 0.01 },
  wrist: wrist ?? { x: index.x, y: index.y + 0.2 },
})

const person = (nose: Point2D, hands: HandLandmarks[]): PersonDetection => ({
  id: 0,
  playerNumber: 1,
  faceBox: { xMin: nose.x - 0.1, yMin: nose.y - 0.1, width: 0.2, height: 0.25 },
  trackBox: { xMin: nose.x - 0.12, yMin: nose.y - 0.12, width: 0.24, height: 0.3 },
  noseTip: nose,
  forehead: { x: nose.x, y: nose.y - 0.08 },
  hands,
})

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(distance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBe(0)
  })
})

describe('isHandTouchingNose', () => {
  const nose = { x: 0.5, y: 0.5 }

  it('detects index tip within threshold', () => {
    expect(isHandTouchingNose(nose, hand({ x: 0.52, y: 0.51 }), 0.04)).toBe(true)
  })

  it('detects thumb tip within threshold', () => {
    expect(
      isHandTouchingNose(
        nose,
        hand({ x: 0.9, y: 0.9 }, { x: 0.51, y: 0.5 }),
        0.04,
      ),
    ).toBe(true)
  })

  it('detects middle tip within threshold', () => {
    expect(
      isHandTouchingNose(
        nose,
        hand({ x: 0.9, y: 0.9 }, { x: 0.9, y: 0.9 }, undefined, { x: 0.51, y: 0.5 }),
        0.04,
      ),
    ).toBe(true)
  })

  it('rejects far hands', () => {
    expect(isHandTouchingNose(nose, hand({ x: 0.8, y: 0.8 }), 0.04)).toBe(false)
  })

  it('uses exact threshold boundary (strict less-than)', () => {
    expect(isHandTouchingNose(nose, hand({ x: 0.54, y: 0.5 }), 0.04)).toBe(false)
    expect(isHandTouchingNose(nose, hand({ x: 0.539, y: 0.5 }), 0.04)).toBe(true)
  })
})

describe('personNoseTouch', () => {
  it('returns true when any hand touches own nose', () => {
    const p = person({ x: 0.4, y: 0.4 }, [
      hand({ x: 0.1, y: 0.1 }),
      hand({ x: 0.41, y: 0.4 }),
    ])
    expect(personNoseTouch(p)).toBe(true)
  })

  it('returns false with no hands near nose', () => {
    const p = person({ x: 0.4, y: 0.4 }, [hand({ x: 0.1, y: 0.1 })])
    expect(personNoseTouch(p)).toBe(false)
  })
})

describe('hasTraveledEnough / anti-cheat', () => {
  it('allows missing start position (hand entered after GO)', () => {
    expect(hasTraveledEnough(null, { x: 0.5, y: 0.5 }, 0.15)).toBe(true)
    expect(hasTraveledEnough(undefined, { x: 0.5, y: 0.5 }, 0.15)).toBe(true)
  })

  it('rejects short travel under minTravel', () => {
    const start = { x: 0.5, y: 0.5 }
    expect(hasTraveledEnough(start, { x: 0.55, y: 0.5 }, 0.15)).toBe(false)
  })

  it('accepts travel of at least minTravel of normalized space', () => {
    const start = { x: 0.2, y: 0.8 }
    expect(hasTraveledEnough(start, { x: 0.4, y: 0.8 }, 0.15)).toBe(true)
  })
})

describe('isValidNoseTouch', () => {
  it('requires both collision and travel when start is near nose', () => {
    const nose = { x: 0.5, y: 0.5 }
    const p = person(nose, [hand({ x: 0.51, y: 0.5 })])

    // start near nose -> travel too small
    expect(isValidNoseTouch(p, { '0': { x: 0.5, y: 0.52 } }, 0.04, 0.15)).toBe(false)

    // start far away -> valid
    expect(isValidNoseTouch(p, { '0': { x: 0.1, y: 0.9 } }, 0.04, 0.15)).toBe(true)
  })

  it('supports any-key fallback start position', () => {
    const nose = { x: 0.5, y: 0.5 }
    const p = person(nose, [hand({ x: 0.51, y: 0.5 })])
    expect(isValidNoseTouch(p, { any: { x: 0.0, y: 0.0 } }, 0.04, 0.15)).toBe(true)
  })

  it('allows touch when no start positions recorded for person', () => {
    const nose = { x: 0.5, y: 0.5 }
    const p = person(nose, [hand({ x: 0.51, y: 0.5 })])
    expect(isValidNoseTouch(p, {}, 0.04, 0.15)).toBe(true)
  })
})

describe('primaryHandPoint', () => {
  it('prefers index tip', () => {
    const h = hand({ x: 0.1, y: 0.2 })
    expect(primaryHandPoint(h)).toEqual({ x: 0.1, y: 0.2 })
  })
})

describe('createStreakCounter', () => {
  it('requires 2 consecutive frames of the same id', () => {
    const c = createStreakCounter(2)
    expect(c.update(1)).toBeNull()
    expect(c.update(1)).toBe(1)
  })

  it('resets when candidate changes or is null', () => {
    const c = createStreakCounter(2)
    expect(c.update(1)).toBeNull()
    expect(c.update(2)).toBeNull()
    expect(c.update(2)).toBe(2)
    c.reset()
    expect(c.update(2)).toBeNull()
    expect(c.update(null)).toBeNull()
    expect(c.streak).toBe(0)
  })
})
