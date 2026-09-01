import type { HandLandmarks, PersonDetection, Point2D } from './types'
import { ANTI_CHEAT_TRAVEL, NOSE_TOUCH_THRESHOLD } from './types'

/** Euclidean distance between two normalized points. */
export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * Returns true when either index tip or thumb tip is within the nose-touch
 * threshold of the nose tip.
 */
export function isHandTouchingNose(
  noseTip: Point2D,
  hand: HandLandmarks,
  threshold: number = NOSE_TOUCH_THRESHOLD,
): boolean {
  return (
    distance(noseTip, hand.indexTip) < threshold ||
    distance(noseTip, hand.thumbTip) < threshold
  )
}

/**
 * Check if any of a person's hands collides with their own nose.
 * Cross-person touches do not count.
 */
export function personNoseTouch(
  person: PersonDetection,
  threshold: number = NOSE_TOUCH_THRESHOLD,
): boolean {
  return person.hands.some((hand) => isHandTouchingNose(person.noseTip, hand, threshold))
}

/**
 * Anti-cheat: hand must have traveled at least `minTravel` (fraction of frame
 * diagonal-ish; we use pure normalized euclidean) from its position at GO!
 */
export function hasTraveledEnough(
  start: Point2D | null | undefined,
  current: Point2D,
  minTravel: number = ANTI_CHEAT_TRAVEL,
): boolean {
  if (!start) return false
  return distance(start, current) >= minTravel
}

/**
 * Pick the representative hand point used for anti-cheat travel tracking.
 * Prefer index tip; fall back to thumb tip; then wrist.
 */
export function primaryHandPoint(hand: HandLandmarks): Point2D {
  return hand.indexTip ?? hand.thumbTip ?? hand.wrist
}

/**
 * For a person, return true if at least one hand both touches the nose AND
 * has traveled far enough from the recorded start position.
 *
 * `startPositions` maps a hand key ("0","1",...) to the point captured at GO!
 */
export function isValidNoseTouch(
  person: PersonDetection,
  startPositions: Record<string, Point2D>,
  threshold: number = NOSE_TOUCH_THRESHOLD,
  minTravel: number = ANTI_CHEAT_TRAVEL,
): boolean {
  for (let i = 0; i < person.hands.length; i++) {
    const hand = person.hands[i]
    if (!isHandTouchingNose(person.noseTip, hand, threshold)) continue
    const start = startPositions[String(i)] ?? startPositions['any']
    const point = primaryHandPoint(hand)
    if (hasTraveledEnough(start, point, minTravel)) {
      return true
    }
  }
  return false
}

/**
 * Consecutive-frame confirmation helper.
 * Call each frame with whether a candidate win was detected; returns true
 * only after `required` consecutive true frames.
 */
export function createStreakCounter(required = 2) {
  let streak = 0
  let lastId: number | null = null

  return {
    /** Feed a frame result. Returns the winning person id if confirmed. */
    update(candidateId: number | null): number | null {
      if (candidateId === null) {
        streak = 0
        lastId = null
        return null
      }
      if (candidateId === lastId) {
        streak += 1
      } else {
        lastId = candidateId
        streak = 1
      }
      if (streak >= required) {
        return candidateId
      }
      return null
    },
    reset() {
      streak = 0
      lastId = null
    },
    get streak() {
      return streak
    },
  }
}
