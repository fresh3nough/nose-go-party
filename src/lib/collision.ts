import type { HandLandmarks, PersonDetection, Point2D } from './types'
import { ANTI_CHEAT_TRAVEL, NOSE_TOUCH_THRESHOLD } from './types'

/** Euclidean distance between two normalized points. */
export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/** All fingertip candidates used for nose-touch checks. */
export function handTouchPoints(hand: HandLandmarks): Point2D[] {
  return [hand.indexTip, hand.thumbTip, hand.middleTip].filter(Boolean)
}

/**
 * Returns true when index, thumb, or middle tip is within the nose-touch
 * threshold of the nose tip.
 */
export function isHandTouchingNose(
  noseTip: Point2D,
  hand: HandLandmarks,
  threshold: number = NOSE_TOUCH_THRESHOLD,
): boolean {
  return handTouchPoints(hand).some((p) => distance(noseTip, p) < threshold)
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
 * Anti-cheat: hand must have traveled at least `minTravel` from GO! snapshot.
 * If no start was recorded (hand not visible at GO!), treat as valid travel —
 * the hand entered the scene after the race started.
 */
export function hasTraveledEnough(
  start: Point2D | null | undefined,
  current: Point2D,
  minTravel: number = ANTI_CHEAT_TRAVEL,
): boolean {
  if (!start) return true
  return distance(start, current) >= minTravel
}

/**
 * Pick the representative hand point used for anti-cheat travel tracking.
 * Prefer index tip; fall back to middle, thumb, then wrist.
 */
export function primaryHandPoint(hand: HandLandmarks): Point2D {
  return hand.indexTip ?? hand.middleTip ?? hand.thumbTip ?? hand.wrist
}

/**
 * Closest fingertip distance to nose (for debug overlay / near-touch glow).
 */
export function minNoseDistance(person: PersonDetection): number {
  let best = Number.POSITIVE_INFINITY
  for (const hand of person.hands) {
    for (const p of handTouchPoints(hand)) {
      const d = distance(person.noseTip, p)
      if (d < best) best = d
    }
  }
  return best
}

/**
 * For a person, return true if at least one hand both touches the nose AND
 * has traveled far enough from the recorded start position.
 *
 * `startPositions` maps hand keys ("0","1",... or "any") to GO! points.
 * Missing starts count as traveled (hand appeared after GO!).
 */
export function isValidNoseTouch(
  person: PersonDetection,
  startPositions: Record<string, Point2D>,
  threshold: number = NOSE_TOUCH_THRESHOLD,
  minTravel: number = ANTI_CHEAT_TRAVEL,
): boolean {
  // If this person had no hands tracked at GO!, any post-GO touch is valid
  // once a hand reaches the nose (anti-cheat start map empty for them).
  const hasAnyStart =
    Object.keys(startPositions).length > 0 ||
    startPositions['any'] !== undefined

  for (let i = 0; i < person.hands.length; i++) {
    const hand = person.hands[i]
    if (!isHandTouchingNose(person.noseTip, hand, threshold)) continue

    const start =
      startPositions[String(i)] ??
      startPositions['any'] ??
      // Fall back: any recorded start for this person (hand index may shuffle)
      Object.values(startPositions)[0]

    const point = primaryHandPoint(hand)

    // No start at all for this person → hand entered after GO → allow
    if (!hasAnyStart && start === undefined) {
      return true
    }

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
