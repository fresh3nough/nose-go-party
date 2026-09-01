import type { BoundingBox, HandLandmarks, PersonDetection, Point2D } from './types'
import { MAX_PLAYERS } from './types'

/**
 * Sort detected faces left-to-right by nose x and assign 1-based player numbers.
 * Caps at MAX_PLAYERS. When `previous` is provided, reuses stable ids via nose
 * proximity so multi-person tracking does not reshuffle every frame.
 */
export function assignPlayers(
  raw: Array<{
    faceBox: BoundingBox
    noseTip: Point2D
    forehead: Point2D
    hands: PersonDetection['hands']
    trackBox?: BoundingBox
  }>,
  maxPlayers: number = MAX_PLAYERS,
  previous: PersonDetection[] = [],
): PersonDetection[] {
  const sorted = [...raw].sort((a, b) => a.noseTip.x - b.noseTip.x)
  const capped = sorted.slice(0, maxPlayers)

  const usedPrev = new Set<number>()
  const usedIds = new Set<number>()
  const matched: PersonDetection[] = []

  for (const p of capped) {
    let id: number | null = null

    // Match to previous frame person by nose distance (stable across small motion)
    let bestPrev: PersonDetection | null = null
    let bestDist = 0.12
    for (const prev of previous) {
      if (usedPrev.has(prev.id)) continue
      const d = Math.hypot(prev.noseTip.x - p.noseTip.x, prev.noseTip.y - p.noseTip.y)
      if (d < bestDist) {
        bestDist = d
        bestPrev = prev
      }
    }

    if (bestPrev) {
      id = bestPrev.id
      usedPrev.add(bestPrev.id)
    } else {
      const taken = new Set<number>([...usedIds, ...previous.map((x) => x.id)])
      let next = 0
      while (taken.has(next)) next += 1
      id = next
    }

    usedIds.add(id)

    const trackBox = p.trackBox ?? expandTrackBox(p.faceBox, p.hands)

    matched.push({
      id,
      playerNumber: 0,
      faceBox: p.faceBox,
      trackBox,
      noseTip: p.noseTip,
      forehead: p.forehead,
      hands: p.hands,
    })
  }

  // Player numbers are always left-to-right on screen for the current frame
  return matched
    .sort((a, b) => a.noseTip.x - b.noseTip.x)
    .map((p, index) => ({
      ...p,
      playerNumber: index + 1,
    }))
}

/** Midpoint helper for bounding boxes. */
export function boxCenter(box: BoundingBox): Point2D {
  return {
    x: box.xMin + box.width / 2,
    y: box.yMin + box.height / 2,
  }
}

/** Clamp a box into normalized [0,1] image space. */
export function clampBox(box: BoundingBox): BoundingBox {
  const xMin = Math.max(0, Math.min(1, box.xMin))
  const yMin = Math.max(0, Math.min(1, box.yMin))
  const xMax = Math.max(0, Math.min(1, box.xMin + box.width))
  const yMax = Math.max(0, Math.min(1, box.yMin + box.height))
  return {
    xMin,
    yMin,
    width: Math.max(0, xMax - xMin),
    height: Math.max(0, yMax - yMin),
  }
}

/**
 * Build a tracking rectangle that covers the face and any associated hands
 * so each player has one clear on-screen box.
 */
export function expandTrackBox(faceBox: BoundingBox, hands: HandLandmarks[]): BoundingBox {
  let xMin = faceBox.xMin
  let yMin = faceBox.yMin
  let xMax = faceBox.xMin + faceBox.width
  let yMax = faceBox.yMin + faceBox.height

  const padX = faceBox.width * 0.18
  const padY = faceBox.height * 0.22
  xMin -= padX
  xMax += padX
  yMin -= padY
  yMax += padY * 0.5

  for (const hand of hands) {
    for (const p of [hand.indexTip, hand.thumbTip, hand.middleTip, hand.wrist]) {
      if (!p) continue
      xMin = Math.min(xMin, p.x - 0.03)
      xMax = Math.max(xMax, p.x + 0.03)
      yMin = Math.min(yMin, p.y - 0.03)
      yMax = Math.max(yMax, p.y + 0.03)
    }
  }

  return clampBox({
    xMin,
    yMin,
    width: xMax - xMin,
    height: yMax - yMin,
  })
}

/**
 * Associate free-floating hand landmarks to the nearest face.
 * Uses wrist + index distance to nose/face center; up to 2 hands per face.
 * Generous band so hands near the face (nose-touch pose) still bind.
 */
export function associateHandsToFaces(
  faces: Array<{ noseTip: Point2D; faceBox: BoundingBox; forehead: Point2D }>,
  hands: HandLandmarks[],
): Array<{
  faceBox: BoundingBox
  noseTip: Point2D
  forehead: Point2D
  hands: HandLandmarks[]
  trackBox: BoundingBox
}> {
  const remaining = hands.map((hand, i) => ({ hand, i }))

  return faces.map((face) => {
    const faceCx = face.noseTip.x
    const faceCy = face.noseTip.y
    const band = Math.max(face.faceBox.width * 2.2, 0.35)

    const candidates = remaining
      .map((r) => {
        const wx = r.hand.wrist.x
        const wy = r.hand.wrist.y
        const ix = r.hand.indexTip.x
        const iy = r.hand.indexTip.y
        const dWrist = Math.hypot(wx - faceCx, wy - faceCy)
        const dIndex = Math.hypot(ix - faceCx, iy - faceCy)
        const d = Math.min(dWrist, dIndex)
        const xBand = Math.abs(wx - faceCx) < band || Math.abs(ix - faceCx) < band
        return { ...r, d, xBand }
      })
      .filter((c) => c.xBand || c.d < 0.45)
      .sort((a, b) => a.d - b.d)

    const assigned: HandLandmarks[] = []
    for (const c of candidates.slice(0, 2)) {
      assigned.push(c.hand)
      const idx = remaining.findIndex((r) => r.i === c.i)
      if (idx >= 0) remaining.splice(idx, 1)
    }

    return {
      faceBox: face.faceBox,
      noseTip: face.noseTip,
      forehead: face.forehead,
      hands: assigned,
      trackBox: expandTrackBox(face.faceBox, assigned),
    }
  })
}
