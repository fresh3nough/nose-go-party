import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { COUNTDOWN_COLORS } from '../lib/types'
import { useGameStore } from '../store/gameStore'

interface CountdownProps {
  onComplete: () => void
}

const SEQUENCE: Array<number | 'GO!'> = [3, 2, 1, 'GO!']

/**
 * Full-screen countdown overlay. Spring scale 0.5 -> 1.5 -> 1.
 * Nose-touch is ignored while this is showing (enforced by game loop phase).
 */
export function Countdown({ onComplete }: CountdownProps) {
  const phase = useGameStore((s) => s.phase)
  const setCountdownValue = useGameStore((s) => s.setCountdownValue)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (phase !== 'COUNTDOWN') {
      setIndex(0)
      return
    }

    setIndex(0)
    setCountdownValue(SEQUENCE[0])

    const timers: number[] = []
    SEQUENCE.forEach((value, i) => {
      const t = window.setTimeout(() => {
        setIndex(i)
        setCountdownValue(value)
        if (i === SEQUENCE.length - 1) {
          // Brief hold on GO! then hand off to ACTIVE
          const done = window.setTimeout(() => {
            onComplete()
          }, 500)
          timers.push(done)
        }
      }, i * 800)
      timers.push(t)
    })

    return () => timers.forEach((t) => clearTimeout(t))
  }, [phase, onComplete, setCountdownValue])

  if (phase !== 'COUNTDOWN') return null

  const value = SEQUENCE[index]
  const color = COUNTDOWN_COLORS[index % COUNTDOWN_COLORS.length]

  return (
    <div className="countdown-overlay" aria-live="assertive">
      <AnimatePresence mode="wait">
        <motion.div
          key={String(value)}
          className="countdown-value"
          style={{ color }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.5, 1], opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{
            duration: 0.55,
            times: [0, 0.55, 1],
            ease: 'easeOut',
            type: 'spring',
            stiffness: 320,
            damping: 18,
          }}
        >
          {value}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
