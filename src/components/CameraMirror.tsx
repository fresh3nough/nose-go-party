import { useEffect, useRef } from 'react'
import { PARTY_HAT_SRC } from '../lib/constants'
import type { PersonDetection, WinnerInfo } from '../lib/types'
import { useGameStore } from '../store/gameStore'

interface CameraMirrorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

const GHOST_COLORS = ['#FF006E', '#3A86FF', '#FFBE0B', '#06D6A0', '#8338EC', '#FB5607']

/**
 * Full-screen mirrored camera with canvas overlay for ghost boxes,
 * landmarks, party hat, and loser greying.
 */
export function CameraMirror({ videoRef }: CameraMirrorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hatImgRef = useRef<HTMLImageElement | null>(null)

  const persons = useGameStore((s) => s.persons)
  const phase = useGameStore((s) => s.phase)
  const winner = useGameStore((s) => s.winner)

  // Preload party hat
  useEffect(() => {
    const img = new Image()
    img.src = PARTY_HAT_SRC
    hatImgRef.current = img
  }, [])

  // Keep canvas sized to the viewport / video
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const resize = () => {
      const w = video.clientWidth || window.innerWidth
      const h = video.clientHeight || window.innerHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    resize()
    window.addEventListener('resize', resize)
    const ro = new ResizeObserver(resize)
    ro.observe(video)
    return () => {
      window.removeEventListener('resize', resize)
      ro.disconnect()
    }
  }, [videoRef])

  // Draw overlay each time persons / phase / winner change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    if (phase === 'WIN' && winner) {
      drawWinOverlay(ctx, w, h, persons, winner, hatImgRef.current)
      return
    }

    // Ghost bounding boxes + nose dots in IDLE/READY/COUNTDOWN/ACTIVE/TIMEOUT
    for (const person of persons) {
      drawGhostBox(ctx, w, h, person)
    }
  }, [persons, phase, winner, videoRef])

  return (
    <div className="camera-stage">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
        // Mirrored selfie view
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas ref={canvasRef} className="camera-overlay" />
    </div>
  )
}

function toPx(norm: number, size: number) {
  return norm * size
}

function drawGhostBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  person: PersonDetection,
) {
  const color = GHOST_COLORS[(person.playerNumber - 1) % GHOST_COLORS.length]
  const { faceBox, noseTip, hands, playerNumber } = person
  const x = toPx(faceBox.xMin, w)
  const y = toPx(faceBox.yMin, h)
  const bw = toPx(faceBox.width, w)
  const bh = toPx(faceBox.height, h)

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.85
  ctx.setLineDash([8, 6])
  roundRect(ctx, x, y, bw, bh, 12)
  ctx.stroke()
  ctx.setLineDash([])

  // Player label
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillText(`P${playerNumber}`, x + 8, Math.max(18, y - 8))

  // Nose tip
  ctx.beginPath()
  ctx.arc(toPx(noseTip.x, w), toPx(noseTip.y, h), 6, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // Hand tips
  for (const hand of hands) {
    drawDot(ctx, toPx(hand.indexTip.x, w), toPx(hand.indexTip.y, h), '#fff', 5)
    drawDot(ctx, toPx(hand.thumbTip.x, w), toPx(hand.thumbTip.y, h), '#ddd', 4)
  }
  ctx.restore()
}

function drawWinOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  persons: PersonDetection[],
  winner: WinnerInfo,
  hat: HTMLImageElement | null,
) {
  // Grey/blur losers via dimmed boxes; winner stays vivid
  for (const person of persons) {
    const isWinner = person.playerNumber === winner.playerNumber
    const { faceBox } = person
    const x = toPx(faceBox.xMin, w)
    const y = toPx(faceBox.yMin, h)
    const bw = toPx(faceBox.width, w)
    const bh = toPx(faceBox.height, h)

    if (!isWinner) {
      ctx.save()
      ctx.fillStyle = 'rgba(20,20,30,0.55)'
      roundRect(ctx, x - 8, y - 8, bw + 16, bh + 16, 14)
      ctx.fill()
      ctx.strokeStyle = 'rgba(160,160,170,0.5)'
      ctx.lineWidth = 2
      ctx.filter = 'grayscale(1)'
      ctx.stroke()
      ctx.restore()
    } else {
      const color = GHOST_COLORS[(person.playerNumber - 1) % GHOST_COLORS.length]
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 4
      ctx.shadowColor = color
      ctx.shadowBlur = 18
      roundRect(ctx, x, y, bw, bh, 12)
      ctx.stroke()
      ctx.restore()

      // Party hat anchored to forehead
      if (hat && hat.complete && hat.naturalWidth > 0) {
        const hatW = bw * 0.9
        const hatH = hatW * (hat.naturalHeight / hat.naturalWidth)
        const hx = toPx(winner.forehead.x, w) - hatW / 2
        const hy = toPx(winner.forehead.y, h) - hatH * 0.75
        ctx.drawImage(hat, hx, hy, hatW, hatH)
      }
    }
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  r: number,
) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
