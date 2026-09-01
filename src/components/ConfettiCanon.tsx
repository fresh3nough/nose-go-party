import confetti from 'canvas-confetti'
import { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'

/**
 * Fires 300+ confetti particles when entering the WIN phase.
 */
export function ConfettiCanon() {
  const phase = useGameStore((s) => s.phase)
  const firedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'WIN') {
      firedRef.current = false
      return
    }
    if (firedRef.current) return
    firedRef.current = true

    const colors = ['#FF006E', '#3A86FF', '#FFBE0B', '#06D6A0', '#8338EC', '#FB5607']
    const defaults = {
      colors,
      disableForReducedMotion: true,
    }

    // Multi-burst totaling well over 300 particles
    const bursts = [
      { particleCount: 120, spread: 0.9, origin: { x: 0.5, y: 0.35 } },
      { particleCount: 80, spread: 0.7, origin: { x: 0.2, y: 0.5 }, angle: 60 },
      { particleCount: 80, spread: 0.7, origin: { x: 0.8, y: 0.5 }, angle: 120 },
      { particleCount: 60, spread: 1.0, origin: { x: 0.5, y: 0.2 }, startVelocity: 55 },
    ]

    bursts.forEach((b, i) => {
      window.setTimeout(() => {
        void confetti({ ...defaults, ...b })
      }, i * 180)
    })

    // Late sprinkle
    const end = Date.now() + 1200
    const interval = window.setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval)
        return
      }
      void confetti({
        ...defaults,
        particleCount: 25,
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        origin: { x: Math.random(), y: Math.random() * 0.3 },
      })
    }, 200)

    return () => clearInterval(interval)
  }, [phase])

  return null
}
