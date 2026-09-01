import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  startCamera: () => Promise<void>
  stopCamera: () => void
}

/**
 * Requests getUserMedia and binds the stream to a hidden/full-screen video element.
 * Handles permission denied and missing devices.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const setCameraStatus = useGameStore((s) => s.setCameraStatus)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    setCameraStatus('pending')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error', 'Camera API not available in this browser')
        return
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = media
      setStream(media)
      if (videoRef.current) {
        videoRef.current.srcObject = media
        // Plays inline on mobile
        await videoRef.current.play().catch(() => {
          /* autoplay restrictions – user gesture may be required */
        })
      }
      setCameraStatus('ready')
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraStatus('denied', 'Camera permission denied. Allow camera access to play.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraStatus('error', 'No camera found on this device.')
      } else {
        const message = err instanceof Error ? err.message : String(err)
        setCameraStatus('error', `Camera error: ${message}`)
      }
    }
  }, [setCameraStatus])

  useEffect(() => {
    void startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Re-bind stream if the video element mounts after the stream is ready
  useEffect(() => {
    if (stream && videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream])

  return { videoRef, stream, startCamera, stopCamera }
}
