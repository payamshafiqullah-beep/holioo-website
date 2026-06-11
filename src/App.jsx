import { useEffect, useRef, useState } from 'react'
import './App.css'

const VIDEO_SRC = '/videos/story-scroll.mp4'
const VIDEO_SCROLL_SPEED = 1.35
const SCROLL_LENGTH = '420vh'

const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max)

function App() {
  const videoRef = useRef(null)
  const progressRef = useRef(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    const root = document.documentElement

    const handlePointerMove = (event) => {
      root.style.setProperty('--cursor-x', `${event.clientX}px`)
      root.style.setProperty('--cursor-y', `${event.clientY}px`)
    }

    if (!isTouchDevice) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [isTouchDevice])

  useEffect(() => {
    const video = videoRef.current
    const progressLine = progressRef.current
    let frameId = 0

    const updateScrollVideo = () => {
      const scrollableDistance = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollableDistance > 0 ? window.scrollY / scrollableDistance : 0
      const adjustedProgress = clamp(progress * VIDEO_SCROLL_SPEED)

      if (progressLine) {
        progressLine.style.transform = `scaleX(${adjustedProgress})`
      }

      if (video?.duration && Number.isFinite(video.duration)) {
        video.currentTime = adjustedProgress * video.duration
      }
    }

    const requestUpdate = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(updateScrollVideo)
    }

    const handleMetadata = () => {
      video.pause()
      requestUpdate()
    }

    video?.addEventListener('loadedmetadata', handleMetadata)
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    requestUpdate()

    return () => {
      window.cancelAnimationFrame(frameId)
      video?.removeEventListener('loadedmetadata', handleMetadata)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [])

  return (
    <main className="scroll-video-page" style={{ '--scroll-length': SCROLL_LENGTH }}>
      <div className="cinematic-stage" aria-hidden="true">
        <video
          ref={videoRef}
          className="scroll-video"
          src={VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="cinematic-soft-grade" />
        <div className="cursor-light" />
      </div>

      <div className="scroll-progress" aria-hidden="true">
        <span ref={progressRef} />
      </div>

      <div className="scroll-length" aria-hidden="true" />
    </main>
  )
}

export default App
export { VIDEO_SCROLL_SPEED }
