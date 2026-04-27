import { useEffect, useRef, useState } from 'react'
import YouTubePlayer from './YouTubePlayer'
import { publicAsset } from '../utils/assetUrl'

const SKIP_ICON_SRC = publicAsset('images/x.png')
const SAVE_ICON_SRC = publicAsset('images/heart.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')

const YOUTUBE_IFRAME_SCRIPT_ID = 'youtube-iframe-api'
let youtubeIframeApiPromise = null

function loadYouTubeIframeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise
  }

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.()
      resolve(window.YT)
    }

    const existingScript = document.getElementById(YOUTUBE_IFRAME_SCRIPT_ID)
    if (existingScript) {
      return
    }

    const script = document.createElement('script')
    script.id = YOUTUBE_IFRAME_SCRIPT_ID
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      youtubeIframeApiPromise = null
      reject(new Error('Failed to load YouTube IFrame API script'))
    }
    document.head.appendChild(script)
  })

  return youtubeIframeApiPromise
}

function parseDuration(durationText) {
  const parts = String(durationText || '')
    .split(':')
    .map((part) => Number(part))

  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return (parts[0] * 60) + parts[1]
  }

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  }

  return 0
}

function formatTime(secondsValue) {
  const totalSeconds = Math.max(0, Math.floor(secondsValue))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function clampPercent(value) {
  return Math.max(0, Math.min(Number(value) || 0, 100))
}

function PlayIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 5.5v13l10-6.5L8 5.5Z" />
    </svg>
  )
}

function PauseIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </svg>
  )
}

function VolumeIcon({ volume, className = 'h-4 w-4' }) {
  const level = Math.max(0, Math.min(Number(volume) || 0, 100))
  const muted = level === 0
  const low = level > 0 && level < 35
  const high = level >= 35

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 14.5h3.8l4.2 3.6V5.9L8.3 9.5H4.5v5Z" />
      {low && <path strokeLinecap="round" d="M16.2 10.2a3 3 0 0 1 0 3.6" />}
      {high && (
        <>
          <path strokeLinecap="round" d="M16 8.6a5.1 5.1 0 0 1 0 6.8" />
          <path strokeLinecap="round" d="M18.9 6.7a8.1 8.1 0 0 1 0 10.6" />
        </>
      )}
      {muted && <path strokeLinecap="round" d="M16.1 9.6l3.9 4m0-4l-3.9 4" />}
    </svg>
  )
}

