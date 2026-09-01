import { useCallback, useEffect, useRef } from 'react'
import {
  createStreakCounter,
  isValidNoseTouch,
  primaryHandPoint,
} from '../lib/collision'
import type { PersonDetection, Point2D, VisionFrameResult } from '../lib/types'
import { useGameStore } from '../store/gameStore'
import { useVisionWorker } from './useVisionWorker'

/**
 * Orchestrates detection results into the game state machine:
 * - Always updates person list (for ghost boxes / START enable)
 * - During ACTIVE: runs collision + anti-cheat + 2-frame streak
 * - Captures hand start positions when transitioning into ACTIVE
 */
export function useGameLoop(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const rafRef = useRef<number>(0)
  const activeStartRef = useRef<number>(0)
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
      let candidate: PersonDetection | null = null
      for (const person of result.persons) {
        // Build per-person start map from global keyed starts
        const personStarts: Record<string, Point2D> = {}
        for (const [key, pt] of Object.entries(starts)) {
          const [pid, handIdx] = key.split(':')
          if (Number(pid) === person.id) {
            personStarts[handIdx] = pt
          }
        }
        // Also allow a generic 'any' fallback using first hand start for person
        const anyKey = Object.keys(starts).find((k) => k.startsWith(`${person.id}:`))
        if (anyKey) personStarts['any'] = starts[anyKey]

        if (isValidNoseTouch(person, personStarts)) {
          candidate = person
          break
        }
      }

      const confirmedId = streak.current.update(candidate ? candidate.id : null)
      if (confirmedId !== null && candidate) {
        const elapsedMs = performance.now() - activeStartRef.current
        declareWinner({
          playerNumber: candidate.playerNumber,
          personId: candidate.id,
          timeSeconds: elapsedMs / 1000,
          noseTip: candidate.noseTip,
          forehead: candidate.forehead,
          faceBox: candidate.faceBox,
        })
      }
    },
    [setPersons, declareWinner],
  )

  const { detect } = useVisionWorker(onResult)

  // Capture hand starts + begin ACTIVE when countdown finishes (GO!)
  // The Countdown component calls into the store; we observe phase change.
  useEffect(() => {
    if (phase === 'ACTIVE') {
      activeStartRef.current = performance.now()
      streak.current.reset()
    }
  }, [phase])

  /**
   * Called by Countdown when GO! animation completes.
   * Snapshots current hand positions for anti-cheat.
   */
  const onGoComplete = useCallback(() => {
    const persons = lastPersonsRef.current
    const starts: Record<string, Point2D> = {}
    for (const p of persons) {
      p.hands.forEach((hand, i) => {
        starts[`${p.id}:${i}`] = { ...primaryHandPoint(hand) }
      })
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
