import { useCallback, useEffect, useRef } from 'react'
import type { VisionFrameResult, WorkerOutMessage } from '../lib/types'
import { useGameStore } from '../store/gameStore'

/**
 * Owns the vision web worker lifecycle and exposes a detect(video) helper
 * that ships an ImageBitmap to the worker each animation frame.
 */
export function useVisionWorker(onResult: (result: VisionFrameResult) => void) {
  const workerRef = useRef<Worker | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const setVisionReady = useGameStore((s) => s.setVisionReady)
  const setMessage = useGameStore((s) => s.setMessage)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const msg = ev.data
      if (msg.type === 'READY') {
        setVisionReady(true, msg.delegate)
      } else if (msg.type === 'RESULT') {
        onResultRef.current(msg.result)
      } else if (msg.type === 'ERROR') {
        console.error('[vision]', msg.message)
        setMessage(msg.message)
      }
    }

    worker.onerror = (err) => {
      console.error('[vision worker error]', err)
      setMessage('Vision worker crashed')
    }

    worker.postMessage({ type: 'INIT' })

    return () => {
      worker.postMessage({ type: 'DISPOSE' })
      worker.terminate()
      workerRef.current = null
      setVisionReady(false)
    }
  }, [setVisionReady, setMessage])

  const detect = useCallback((video: HTMLVideoElement, mirror = true) => {
    const worker = workerRef.current
    if (!worker) return
    if (video.readyState < 2) return

    // createImageBitmap is async; fire-and-forget with backpressure via worker `busy`
    createImageBitmap(video)
      .then((bitmap) => {
        worker.postMessage(
          {
            type: 'DETECT',
            bitmap,
            timestamp: performance.now(),
            mirror,
          },
          [bitmap],
        )
      })
      .catch((err) => {
        console.warn('createImageBitmap failed', err)
      })
  }, [])

  return { detect }
}
