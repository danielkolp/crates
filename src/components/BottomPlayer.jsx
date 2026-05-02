import { useCallback, useEffect, useRef, useState } from 'react'
import { publicAsset } from '../utils/assetUrl'

const SKIP_ICON_SRC = publicAsset('images/x.png')
const SAVE_ICON_SRC = publicAsset('images/heart.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')
const PLAY_SYNC_RETRY_DELAYS = [0, 80, 180, 360, 700, 1200, 2200, 4000, 6500, 10000]
const DIRECT_PLAY_RETRY_DELAYS = [0, 120, 300, 700, 1400, 2600]

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

    const waitForExistingScript = () => {
      const pollStartedAt = performance.now()
      const pollTimer = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(pollTimer)
          resolve(window.YT)
          return
        }

        if (performance.now() - pollStartedAt > 10000) {
          window.clearInterval(pollTimer)
          youtubeIframeApiPromise = null
          reject(new Error('Timed out loading YouTube IFrame API script'))
        }
      }, 100)
    }

    const existingScript = document.getElementById(YOUTUBE_IFRAME_SCRIPT_ID)
    if (existingScript) {
      waitForExistingScript()
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
  const raw = String(durationText || '').trim()
  const numeric = Number(raw)

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric
  }

  const isoMatch = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)

  if (isoMatch) {
    const hours = Number(isoMatch[1] || 0)
    const minutes = Number(isoMatch[2] || 0)
    const seconds = Number(isoMatch[3] || 0)
    return (hours * 3600) + (minutes * 60) + seconds
  }

  const parts = raw
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

