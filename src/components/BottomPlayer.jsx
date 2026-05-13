import { useCallback, useEffect, useRef, useState } from 'react'
import { publicAsset } from '../utils/assetUrl'

const SAVE_ICON_SRC = publicAsset('images/heart.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')
const SKIP_ICON_SRC = publicAsset('images/x.png')
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

function getLoadedYouTubeVideoId(player) {
  try {
    return String(player?.getVideoData?.()?.video_id || '').trim()
  } catch {
    return ''
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
  isPlaybackLoading = false,
  progress,
  playbackCommand = null,
  volume,
  onTogglePlay,
  onPlaybackStateChange,
  onPlaybackLoadingChange,
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
  const isMountedRef = useRef(true)
  const isPlayerCreationPendingRef = useRef(false)
  const progressIntervalRef = useRef(null)
  const loadedVideoIdRef = useRef('')
  const progressValueRef = useRef(0)
  const fallbackTickRef = useRef(0)
  const isPlayingRef = useRef(isPlaying)
  const isScrubbingRef = useRef(false)
  const scrubPercentRef = useRef(null)
  const playSyncTimersRef = useRef([])
  const volumeRef = useRef(clampPercent(volume))
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange)
  const onPlaybackLoadingChangeRef = useRef(onPlaybackLoadingChange)
  const onProgressChangeRef = useRef(onProgressChange)
  const onTrackEndRef = useRef(onTrackEnd)
  const currentTrackIdRef = useRef(currentTrack?.id || null)
  const currentVideoIdRef = useRef(currentTrack?.youtubeVideoId || '')
  const trackDurationSeconds = getTrackDurationSeconds(currentTrack)

  const clearPlaySyncTimers = useCallback(() => {
    playSyncTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    playSyncTimersRef.current = []
  }, [])

  const setPlaybackLoading = useCallback((nextLoading, trackId = currentTrackIdRef.current) => {
    onPlaybackLoadingChangeRef.current?.(Boolean(nextLoading), trackId || null)
  }, [])

  const ensureRequestedVideoLoaded = useCallback((videoId, { shouldPlay = isPlayingRef.current } = {}) => {
    const player = playerRef.current

    if (!player || !videoId) {
      return false
    }

    const playerVideoId = getLoadedYouTubeVideoId(player)
    const needsVideoLoad =
      loadedVideoIdRef.current !== videoId ||
      (playerVideoId && playerVideoId !== videoId)

    if (!needsVideoLoad) {
      return false
    }

    if (shouldPlay) {
      player.loadVideoById(videoId)
      setPlaybackLoading(true)
    } else {
      player.cueVideoById(videoId)
      setPlaybackLoading(false)
    }

    loadedVideoIdRef.current = videoId
    progressValueRef.current = 0
    fallbackTickRef.current = performance.now()
    onProgressChange?.(0)

    return true
  }, [onProgressChange, setPlaybackLoading])

  const syncYouTubePlayback = useCallback(({ videoId = currentVideoIdRef.current, shouldPlay = isPlayingRef.current, force = false } = {}) => {
    const player = playerRef.current

    if (!isPlayerReady || !player || !videoId || currentVideoIdRef.current !== videoId) {
      return
    }

    try {
      player.setVolume?.(volumeRef.current)
      if (shouldPlay && volumeRef.current > 0) {
        player.unMute?.()
      }

      const loadedNextVideo = ensureRequestedVideoLoaded(videoId, { shouldPlay })

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
  }, [ensureRequestedVideoLoaded, isPlayerReady])

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
          const player = playerRef.current

          if (!player) {
            return
          }

          ensureRequestedVideoLoaded(videoId, { shouldPlay: true })
          player.unMute?.()
          player.setVolume?.(volumeRef.current)
          player.playVideo?.()
        } catch {
          // The IFrame API can throw while a video is still loading. Retries handle that path.
        }
      }, delay)

      playSyncTimersRef.current.push(timerId)
    })
  }, [ensureRequestedVideoLoaded])

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
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      isPlayerCreationPendingRef.current = false
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
    onPlaybackStateChangeRef.current = onPlaybackStateChange
  }, [onPlaybackStateChange])

  useEffect(() => {
    onPlaybackLoadingChangeRef.current = onPlaybackLoadingChange
  }, [onPlaybackLoadingChange])

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
  }, [onProgressChange])

  useEffect(() => {
    onTrackEndRef.current = onTrackEnd
  }, [onTrackEnd])

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
    setPlaybackLoading(false)
    onProgressChange?.(0)
    onPlaybackStateChange?.(false)

    try {
      playerRef.current?.stopVideo?.()
    } catch {
      // Ignore occasional transient YouTube API errors.
    }
  }, [clearPlaySyncTimers, currentTrack?.youtubeVideoId, onPlaybackStateChange, onProgressChange, setPlaybackLoading])

  useEffect(() => {
    if (
      !currentTrack?.youtubeVideoId ||
      playerRef.current ||
      isPlayerCreationPendingRef.current ||
      !audioHostRef.current
    ) {
      return undefined
    }

    const initialVideoId = currentTrack.youtubeVideoId
    isPlayerCreationPendingRef.current = true

    loadYouTubeIframeApi()
      .then((YT) => {
        if (!isMountedRef.current || !audioHostRef.current || playerRef.current) {
          isPlayerCreationPendingRef.current = false
          return
        }

        playerRef.current = new YT.Player(audioHostRef.current, {
          height: '200',
          width: '200',
          videoId: initialVideoId,
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
              if (!isMountedRef.current) {
                return
              }

              isPlayerCreationPendingRef.current = false
              setIsPlayerReady(true)
              configureYouTubeIframe(playerRef.current)
              loadedVideoIdRef.current = getLoadedYouTubeVideoId(playerRef.current) || initialVideoId
              try {
                const readyVideoId = currentVideoIdRef.current || initialVideoId

                playerRef.current?.setVolume(volumeRef.current)
                ensureRequestedVideoLoaded(readyVideoId, { shouldPlay: isPlayingRef.current })

                if (isPlayingRef.current) {
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
                setPlaybackLoading(false)
                try {
                  playerRef.current?.pauseVideo()
                } catch {
                  // Ignore occasional transient YouTube API errors.
                }
                return
              }

              if (event.data === playerStates.PLAYING) {
                setPlaybackLoading(false)
                fallbackTickRef.current = performance.now()
                return
              }

              if (event.data === playerStates.BUFFERING) {
                if (isPlayingRef.current) {
                  setPlaybackLoading(true)
                }
                fallbackTickRef.current = performance.now()
                return
              }

              if (event.data === playerStates.CUED) {
                fallbackTickRef.current = performance.now()
                if (isPlayingRef.current) {
                  setPlaybackLoading(true)
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
                  setPlaybackLoading(true)
                  scheduleDirectPlayRetries()
                } else {
                  setPlaybackLoading(false)
                }
                return
              }

              if (event.data === playerStates.ENDED) {
                clearPlaySyncTimers()
                isPlayingRef.current = false
                setPlaybackLoading(false)
                progressValueRef.current = 100
                onProgressChangeRef.current?.(100)
                onPlaybackStateChangeRef.current?.(false)
                onTrackEndRef.current?.()
              }
            },
          },
        })
      })
      .catch(() => {
        isPlayerCreationPendingRef.current = false
        if (isMountedRef.current) {
          setIsPlayerReady(false)
        }
      })
  }, [clearPlaySyncTimers, currentTrack?.youtubeVideoId, ensureRequestedVideoLoaded, scheduleDirectPlayRetries, setPlaybackLoading])

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
    setPlaybackLoading(Boolean(desiredShouldPlay && videoId), currentTrack?.id || null)

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
    setPlaybackLoading,
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
    if (!currentTrack?.youtubeVideoId) {
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
      const tickNow = performance.now()
      let nextPercent = null
      let usedPlayerTimeline = false
      let canUseFallbackTimeline = false

      try {
        const playerStates = window.YT?.PlayerState || {}
        const playerState = Number(playerRef.current?.getPlayerState?.())
        const duration = Number(playerRef.current?.getDuration?.() || 0)
        const currentTime = Number(playerRef.current?.getCurrentTime?.() || 0)
        const loadedPlayerVideoId = getLoadedYouTubeVideoId(playerRef.current)
        const playerVideoMismatch = Boolean(
          currentVideoIdRef.current &&
          loadedPlayerVideoId &&
          loadedPlayerVideoId !== currentVideoIdRef.current,
        )
        const playerTimelineActive =
          playerState === playerStates.PLAYING ||
          playerState === playerStates.BUFFERING
        const playerActivelyPlaying = playerState === playerStates.PLAYING

        canUseFallbackTimeline = playerActivelyPlaying || currentTime > 0

        if (
          isPlayingRef.current &&
          playerRef.current &&
          (!playerTimelineActive || playerVideoMismatch)
        ) {
          ensureRequestedVideoLoaded(currentVideoIdRef.current, { shouldPlay: true })
          playerRef.current.unMute?.()
          playerRef.current.setVolume?.(volumeRef.current)
          playerRef.current.playVideo?.()
        }

        if (duration > 0 && currentTime >= 0 && !playerVideoMismatch) {
          if (playerTimelineActive || currentTime > 0) {
            usedPlayerTimeline = playerActivelyPlaying
            if (playerActivelyPlaying || !isPlayingRef.current) {
              setPlaybackLoading(false)
            }
            nextPercent = Math.min((currentTime / duration) * 100, 100)
          }
        }
      } catch {
        // Ignore occasional transient YouTube API errors.
      }

      if (!isPlayingRef.current) {
        fallbackTickRef.current = tickNow
      }

      if (
        nextPercent === null &&
        isPlayingRef.current &&
        canUseFallbackTimeline &&
        trackDurationSeconds > 0
      ) {
        const previousTick = fallbackTickRef.current || tickNow
        const elapsedMs = Math.max(tickNow - previousTick, 0)
        const elapsedPercent = (elapsedMs / (trackDurationSeconds * 1000)) * 100

        nextPercent = Math.min(progressValueRef.current + elapsedPercent, 99.5)
      }

      if (nextPercent !== null) {
        fallbackTickRef.current = tickNow
        progressValueRef.current = nextPercent
        if (!isScrubbingRef.current) {
          onProgressChange?.(nextPercent)
        }

        if (!isScrubbingRef.current && usedPlayerTimeline && nextPercent >= 100) {
          onTrackEnd?.()
        }
      }
    }, 500)

    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [currentTrack?.youtubeVideoId, ensureRequestedVideoLoaded, onProgressChange, onTrackEnd, setPlaybackLoading, trackDurationSeconds])

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

  const footerClassName = [
    'fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md',
    isDarkMode ? 'border-white/60 bg-black text-white' : 'border-zinc-300 bg-zinc-50/95 text-zinc-900',
  ].join(' ')
  const rangeThemeClass = isDarkMode ? 'range-control-dark' : ''
  const displayVolume = clampPercent(volume)

  if (!currentTrack) {
    return (
      <footer ref={footerRef} className={footerClassName}>
        <div className="mx-auto grid max-w-[120rem] grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,18rem)_1fr_auto] md:items-center md:gap-5 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={[
                'grid h-10 w-10 shrink-0 place-items-center rounded-lg border',
                isDarkMode ? 'border-white/60 bg-zinc-950 text-zinc-300' : 'border-zinc-300 bg-white text-zinc-500',
              ].join(' ')}
            >
              <PlayIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">No track loaded</p>
              <p className={`truncate text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
                Waiting for the first discovery.
              </p>
              <p className={`truncate text-[11px] ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>
                Player idle
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-4">
              {!hideSwipeActions && (
                <button
                  type="button"
                  disabled
                  className={[
                    'grid h-8 w-8 place-items-center rounded-full border opacity-50',
                    isDarkMode ? 'border-white/60 bg-black' : 'border-zinc-300 bg-white',
                  ].join(' ')}
                  aria-label="Skip unavailable"
                >
                  <img src={SKIP_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
                </button>
              )}
              <button
                type="button"
                disabled
                className={[
                  'grid h-8 w-8 place-items-center rounded-full border opacity-50',
                  isDarkMode ? 'border-white/60 bg-black text-white' : 'border-zinc-300 bg-white text-zinc-500',
                ].join(' ')}
                aria-label="Play unavailable"
              >
                <PlayIcon />
              </button>
              {!hideSwipeActions && (
                <button
                  type="button"
                  disabled
                  className={[
                    'grid h-8 w-8 place-items-center rounded-full border opacity-50',
                    isDarkMode ? 'border-white/60 bg-black' : 'border-zinc-300 bg-white',
                  ].join(' ')}
                  aria-label="Save unavailable"
                >
                  <img src={SAVE_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
                </button>
              )}
              {!hideSwipeActions && (
                <button
                  type="button"
                  disabled
                  className={[
                    'grid h-8 w-8 place-items-center rounded-full border opacity-50',
                    isDarkMode ? 'border-white/60 bg-black' : 'border-zinc-300 bg-white',
                  ].join(' ')}
                  aria-label="Gem unavailable"
                >
                  <img src={GEM_ICON_SRC} alt="" className="h-5 w-5" draggable={false} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`mono w-10 text-right text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>0:00</span>
              <div className="flex flex-1 items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value="0"
                  readOnly
                  disabled
                  className={`range-control ${rangeThemeClass}`}
                  style={{ '--range-fill': '0%' }}
                  aria-label="Playback progress unavailable"
                />
              </div>
              <span className={`mono w-10 text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>0:00</span>
              <label className={`ml-1 flex items-center gap-2 opacity-70 ${isDarkMode ? 'text-white' : 'text-zinc-600'}`}>
                <VolumeIcon volume={volume} />
                <div className="flex w-24 items-center">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={displayVolume}
                    readOnly
                    disabled
                    className={`range-control range-control-compact ${rangeThemeClass}`}
                    style={{ '--range-fill': `${displayVolume}%` }}
                    aria-label="Volume unavailable"
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <span
              className={[
                'mono rounded-lg border px-2 py-1 text-xs',
                isDarkMode ? 'border-white/60 bg-black text-white' : 'border-zinc-300 bg-white text-zinc-600',
              ].join(' ')}
            >
              Queue {queueCount}
            </span>
          </div>
        </div>
      </footer>
    )
  }

  const totalSeconds = trackDurationSeconds
  const displayProgress = isScrubbing && scrubPercent !== null ? scrubPercent : progress
  const elapsedSeconds = (displayProgress / 100) * totalSeconds
  const durationLabel = totalSeconds > 0 ? formatTime(totalSeconds) : currentTrack.duration

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
      className={footerClassName}
    >
      <div className="mx-auto grid max-w-[120rem] grid-cols-1 gap-2 px-4 py-2 md:grid-cols-[minmax(0,18rem)_1fr_auto] md:items-center md:gap-5 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={currentTrack.artworkUrl}
            alt={currentTrack.title}
            className={`aspect-square h-10 w-10 rounded-lg border object-cover ${isDarkMode ? 'border-white/60' : 'border-zinc-300'}`}
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentTrack.title}</p>
            <p className={`truncate text-xs ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{currentTrack.artist}</p>
            <p className={`truncate text-[11px] ${isDarkMode ? 'text-zinc-300' : 'text-zinc-500'}`}>{currentTrack.channelTitle}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-4">
            {!hideSwipeActions && (
              <button
                type="button"
                onClick={onSwipeSkip}
                disabled={!canSwipeActions}
                className={[
                  'tooltip-anchor grid h-8 w-8 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDarkMode
                    ? 'border-red-400 bg-red-500 text-white hover:bg-red-400'
                    : 'border-red-500 bg-red-500 text-white hover:bg-red-400',
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
                'tooltip-anchor grid h-8 w-8 place-items-center rounded-full border transition',
                isDarkMode
                  ? 'border-white/60 bg-black text-white hover:bg-zinc-900'
                  : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700',
              ].join(' ')}
              aria-label={isPlaybackLoading ? 'Loading track' : isPlaying ? 'Pause' : 'Play'}
              data-tooltip={isPlaybackLoading ? 'Loading track' : isPlaying ? 'Pause playback' : 'Play track'}
            >
              {isPlaybackLoading ? (
                <span className="playback-loading-spinner playback-loading-spinner-sm" aria-hidden="true" />
              ) : isPlaying ? (
                <PauseIcon />
              ) : (
                <PlayIcon />
              )}
            </button>
            {!hideSwipeActions && (
              <button
                type="button"
                onClick={onSwipeSave}
                disabled={!canSwipeActions}
                className={[
                  'tooltip-anchor grid h-8 w-8 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isSwipeTrackLiked
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : isDarkMode
                      ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500',
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
                  'tooltip-anchor grid h-8 w-8 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
                  isDarkMode
                    ? 'border-amber-400 bg-amber-400 text-zinc-950 hover:bg-amber-300'
                    : 'border-amber-400 bg-amber-300 text-amber-950 hover:bg-amber-200',
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
