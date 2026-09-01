import { useEffect, useRef } from 'react'
import { PARTY_HAT_SRC } from '../lib/constants'
import { minNoseDistance } from '../lib/collision'
import type { PersonDetection, WinnerInfo } from '../lib/types'
import { NOSE_TOUCH_THRESHOLD, PLAYER_COLORS } from '../lib/types'
import { useGameStore } from '../store/gameStore'

interface CameraMirrorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

/**
 * Full-screen mirrored camera with canvas overlay:
 * - One solid tracking square per detected player
 * - Nose + fingertip markers
 * - Near-touch glow when a finger approaches the nose
 * - Party hat + loser dim on win
 */
export function CameraMirror({ videoRef }: CameraMirrorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hatImgRef = useRef<HTMLImageElement | null>(null)
  const personsRef = useRef(useGameStore.getState().persons)
  const phaseRef = useRef(useGameStore.getState().phase)
  const winnerRef = useRef(useGameStore.getState().winner)
  const rafRef = useRef(0)

  // Preload party hat
  useEffect(() => {
    const img = new Image()
    img.src = PARTY_HAT_SRC
    hatImgRef.current = img
  }, [])

  // Subscribe to store for latest overlay data without React re-render lag
  useEffect(() => {
    return useGameStore.subscribe((s) => {
      personsRef.current = s.persons
      phaseRef.current = s.phase
      winnerRef.current = s.winner
    })
  }, [])

  // Keep canvas sized to the video box
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

  // Continuous RAF overlay for snappy tracking (not only on React state ticks)
  useEffect(() => {
    let alive = true
    const draw = () => {
      if (!alive) return
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = canvas.width
          const h = canvas.height
          ctx.clearRect(0, 0, w, h)

          const phase = phaseRef.current
          const persons = personsRef.current
          const winner = winnerRef.current

          if (phase === 'WIN' && winner) {
            drawWinOverlay(ctx, w, h, persons, winner, hatImgRef.current)
          } else {
            for (const person of persons) {
              drawPlayerTracker(ctx, w, h, person, phase === 'ACTIVE')
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="camera-stage">
      <div className="camera-frame">
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
    </div>
  )
}

function toPx(norm: number, size: number) {
  return norm * size
}

function playerColor(playerNumber: number) {
  return PLAYER_COLORS[(playerNumber - 1) % PLAYER_COLORS.length]
}

/**
 * Bold per-player tracking square + landmarks.
 * Separate box for every detected person (multiplayer simultaneous).
 */
function drawPlayerTracker(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  person: PersonDetection,
  active: boolean,
) {
  const color = playerColor(person.playerNumber)
  const box = person.trackBox ?? person.faceBox
  const x = toPx(box.xMin, w)
  const y = toPx(box.yMin, h)
  const bw = toPx(box.width, w)
  const bh = toPx(box.height, h)

  const near = minNoseDistance(person)
  const touching = near < NOSE_TOUCH_THRESHOLD
  const approaching = near < NOSE_TOUCH_THRESHOLD * 1.8

  ctx.save()

  // Outer glow
  ctx.shadowColor = color
  ctx.shadowBlur = touching ? 28 : approaching ? 18 : 10

  // Fat solid box (not dashed)
  ctx.globalAlpha = 1
  ctx.lineWidth = touching ? 8 : 6
  ctx.strokeStyle = color
  roundRect(ctx, x, y, bw, bh, 16)
  ctx.stroke()

  // Inner highlight stroke
  ctx.shadowBlur = 0
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  roundRect(ctx, x + 4, y + 4, Math.max(0, bw - 8), Math.max(0, bh - 8), 12)
  ctx.stroke()

  // Corner brackets for arcade feel
  drawCorners(ctx, x, y, bw, bh, color, 22, 5)

  // Player badge
  const label = `P${person.playerNumber}`
  ctx.font = 'bold 18px system-ui, sans-serif'
  const tw = ctx.measureText(label).width
  const badgeW = tw + 18
  const badgeH = 28
  const bx = x
  const by = Math.max(6, y - badgeH - 6)
  ctx.fillStyle = color
  roundRect(ctx, bx, by, badgeW, badgeH, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(label, bx + 9, by + 19)

  // Nose tip (large)
  const nx = toPx(person.noseTip.x, w)
  const ny = toPx(person.noseTip.y, h)
  ctx.beginPath()
  ctx.arc(nx, ny, touching ? 10 : 7, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#fff'
  ctx.stroke()

  // Touch radius ring while active
  if (active) {
    ctx.beginPath()
    ctx.arc(nx, ny, NOSE_TOUCH_THRESHOLD * Math.min(w, h), 0, Math.PI * 2)
    ctx.strokeStyle = touching ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)'
    ctx.lineWidth = touching ? 3 : 1.5
    ctx.setLineDash(touching ? [] : [4, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Hands
  for (const hand of person.hands) {
    drawDot(ctx, toPx(hand.indexTip.x, w), toPx(hand.indexTip.y, h), '#fff', 7)
    drawDot(ctx, toPx(hand.thumbTip.x, w), toPx(hand.thumbTip.y, h), '#ffe08a', 6)
    if (hand.middleTip) {
      drawDot(ctx, toPx(hand.middleTip.x, w), toPx(hand.middleTip.y, h), '#cdefff', 5)
    }
    // palm line wrist -> index
    ctx.beginPath()
    ctx.moveTo(toPx(hand.wrist.x, w), toPx(hand.wrist.y, h))
    ctx.lineTo(toPx(hand.indexTip.x, w), toPx(hand.indexTip.y, h))
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
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
  for (const person of persons) {
    const isWinner = person.playerNumber === winner.playerNumber
    const box = person.trackBox ?? person.faceBox
    const x = toPx(box.xMin, w)
    const y = toPx(box.yMin, h)
    const bw = toPx(box.width, w)
    const bh = toPx(box.height, h)

    if (!isWinner) {
      ctx.save()
      ctx.fillStyle = 'rgba(20,20,30,0.55)'
      roundRect(ctx, x - 8, y - 8, bw + 16, bh + 16, 14)
      ctx.fill()
      ctx.strokeStyle = 'rgba(160,160,170,0.5)'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()
    } else {
      const color = playerColor(person.playerNumber)
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 8
      ctx.shadowColor = color
      ctx.shadowBlur = 24
      roundRect(ctx, x, y, bw, bh, 16)
      ctx.stroke()
      ctx.restore()

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

function drawCorners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  len: number,
  thickness: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = thickness
  ctx.lineCap = 'square'
  const L = Math.min(len, w / 3, h / 3)
  // TL
  ctx.beginPath()
  ctx.moveTo(x, y + L)
  ctx.lineTo(x, y)
  ctx.lineTo(x + L, y)
  ctx.stroke()
  // TR
  ctx.beginPath()
  ctx.moveTo(x + w - L, y)
  ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + L)
  ctx.stroke()
  // BL
  ctx.beginPath()
  ctx.moveTo(x, y + h - L)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x + L, y + h)
  ctx.stroke()
  // BR
  ctx.beginPath()
  ctx.moveTo(x + w - L, y + h)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + w, y + h - L)
  ctx.stroke()
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
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.stroke()
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
