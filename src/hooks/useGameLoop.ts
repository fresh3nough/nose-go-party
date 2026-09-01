import { useCallback, useEffect, useRef } from 'react'
import {
  createStreakCounter,
  isValidNoseTouch,
  minNoseDistance,
  primaryHandPoint,
} from '../lib/collision'
import type { PersonDetection, Point2D, VisionFrameResult } from '../lib/types'
import { useGameStore } from '../store/gameStore'
import { useVisionWorker } from './useVisionWorker'

/**
 * Orchestrates detection results into the game state machine:
 * - Always updates person list (for tracking boxes / START enable)
 * - During ACTIVE: collision + anti-cheat + 2-frame streak
 * - Captures hand start positions when transitioning into ACTIVE
 * - Multi-person: evaluates every person each frame; first confirmed streak wins
 */
export function useGameLoop(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef<number>(0)
  const activeStartRef = useRef<number>(0)
  // 2 consecutive frames is enough; threshold is already forgiving
  const streak = useRef(createStreakCounter(2))
  const lastPersonsRef = useRef<PersonDetection[]>([])

  const phase = useGameStore((s) => s.phase)
  const handStartPositions = useGameStore((s) => s.handStartPositions)
  const setPersons = useGameStore((s) => s.setPersons)
  const tick = useGameStore((s) => s.tick)
  const declareWinner = useGameStore((s) => s.declareWinner)
  const beginActive = useGameStore((s) => s.beginActive)

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const handStartsRef = useRef(handStartPositions)
  handStartsRef.current = handStartPositions

  const onResult = useCallback(
    (result: VisionFrameResult) => {
      lastPersonsRef.current = result.persons
      setPersons(result.persons)

      const currentPhase = phaseRef.current

      // Nose-touch is IGNORED during countdown and non-active phases
      if (currentPhase !== 'ACTIVE') {
        streak.current.reset()
        return
      }

      const starts = handStartsRef.current

      // Evaluate ALL players simultaneously; nearest valid touch wins the frame
      let candidate: PersonDetection | null = null
      let bestDist = Number.POSITIVE_INFINITY

      for (const person of result.persons) {
        const personStarts = startsForPerson(starts, person.id)

        if (!isValidNoseTouch(person, personStarts)) continue

        const d = minNoseDistance(person)
        if (d < bestDist) {
          bestDist = d
          candidate = person
        }
      }

      const confirmedId = streak.current.update(candidate ? candidate.id : null)
      if (confirmedId !== null) {
        // Re-find by stable id in case ranking shifted
        const winnerPerson =
          result.persons.find((p) => p.id === confirmedId) ??
          (candidate && candidate.id === confirmedId ? candidate : null)
        if (!winnerPerson) return

        const elapsedMs = performance.now() - activeStartRef.current
        declareWinner({
          playerNumber: winnerPerson.playerNumber,
          personId: winnerPerson.id,
          timeSeconds: elapsedMs / 1000,
          noseTip: winnerPerson.noseTip,
          forehead: winnerPerson.forehead,
          faceBox: winnerPerson.faceBox,
        })
      }
    },
    [setPersons, declareWinner],
  )

  const { detect } = useVisionWorker(onResult)

  useEffect(() => {
    if (phase === 'ACTIVE') {
      activeStartRef.current = performance.now()
      streak.current.reset()
    }
  }, [phase])

  /**
   * Called by Countdown when GO! animation completes.
   * Snapshots current hand positions for anti-cheat.
   * Also snapshots a synthetic "away" start if no hands are visible so that
   * a later nose touch still has a travel baseline from frame edge.
   */
  const onGoComplete = useCallback(() => {
    const persons = lastPersonsRef.current
    const starts: Record<string, Point2D> = {}
    for (const p of persons) {
      if (p.hands.length === 0) {
        // No hands at GO! — seed a far start so first touch after raise counts
        starts[`${p.id}:any`] = {
          x: p.noseTip.x,
          y: Math.min(0.95, p.noseTip.y + 0.35),
        }
      } else {
        p.hands.forEach((hand, i) => {
          starts[`${p.id}:${i}`] = { ...primaryHandPoint(hand) }
        })
        starts[`${p.id}:any`] = { ...primaryHandPoint(p.hands[0]) }
      }
    }
    beginActive(starts)
    activeStartRef.current = performance.now()
    streak.current.reset()
  }, [beginActive])

  // RAF loop: feed frames to worker + tick timer
  useEffect(() => {
    let alive = true

    const loop = () => {
      if (!alive) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        detect(video, true)
      }
      if (phaseRef.current === 'ACTIVE') {
        const elapsed = performance.now() - activeStartRef.current
        tick(elapsed)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [detect, tick, videoRef])

  return { onGoComplete }
}

/** Collect GO! start points belonging to one stable person id. */
function startsForPerson(
  starts: Record<string, Point2D>,
  personId: number,
): Record<string, Point2D> {
  const personStarts: Record<string, Point2D> = {}
  const prefix = `${personId}:`
  for (const [key, pt] of Object.entries(starts)) {
    if (!key.startsWith(prefix)) continue
    const handIdx = key.slice(prefix.length)
    personStarts[handIdx] = pt
  }
  return personStarts
}

// silence unused in case tree-shaken debug wants threshold later