function BottomPlayer({
  currentTrack,
  queueCount,
  isPlaying,
  progress,
  volume,
  onTogglePlay,
  canSwipeActions,
  onSwipeSkip,
  onSwipeSave,
  onSwipeGem,
  onVolumeChange,
  onProgressChange,
  onTrackEnd,
  onHeightChange,
  hideSwipeActions = false,
  isDarkMode = false,
}) {
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPercent, setScrubPercent] = useState(null)
  const audioHostRef = useRef(null)
  const footerRef = useRef(null)
  const playerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const loadedVideoIdRef = useRef('')
  const progressValueRef = useRef(0)
  const fallbackTickRef = useRef(0)
  const isPlayingRef = useRef(isPlaying)
  const isScrubbingRef = useRef(false)
  const scrubPercentRef = useRef(null)

  useEffect(() => {
    if (!onHeightChange || !footerRef.current) {
      return undefined
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(footerRef.current?.getBoundingClientRect().height || 0)
      if (nextHeight > 0) {
        onHeightChange(nextHeight)
      }
    }

    updateHeight()

    if (!window.ResizeObserver) {
      window.addEventListener('resize', updateHeight)
      return () => {
        window.removeEventListener('resize', updateHeight)
      }
    }

    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(footerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [currentTrack?.id, onHeightChange])

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
      }

      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    progressValueRef.current = clampPercent(progress)
  }, [progress])

  useEffect(() => {
    isPlayingRef.current = Boolean(isPlaying)
  }, [isPlaying])

  useEffect(() => {
    isScrubbingRef.current = isScrubbing
  }, [isScrubbing])

  useEffect(() => {
    scrubPercentRef.current = scrubPercent
  }, [scrubPercent])

  useEffect(() => {
    if (!currentTrack?.youtubeVideoId || playerRef.current || !audioHostRef.current) {
      return undefined
    }

    let isDisposed = false

    loadYouTubeIframeApi()
      .then((YT) => {
        if (isDisposed || !audioHostRef.current) {
          return
        }

        playerRef.current = new YT.Player(audioHostRef.current, {
          height: '0',
          width: '0',
          videoId: currentTrack.youtubeVideoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (isDisposed) {
                return
              }

              setIsPlayerReady(true)
              loadedVideoIdRef.current = currentTrack.youtubeVideoId
              try {
                playerRef.current?.setVolume(volume)
              } catch {
                // Ignore occasional transient YouTube API errors.
              }
            },
            onStateChange: (event) => {
              if (!window.YT?.PlayerState) {
                return
              }

              if (event.data === window.YT.PlayerState.PLAYING && !isPlayingRef.current) {
                try {
                  playerRef.current?.pauseVideo()
                } catch {
                  // Ignore occasional transient YouTube API errors.
                }
                return
              }

              if (event.data === window.YT.PlayerState.ENDED) {
                progressValueRef.current = 100
                onProgressChange?.(100)
                onTrackEnd?.()
              }
            },
          },
        })
      })
      .catch(() => {
        setIsPlayerReady(false)
      })

    return () => {
      isDisposed = true
    }
  }, [currentTrack?.youtubeVideoId, onProgressChange, onTrackEnd, volume])

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current || !currentTrack?.youtubeVideoId) {
      return
    }

    try {
      if (loadedVideoIdRef.current !== currentTrack.youtubeVideoId) {
        if (isPlaying) {
          playerRef.current.loadVideoById(currentTrack.youtubeVideoId)
        } else {
          playerRef.current.cueVideoById(currentTrack.youtubeVideoId)
        }
        loadedVideoIdRef.current = currentTrack.youtubeVideoId
        progressValueRef.current = 0
        onProgressChange?.(0)
        return
      }

      if (isPlaying) {
        playerRef.current.playVideo()
      } else {
        playerRef.current.pauseVideo()
      }
    } catch {
      // Ignore occasional transient YouTube API errors.
    }
  }, [currentTrack?.youtubeVideoId, isPlayerReady, isPlaying, onProgressChange])

  useEffect(() => {
    if (!isScrubbing) {
      return undefined
    }

    function finalizeScrub() {
      const clampedPercent = clampPercent(scrubPercentRef.current ?? progressValueRef.current)
      const fallbackDuration = parseDuration(currentTrack?.duration)

      try {
        const currentDuration = Number(playerRef.current?.getDuration?.() || 0)
        const effectiveDuration = currentDuration > 0 ? currentDuration : fallbackDuration
        if (effectiveDuration > 0) {
          const seekSeconds = (clampedPercent / 100) * effectiveDuration
          playerRef.current?.seekTo(seekSeconds, true)
          if (isPlayingRef.current) {
            playerRef.current?.playVideo()
          } else {
            playerRef.current?.pauseVideo()
          }
        }
      } catch {
        // Ignore occasional transient YouTube API errors.
      }

      progressValueRef.current = clampedPercent
      fallbackTickRef.current = performance.now()
      onProgressChange?.(clampedPercent)
      setIsScrubbing(false)
      setScrubPercent(null)
    }

    window.addEventListener('pointerup', finalizeScrub)
    window.addEventListener('pointercancel', finalizeScrub)

    return () => {
      window.removeEventListener('pointerup', finalizeScrub)
      window.removeEventListener('pointercancel', finalizeScrub)
    }
  }, [currentTrack?.duration, isScrubbing, onProgressChange])

  useEffect(() => {
    if (!isPlaying) {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      fallbackTickRef.current = 0
      return undefined
    }

    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current)
    }

    fallbackTickRef.current = performance.now()
    progressIntervalRef.current = window.setInterval(() => {
      let nextPercent = null
      let usedPlayerTimeline = false
      let fallbackDuration = parseDuration(currentTrack?.duration)
      const canUseFallbackTimeline = !isPlayerReady || !playerRef.current

      try {
        const duration = Number(playerRef.current?.getDuration?.() || 0)
        const currentTime = Number(playerRef.current?.getCurrentTime?.() || 0)

        if (duration > 0 && currentTime >= 0) {
          usedPlayerTimeline = true
          const quantizedSeconds = Math.floor(currentTime)
          nextPercent = Math.min((quantizedSeconds / duration) * 100, 100)
          fallbackDuration = duration
        }
      } catch {
        // Ignore occasional transient YouTube API errors.
      }

      if (nextPercent === null) {
        if (canUseFallbackTimeline && fallbackDuration > 0) {
          const now = performance.now()
          const deltaSeconds = Math.max((now - fallbackTickRef.current) / 1000, 0)
          fallbackTickRef.current = now
          nextPercent = Math.min(progressValueRef.current + ((deltaSeconds / fallbackDuration) * 100), 100)
        } else {
          fallbackTickRef.current = performance.now()
        }
      } else {
        fallbackTickRef.current = performance.now()
      }

      if (nextPercent !== null) {
        progressValueRef.current = nextPercent
        if (!isScrubbingRef.current) {
          onProgressChange?.(nextPercent)
        }

        if (!isScrubbingRef.current && !usedPlayerTimeline && nextPercent >= 100) {
          onTrackEnd?.()
        }
      }
    }, 1000)

    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [currentTrack?.duration, currentTrack?.youtubeVideoId, isPlayerReady, isPlaying, onProgressChange, onTrackEnd])

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) {
      return
    }

    try {
      playerRef.current.setVolume(volume)
    } catch {
      // Ignore occasional transient YouTube API errors.
    }
  }, [isPlayerReady, volume])

  if (!currentTrack) {
    return null
  }

  const totalSeconds = parseDuration(currentTrack.duration)
  const displayProgress = isScrubbing && scrubPercent !== null ? scrubPercent : progress
  const displayVolume = clampPercent(volume)
  const elapsedSeconds = (displayProgress / 100) * totalSeconds
  const sliderThumbClass = isDarkMode
    ? '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-none [&::-webkit-slider-thumb]:transition [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:transition [&::-moz-range-thumb]:hover:scale-110'
    : '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-zinc-900 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:transition [&::-moz-range-thumb]:hover:scale-110'

  function applySeekPercent(nextPercent) {
    const clampedPercent = clampPercent(nextPercent)
    const fallbackDuration = parseDuration(currentTrack.duration)

    try {
      const currentDuration = Number(playerRef.current?.getDuration?.() || 0)
      const effectiveDuration = currentDuration > 0 ? currentDuration : fallbackDuration
      if (effectiveDuration > 0) {
        const seekSeconds = (clampedPercent / 100) * effectiveDuration
        playerRef.current?.seekTo(seekSeconds, true)
        if (isPlayingRef.current) {
          playerRef.current?.playVideo()
        } else {
          playerRef.current?.pauseVideo()
        }
      }
    } catch {
      // Ignore occasional transient YouTube API errors.
    }

    progressValueRef.current = clampedPercent
    fallbackTickRef.current = performance.now()
    onProgressChange?.(clampedPercent)
  }

  function handleSeekPreview(nextPercent) {
    const clampedPercent = clampPercent(nextPercent)
    setScrubPercent(clampedPercent)
  }

  function beginScrub() {
    if (isScrubbingRef.current) {
      return
    }

    setIsScrubbing(true)
    setScrubPercent(progressValueRef.current)
  }

  return (
    <footer
      ref={footerRef}
      className={[
        'fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md',
        isDarkMode ? 'border-white bg-black text-white' : 'border-zinc-300 bg-zinc-50/95 text-zinc-900',
      ].join(' ')}
    >
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,260px)_1fr_auto] md:items-center md:gap-6 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={currentTrack.artworkUrl}
            alt={currentTrack.title}
            className={`h-14 w-14 rounded-xl border object-cover ${isDarkMode ? 'border-white' : 'border-zinc-300'}`}
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentTrack.title}</p>
            <p className={`truncate text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{currentTrack.artist}</p>
            <p className={`truncate text-[11px] ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{currentTrack.channelTitle}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            {!hideSwipeActions && (
              <button
                type="button"
                onClick={onSwipeSkip}
                disabled={!canSwipeActions}
                className={[
                  'tooltip-anchor grid h-9 w-9 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDarkMode
                    ? 'border-white bg-black text-white hover:bg-zinc-900'
                    : 'border-zinc-300 bg-white hover:border-zinc-900 hover:bg-zinc-900',
                ].join(' ')}
                aria-label="Skip track"
                data-tooltip="Skip track (same as swipe left)"
              >
                <img src={SKIP_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
              </button>
            )}
            <button
              type="button"
              onClick={onTogglePlay}
              className={[
                'tooltip-anchor grid h-9 w-9 place-items-center rounded-full border transition',
                isDarkMode
                  ? 'border-white bg-black text-white hover:bg-zinc-900'
                  : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700',
              ].join(' ')}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              data-tooltip={isPlaying ? 'Pause playback' : 'Play track'}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            {!hideSwipeActions && (
              <button
                type="button"
                onClick={onSwipeSave}
                disabled={!canSwipeActions}
                className={[
                  'tooltip-anchor grid h-9 w-9 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDarkMode
                    ? 'border-white bg-black text-white hover:border-emerald-500 hover:bg-emerald-500'
                    : 'border-zinc-300 bg-white hover:border-emerald-500 hover:bg-emerald-500',
                ].join(' ')}
                aria-label="Save track"
                data-tooltip="Save to liked tracks (same as swipe right)"
              >
                <img src={SAVE_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
              </button>
            )}
            {!hideSwipeActions && (
              <button
                type="button"
                onClick={onSwipeGem}
                disabled={!canSwipeActions}
                className={[
                  'tooltip-anchor grid h-9 w-9 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDarkMode
                    ? 'border-white bg-black text-white hover:border-amber-500 hover:bg-amber-400'
                    : 'border-zinc-300 bg-white hover:border-amber-500 hover:bg-amber-400',
                ].join(' ')}
                aria-label="Gem track"
                data-tooltip="Mark as gem (same as swipe down)"
              >
                <img src={GEM_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`mono w-10 text-right text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{formatTime(elapsedSeconds)}</span>
            <div
              className={[
                'tooltip-anchor relative h-2 flex-1 rounded-full border',
                isDarkMode ? 'border-white bg-black' : 'border-zinc-300 bg-white',
              ].join(' ')}
              data-tooltip="Drag to scrub through the current track"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${isDarkMode ? 'bg-white' : 'bg-zinc-900'}`}
                style={{ width: `${displayProgress}%` }}
              />

              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={displayProgress}
                onPointerDown={beginScrub}
                onChange={(event) => {
                  if (isScrubbingRef.current) {
                    handleSeekPreview(event.target.value)
                    return
                  }

                  applySeekPercent(event.target.value)
                }}
                className={`absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent ${sliderThumbClass}`}
                aria-label="Seek playback"
              />
            </div>
            <span className={`mono w-10 text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{currentTrack.duration}</span>
            <label className={`tooltip-anchor ml-1 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-zinc-600'}`} data-tooltip="Adjust playback volume">
              <VolumeIcon volume={volume} />
              <div className={`relative h-1.5 w-24 rounded-full border ${isDarkMode ? 'border-white bg-black' : 'border-zinc-300 bg-white'}`}>
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${isDarkMode ? 'bg-white' : 'bg-zinc-900'}`}
                  style={{ width: `${displayVolume}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                  className={`absolute inset-0 h-1.5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent ${sliderThumbClass}`}
                  aria-label="Volume"
                />
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <span
            className={[
              'tooltip-anchor mono rounded-lg border px-2 py-1 text-xs',
              isDarkMode ? 'border-white bg-black text-white' : 'border-zinc-300 bg-white text-zinc-600',
            ].join(' ')}
            data-tooltip="Tracks remaining in the current queue"
          >
            Queue {queueCount}
          </span>
        </div>

        <div className="md:col-span-3">
          <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
            <div ref={audioHostRef} />
          </div>

          <YouTubePlayer
            youtubeVideoId={currentTrack.youtubeVideoId}
            title={`${currentTrack.title} - embedded YouTube player`}
            collapsed
            autoPlay={isPlaying}
          />
        </div>
      </div>
    </footer>
  )
}

export default BottomPlayer
