import { CameraMirror } from './components/CameraMirror'
import { ConfettiCanon } from './components/ConfettiCanon'
import { Countdown } from './components/Countdown'
import { HUD } from './components/HUD'
import { useCamera } from './hooks/useCamera'
import { useGameLoop } from './hooks/useGameLoop'
import './App.css'

export default function App() {
  const { videoRef } = useCamera()
  const { onGoComplete } = useGameLoop(videoRef)

  return (
    <div className="app">
      <CameraMirror videoRef={videoRef} />
      <Countdown onComplete={onGoComplete} />
      <ConfettiCanon />
      <HUD />
    </div>
  )
}
