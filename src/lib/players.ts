import type { BoundingBox, PersonDetection, Point2D } from './types'
import { MAX_PLAYERS } from './types'

/**
 * Sort detected faces left-to-right by nose (or box center) x coordinate and
 * assign 1-based player numbers. Caps at MAX_PLAYERS.
 *
 * MediaPipe returns coords in the image space of the frame that was analyzed.
 * When the camera is mirrored for display, callers should either mirror the
 * landmarks before calling this, or pass already-mirrored persons so that
 * "left" on screen == lower x.
 */
export function assignPlayers(
  raw: Array<{
    faceBox: BoundingBox
    noseTip: Point2D
    forehead: Point2D
    hands: PersonDetection['hands']
  }>,
  maxPlayers: number = MAX_PLAYERS,
): PersonDetection[] {
  const sorted = [...raw].sort((a, b) => a.noseTip.x - b.noseTip.x)
  const capped = sorted.slice(0, maxPlayers)
  return capped.map((p, index) => ({
    id: index,
    playerNumber: index + 1,
    faceBox: p.faceBox,
    noseTip: p.noseTip,
    forehead: p.forehead,
    hands: p.hands,
  }))
}

/** Midpoint helper for bounding boxes. */
export function boxCenter(box: BoundingBox): Point2D {
  return {
    x: box.xMin + box.width / 2,
    y: box.yMin + box.height / 2,
  }
}

/**
 * Associate free-floating hand landmarks to the nearest face by x-distance
 * to the nose tip. Each hand is given to at most one person (greedy nearest).
 */
export function associateHandsToFaces(
  faces: Array<{ noseTip: Point2D; faceBox: BoundingBox; forehead: Point2D }>,
  hands: PersonDetection['hands'],
): Array<{
  faceBox: BoundingBox
  noseTip: Point2D
  forehead: Point2D
  hands: PersonDetection['hands']
}> {
  const remaining = hands.map((h, i) => ({ hand: h, i }))
  return faces.map((face) => {
    const assigned: PersonDetection['hands'] = []
    // Collect hands whose wrist/index is within a generous x-band of the face
    const faceCx = face.noseTip.x
    const candidates = remaining
      .map((r) => ({
        ...r,
        d: Math.abs(r.hand.wrist.x - faceCx),
      }))
      .filter((c) => c.d < Math.max(face.faceBox.width * 1.5, 0.25))
      .sort((a, b) => a.d - b.d)

    // Take up to 2 nearest hands for this face
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
    }
  })
}