function getTrackDurationSeconds(track) {
  const directDuration = Number(track?.durationSeconds)

  if (Number.isFinite(directDuration) && directDuration > 0) {
    return directDuration
  }

  return parseDuration(track?.duration)
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

function configureYouTubeIframe(player) {
  try {
    const iframe = player?.getIframe?.()

    if (!iframe) {
      return
    }

    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    )
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  } catch {
    // Ignore occasional transient YouTube API errors.
  }
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
  playbackCommand = null,
  volume,
  onTogglePlay,
  onPlaybackStateChange,
  canSwipeActions,
  isSwipeTrackLiked = false,
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
  const playSyncTimersRef = useRef([])
  const volumeRef = useRef(clampPercent(volume))
  const currentTrackIdRef = useRef(currentTrack?.id || null)
  const currentVideoIdRef = useRef(currentTrack?.youtubeVideoId || '')
  const trackDurationSeconds = getTrackDurationSeconds(currentTrack)

  const clearPlaySyncTimers = useCallback(() => {
    playSyncTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    playSyncTimersRef.current = []
  }, [])

  const syncYouTubePlayback = useCallback(({ videoId = currentVideoIdRef.current, shouldPlay = isPlayingRef.current, force = false } = {}) => {
    const player = playerRef.current

    if (!isPlayerReady || !player || !videoId || currentVideoIdRef.current !== videoId) {
      return
    }

    try {
      let loadedNextVideo = false

      player.setVolume?.(volumeRef.current)
      if (shouldPlay && volumeRef.current > 0) {
        player.unMute?.()
      }

      if (loadedVideoIdRef.current !== videoId) {
        if (shouldPlay) {
          player.loadVideoById(videoId)
          loadedNextVideo = true
        } else {
          player.cueVideoById(videoId)
        }

        loadedVideoIdRef.current = videoId
        progressValueRef.current = 0
        fallbackTickRef.current = performance.now()
        onProgressChange?.(0)
      }

      const playerState = Number(player.getPlayerState?.())
      const playerStates = window.YT?.PlayerState || {}
      const playerIsPlaying =
        playerState === playerStates.PLAYING ||
        playerState === playerStates.BUFFERING

      if (shouldPlay) {
        if (loadedNextVideo || force || !playerIsPlaying) {
          player.playVideo?.()
        }
      } else if (force || playerIsPlaying) {
        player.pauseVideo?.()
      }
    } catch {
      // The IFrame API can throw while a video is still loading. Retries handle that path.
    }
  }, [isPlayerReady, onProgressChange])

  const scheduleDirectPlayRetries = useCallback((videoId = currentVideoIdRef.current) => {
    if (!videoId) {
      return
    }

    DIRECT_PLAY_RETRY_DELAYS.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (currentVideoIdRef.current !== videoId || !isPlayingRef.current) {
          return
        }

        try {
          playerRef.current?.unMute?.()
          playerRef.current?.setVolume?.(volumeRef.current)
          playerRef.current?.playVideo?.()
        } catch {
          // The IFrame API can throw while a video is still loading. Retries handle that path.
        }
      }, delay)

      playSyncTimersRef.current.push(timerId)
    })
  }, [])

  const schedulePlaybackSync = useCallback(({ videoId = currentVideoIdRef.current, shouldPlay = isPlayingRef.current } = {}) => {
    clearPlaySyncTimers()

    if (!videoId) {
      return
    }

    PLAY_SYNC_RETRY_DELAYS.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (currentVideoIdRef.current !== videoId || isPlayingRef.current !== shouldPlay) {
          return
        }

        syncYouTubePlayback({
          videoId,
          shouldPlay,
          force: delay === 0 || !shouldPlay,
        })
      }, delay)

      playSyncTimersRef.current.push(timerId)
    })

    if (shouldPlay) {
      scheduleDirectPlayRetries(videoId)
    }
  }, [clearPlaySyncTimers, scheduleDirectPlayRetries, syncYouTubePlayback])

  function runImmediatePlaybackSync(nextPlaying = isPlayingRef.current) {
    const shouldPlay = Boolean(nextPlaying)
    const videoId = currentVideoIdRef.current

    isPlayingRef.current = shouldPlay
    syncYouTubePlayback({ videoId, shouldPlay, force: true })
    schedulePlaybackSync({ videoId, shouldPlay })
  }

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
      clearPlaySyncTimers()

      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
      }

      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [clearPlaySyncTimers])

  useEffect(() => {
    progressValueRef.current = clampPercent(progress)
  }, [progress])

  useEffect(() => {
    const nextTrackId = currentTrack?.id || null
    const nextVideoId = currentTrack?.youtubeVideoId || ''
    const trackChanged =
      currentTrackIdRef.current !== nextTrackId ||
      currentVideoIdRef.current !== nextVideoId

    currentTrackIdRef.current = nextTrackId
    currentVideoIdRef.current = nextVideoId

    if (trackChanged) {
      clearPlaySyncTimers()
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      progressValueRef.current = 0
      fallbackTickRef.current = performance.now()
      onProgressChange?.(0)
    }
  }, [currentTrack?.id, currentTrack?.youtubeVideoId, onProgressChange, clearPlaySyncTimers])

  useEffect(() => {
    isPlayingRef.current = Boolean(isPlaying)
  }, [isPlaying])

  useEffect(() => {
    volumeRef.current = clampPercent(volume)
  }, [volume])

  useEffect(() => {
    isScrubbingRef.current = isScrubbing
  }, [isScrubbing])

  useEffect(() => {
    scrubPercentRef.current = scrubPercent
  }, [scrubPercent])

  useEffect(() => {
    if (currentTrack?.youtubeVideoId) {
      return
    }

    clearPlaySyncTimers()
    loadedVideoIdRef.current = ''
    progressValueRef.current = 0
    fallbackTickRef.current = 0
    isPlayingRef.current = false
    onProgressChange?.(0)
    onPlaybackStateChange?.(false)

    try {
      playerRef.current?.stopVideo?.()
    } catch {
      // Ignore occasional transient YouTube API errors.
    }
  }, [clearPlaySyncTimers, currentTrack?.youtubeVideoId, onPlaybackStateChange, onProgressChange])

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
          height: '200',
          width: '200',
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
              configureYouTubeIframe(playerRef.current)
              loadedVideoIdRef.current = currentTrack.youtubeVideoId
              try {
                const readyVideoId = currentVideoIdRef.current || currentTrack.youtubeVideoId

                playerRef.current?.setVolume(volumeRef.current)
                if (readyVideoId && readyVideoId !== currentTrack.youtubeVideoId) {
                  if (isPlayingRef.current) {
                    playerRef.current?.loadVideoById(readyVideoId)
                  } else {
                    playerRef.current?.cueVideoById(readyVideoId)
                  }
                  loadedVideoIdRef.current = readyVideoId
                  progressValueRef.current = 0
                  onProgressChange?.(0)
                } else if (isPlayingRef.current) {
                  playerRef.current?.playVideo()
                }

                if (isPlayingRef.current) {
                  scheduleDirectPlayRetries(readyVideoId)
                }
              } catch {
                // Ignore occasional transient YouTube API errors.
              }
            },
            onStateChange: (event) => {
              const playerStates = window.YT?.PlayerState

              if (!playerStates) {
                return
              }

              if (event.data === playerStates.PLAYING && !isPlayingRef.current) {
                try {
                  playerRef.current?.pauseVideo()
                } catch {
                  // Ignore occasional transient YouTube API errors.
                }
                return
              }

              if (event.data === playerStates.PLAYING) {
                fallbackTickRef.current = performance.now()
                return
              }

              if (event.data === playerStates.BUFFERING) {
                fallbackTickRef.current = performance.now()
                return
              }

              if (event.data === playerStates.CUED) {
                fallbackTickRef.current = performance.now()
                if (isPlayingRef.current) {
                  try {
                    playerRef.current?.playVideo()
                  } catch {
                    // Ignore occasional transient YouTube API errors.
                  }
                  scheduleDirectPlayRetries()
                }
                return
              }

              if (event.data === playerStates.PAUSED) {
                fallbackTickRef.current = performance.now()
                if (isPlayingRef.current) {
                  scheduleDirectPlayRetries()
                }
                return
              }

              if (event.data === playerStates.ENDED) {
                clearPlaySyncTimers()
                isPlayingRef.current = false
                progressValueRef.current = 100
                onProgressChange?.(100)
                onPlaybackStateChange?.(false)
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
  }, [clearPlaySyncTimers, currentTrack?.youtubeVideoId, onPlaybackStateChange, onProgressChange, onTrackEnd, scheduleDirectPlayRetries])

  useEffect(() => {
    const commandAppliesToTrack =
      playbackCommand?.trackId &&
      currentTrack?.id &&
      playbackCommand.trackId === currentTrack.id
    const desiredShouldPlay = commandAppliesToTrack
      ? Boolean(playbackCommand.shouldPlay)
      : Boolean(isPlaying)
    const videoId = currentTrack?.youtubeVideoId || ''

    isPlayingRef.current = desiredShouldPlay

    if (!isPlayerReady || !playerRef.current || !videoId) {
      return
    }

    schedulePlaybackSync({ videoId, shouldPlay: desiredShouldPlay })

    return () => {
      clearPlaySyncTimers()
    }
  }, [
    clearPlaySyncTimers,
    currentTrack?.id,
    currentTrack?.youtubeVideoId,
    isPlayerReady,
    isPlaying,
    playbackCommand?.id,
    playbackCommand?.shouldPlay,
    playbackCommand?.trackId,
    schedulePlaybackSync,
  ])

  useEffect(() => {
    if (!isScrubbing) {
      return undefined
    }

    function finalizeScrub() {
      const clampedPercent = clampPercent(scrubPercentRef.current ?? progressValueRef.current)
      const fallbackDuration = trackDurationSeconds

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
  }, [isScrubbing, onProgressChange, trackDurationSeconds])

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

      try {
        const playerStates = window.YT?.PlayerState || {}
        const playerState = Number(playerRef.current?.getPlayerState?.())
        const duration = Number(playerRef.current?.getDuration?.() || 0)
        const currentTime = Number(playerRef.current?.getCurrentTime?.() || 0)
        const playerTimelineActive =
          playerState === playerStates.PLAYING ||
          playerState === playerStates.BUFFERING

        if (
          isPlayingRef.current &&
          playerRef.current &&
          !playerTimelineActive
        ) {
          playerRef.current.unMute?.()
          playerRef.current.setVolume?.(volumeRef.current)
          playerRef.current.playVideo?.()
        }

        if (duration > 0 && currentTime >= 0) {
          if (playerTimelineActive) {
            usedPlayerTimeline = true
            const quantizedSeconds = Math.floor(currentTime)
            nextPercent = Math.min((quantizedSeconds / duration) * 100, 100)
          } else {
            nextPercent = progressValueRef.current
          }
        }
      } catch {
        // Ignore occasional transient YouTube API errors.
      }

      if (nextPercent === null) {
        fallbackTickRef.current = performance.now()
      } else {
        fallbackTickRef.current = performance.now()
      }

      if (nextPercent !== null) {
        progressValueRef.current = nextPercent
        if (!isScrubbingRef.current) {
          onProgressChange?.(nextPercent)
        }

        if (!isScrubbingRef.current && usedPlayerTimeline && nextPercent >= 100) {
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
  }, [currentTrack?.youtubeVideoId, isPlayerReady, isPlaying, onProgressChange, onTrackEnd, trackDurationSeconds])

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) {
      return
    }

    try {
      playerRef.current.setVolume(volumeRef.current)
      if (volumeRef.current <= 0) {
        playerRef.current.mute?.()
      } else {
        playerRef.current.unMute?.()
      }
    } catch {
      // Ignore occasional transient YouTube API errors.
    }
  }, [isPlayerReady, volume])

  if (!currentTrack) {
    return null
  }

  const totalSeconds = trackDurationSeconds
  const displayProgress = isScrubbing && scrubPercent !== null ? scrubPercent : progress
  const displayVolume = clampPercent(volume)
  const elapsedSeconds = (displayProgress / 100) * totalSeconds
  const durationLabel = totalSeconds > 0 ? formatTime(totalSeconds) : currentTrack.duration
  const rangeThemeClass = isDarkMode ? 'range-control-dark' : ''

  function applySeekPercent(nextPercent) {
    const clampedPercent = clampPercent(nextPercent)
    const fallbackDuration = trackDurationSeconds

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

  function handleTogglePlayClick() {
    const nextPlaying = !isPlayingRef.current
    runImmediatePlaybackSync(nextPlaying)
    onTogglePlay?.(nextPlaying)
  }

  function handleVolumeInput(nextVolume) {
    const clampedVolume = clampPercent(nextVolume)
    volumeRef.current = clampedVolume

    try {
      playerRef.current?.setVolume?.(clampedVolume)
      if (clampedVolume <= 0) {
        playerRef.current?.mute?.()
      } else {
        playerRef.current?.unMute?.()
      }
    } catch {
      // Ignore occasional transient YouTube API errors.
    }

    onVolumeChange?.(clampedVolume)
  }

  return (
    <footer
      ref={footerRef}
      className={[
        'fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md',
        isDarkMode ? 'border-white/60 bg-black text-white' : 'border-zinc-300 bg-zinc-50/95 text-zinc-900',
      ].join(' ')}
    >
      <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,260px)_1fr_auto] md:items-center md:gap-6 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={currentTrack.artworkUrl}
            alt={currentTrack.title}
            className={`h-14 w-14 rounded-xl border object-cover ${isDarkMode ? 'border-white/60' : 'border-zinc-300'}`}
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
                    ? 'border-white/60 bg-black text-white hover:bg-zinc-900'
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
              onClick={handleTogglePlayClick}
              className={[
                'tooltip-anchor grid h-9 w-9 place-items-center rounded-full border transition',
                isDarkMode
                  ? 'border-white/60 bg-black text-white hover:bg-zinc-900'
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
                  isSwipeTrackLiked
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : isDarkMode
                      ? 'border-white/60 bg-black text-white hover:border-emerald-500 hover:bg-emerald-500'
                      : 'border-zinc-300 bg-white hover:border-emerald-500 hover:bg-emerald-500',
                ].join(' ')}
                aria-label={isSwipeTrackLiked ? 'Saved to liked' : 'Save track'}
                data-tooltip={isSwipeTrackLiked ? 'Saved to liked' : 'Save to liked tracks (same as swipe right)'}
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
                    ? 'border-white/60 bg-black text-white hover:border-amber-500 hover:bg-amber-400'
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
              className="tooltip-anchor flex flex-1 items-center"
              data-tooltip="Drag to scrub through the current track"
            >
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
                className={`range-control ${rangeThemeClass}`}
                style={{ '--range-fill': `${displayProgress}%` }}
                aria-label="Seek playback"
              />
            </div>
            <span className={`mono w-10 text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{durationLabel}</span>
            <label className={`tooltip-anchor ml-1 flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-zinc-600'}`} data-tooltip="Adjust playback volume">
              <VolumeIcon volume={volume} />
              <div className="flex w-24 items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => handleVolumeInput(event.target.value)}
                  className={`range-control range-control-compact ${rangeThemeClass}`}
                  style={{ '--range-fill': `${displayVolume}%` }}
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
              isDarkMode ? 'border-white/60 bg-black text-white' : 'border-zinc-300 bg-white text-zinc-600',
            ].join(' ')}
            data-tooltip="Tracks remaining in the current queue"
          >
            Queue {queueCount}
          </span>
        </div>

        <div className="md:col-span-3">
          <div className="pointer-events-none absolute -left-[9999px] top-0 h-[200px] w-[200px] overflow-hidden opacity-0" aria-hidden="true">
            <div ref={audioHostRef} />
          </div>

        </div>
      </div>
    </footer>
  )
}

export default BottomPlayer
