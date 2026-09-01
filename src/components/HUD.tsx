import { motion } from 'framer-motion'
import { selectCanStart, useGameStore } from '../store/gameStore'

/**
 * Heads-up display: timer, messages, START / RESTART buttons, banners.
 */
export function HUD() {
  const phase = useGameStore((s) => s.phase)
  const elapsedMs = useGameStore((s) => s.elapsedMs)
  const winner = useGameStore((s) => s.winner)
  const message = useGameStore((s) => s.message)
  const cameraStatus = useGameStore((s) => s.cameraStatus)
  const cameraError = useGameStore((s) => s.cameraError)
  const visionReady = useGameStore((s) => s.visionReady)
  const personCount = useGameStore((s) => s.personCount)
  const canStart = useGameStore(selectCanStart)
  const pressStart = useGameStore((s) => s.pressStart)
  const restart = useGameStore((s) => s.restart)

  const seconds = (elapsedMs / 1000).toFixed(2)

  return (
    <div className="hud">
      <header className="hud-top">
        <h1 className="logo">
          NOSE GO! <span>Party Edition</span>
        </h1>
        {(phase === 'ACTIVE' || phase === 'WIN' || phase === 'TIMEOUT') && (
          <div className="timer" aria-label="elapsed time">
            {seconds}s
          </div>
        )}
      </header>

      <div className="hud-center">
        {cameraStatus === 'denied' && (
          <Banner tone="error">
            {cameraError ?? 'Camera permission denied. Allow camera access to play.'}
          </Banner>
        )}
        {cameraStatus === 'error' && (
          <Banner tone="error">{cameraError ?? 'Camera error'}</Banner>
        )}
        {cameraStatus === 'pending' && <Banner tone="info">Requesting camera…</Banner>}
        {cameraStatus === 'ready' && !visionReady && (
          <Banner tone="info">Loading vision models…</Banner>
        )}
        {phase === 'IDLE' && personCount === 0 && cameraStatus === 'ready' && visionReady && (
          <Banner tone="warn">Step into frame!</Banner>
        )}
        {message && phase === 'TIMEOUT' && <Banner tone="warn">{message}</Banner>}
        {phase === 'WIN' && winner && (
          <motion.div
            className="win-banner"
            initial={{ scale: 0.6, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            [PLAYER {winner.playerNumber} WINS! {winner.timeSeconds.toFixed(2)}s]
          </motion.div>
        )}
      </div>

      <footer className="hud-bottom">
        {(phase === 'IDLE' || phase === 'READY') && (
          <button
            type="button"
            className="btn btn-start"
            disabled={!canStart}
            onClick={pressStart}
          >
            START
          </button>
        )}
        {(phase === 'WIN' || phase === 'TIMEOUT') && (
          <button type="button" className="btn btn-restart" onClick={restart}>
            RESTART
          </button>
        )}
        {phase === 'ACTIVE' && (
          <div className="hint">Touch your nose! First wins.</div>
        )}
      </footer>
    </div>
  )
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'info' | 'warn' | 'error'
}) {
  return <div className={`banner banner-${tone}`}>{children}</div>
}
