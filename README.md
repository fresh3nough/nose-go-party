# NOSE GO! Party Edition

**Live game:** [https://nose-go.com/](https://nose-go.com/)


Full-screen camera party game: first player to touch their nose after **GO!** wins.

## Play

```bash
npm install
npm run dev
```

Allow camera access, step into frame (up to 6 players), press **START**, wait for the 3-2-1-GO! countdown, then touch your nose. Hands must travel from their GO! position (anti-cheat). 15s timeout if nobody wins.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit + smoke tests |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview production build |

## Stack

- Vite + React + TypeScript
- `@mediapipe/tasks-vision` FaceLandmarker + HandLandmarker (Web Worker, GPU with CPU fallback)
- `zustand` game state machine
- `framer-motion` countdown springs
- `canvas-confetti` win celebration

## Game loop

1. **IDLE** — mirrored camera, person detection, ghost boxes; START disabled until ≥1 person
2. **COUNTDOWN** — 3-2-1-GO! (nose-touch ignored)
3. **ACTIVE** — ms timer; landmark collision (nose tip vs index/thumb tip, threshold 0.04, 2-frame streak) + 15% travel anti-cheat
4. **WIN** — party hat, confetti, banner, RESTART
5. **TIMEOUT** — "Nobody won!" after 15s

Players are numbered left-to-right on the mirrored view.

## Layout

```
public/party-hat.png
src/components/CameraMirror.tsx, Countdown.tsx, ConfettiCanon.tsx, HUD.tsx
src/hooks/useCamera.ts, useVisionWorker.ts, useGameLoop.ts
src/workers/vision.worker.ts
src/store/gameStore.ts
src/lib/collision.ts, players.ts, types.ts, constants.ts
src/__tests__/…
```

## Tests

Unit tests cover collision math, anti-cheat travel, player assignment, and the zustand state machine. Camera and MediaPipe are not required for `npm test`.
