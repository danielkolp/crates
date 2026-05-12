import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BsPauseFill, BsPlayFill } from 'react-icons/bs'
import { publicAsset } from '../utils/assetUrl'
import { getGenreFilterOptions } from '../utils/filterTracks'
import { toRgba, useArtworkTheme } from '../hooks/useArtworkTheme'
import ColorBends from '../reactbits/ColorBends'
import GenreDropdown from './GenreDropdown'
import PlaylistSaver from './PlaylistSaver'
import TrackSearchLinks from './TrackSearchLinks'

const HINT_IDLE_DELAY_MS = 5000
const HINT_REPEAT_MS = 12000
const HINT_ANIMATION_MS = 3600
const GEM_REASON_TYPE_SPEED_MS = 15
const DEFAULT_GEM_REASON = 'Underground balance across views and engagement'
const SKIP_ICON_SRC = publicAsset('images/x.png')
const SAVE_ICON_SRC = publicAsset('images/heart.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')
const DARK_BEND_FALLBACK_COLORS = ['rgb(16, 185, 129)', 'rgb(34, 211, 238)', 'rgb(250, 204, 21)', 'rgb(244, 244, 245)']
const LIGHT_MODE_CREAM_RGB = 'rgb(252, 250, 246)'
const LIGHT_BEND_FALLBACK_COLORS = ['rgb(154, 217, 205)', 'rgb(167, 196, 245)', 'rgb(248, 217, 128)', 'rgb(236, 184, 166)']

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`
}

function mixRgbString(source, target, blend) {
  const sourceValues = String(source).match(/\d+(?:\.\d+)?/g)
  const targetValues = String(target).match(/\d+(?:\.\d+)?/g)

  if (!sourceValues || sourceValues.length < 3 || !targetValues || targetValues.length < 3) {
    return source
  }

  const ratio = Math.max(0, Math.min(Number(blend) || 0, 1))
  const values = [0, 1, 2].map((index) => {
    const sourceChannel = Number(sourceValues[index]) || 0
    const targetChannel = Number(targetValues[index]) || 0
    return Math.round(sourceChannel * (1 - ratio) + targetChannel * ratio)
  })

  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`
}

function isShortcutEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function SwipeMode({
  track,
  nextTracks,
  tracks = [],
  filters = {},
  onChangeFilters,
  playlists = [],
  isLoading = false,
  isDarkMode = false,
  isPlaying = false,
  isPlaybackLoading = false,
  isLiked = false,
  onSave,
  onSkip,
  onGem,
  onAddToPlaylist,
  onCreatePlaylist,
  onTogglePlayback,
  onThemeChange,
}) {
  const cardRef = useRef(null)
  const dragSessionRef = useRef({ pointerId: null, startX: 0, startY: 0 })
  const releaseTimerRef = useRef(null)
  const previousUserSelectRef = useRef('')

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [queuedAction, setQueuedAction] = useState(null)
  const [isHintActive, setIsHintActive] = useState(false)
  const [interactionTick, setInteractionTick] = useState(0)
  const [typedGemReason, setTypedGemReason] = useState('')
  const { artworkSrc, dynamicTheme, handleArtworkError } = useArtworkTheme(track?.artworkUrl, { isDarkMode })

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current)
      document.body.style.userSelect = previousUserSelectRef.current
    }
  }, [])

  useEffect(() => {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }

    const resetTimer = window.setTimeout(() => {
      setDragOffset({ x: 0, y: 0 })
      setIsDragging(false)
      setQueuedAction(null)
      setIsHintActive(false)
    }, 0)

    return () => window.clearTimeout(resetTimer)
  }, [track?.id])

  useEffect(() => {
    if (!track?.id) {
      const resetTimer = window.setTimeout(() => setTypedGemReason(''), 0)
      return () => window.clearTimeout(resetTimer)
    }

    const fullReason = track.gemReason || DEFAULT_GEM_REASON
    let characterIndex = 0

    const resetTimer = window.setTimeout(() => setTypedGemReason(''), 0)

    const typingInterval = window.setInterval(() => {
      characterIndex += 2
      setTypedGemReason(fullReason.slice(0, characterIndex))

      if (characterIndex >= fullReason.length) {
        window.clearInterval(typingInterval)
      }
    }, GEM_REASON_TYPE_SPEED_MS)

    return () => {
      window.clearTimeout(resetTimer)
      window.clearInterval(typingInterval)
    }
  }, [track?.gemReason, track?.id])

  useEffect(() => {
    if (!track?.id || isDragging || queuedAction) {
      const resetTimer = window.setTimeout(() => setIsHintActive(false), 0)
      return () => window.clearTimeout(resetTimer)
    }

    let repeatTimer = null
    let hintResetTimer = null

    const triggerHint = () => {
      setIsHintActive(true)

      if (hintResetTimer) window.clearTimeout(hintResetTimer)

      hintResetTimer = window.setTimeout(() => {
        setIsHintActive(false)
      }, HINT_ANIMATION_MS)
    }

    const idleTimer = window.setTimeout(() => {
      triggerHint()
      repeatTimer = window.setInterval(triggerHint, HINT_REPEAT_MS)
    }, HINT_IDLE_DELAY_MS)

    return () => {
      window.clearTimeout(idleTimer)
      if (repeatTimer) window.clearInterval(repeatTimer)
      if (hintResetTimer) window.clearTimeout(hintResetTimer)
    }
  }, [interactionTick, isDragging, queuedAction, track?.id])

  useEffect(() => {
    onThemeChange?.(dynamicTheme)
  }, [dynamicTheme, onThemeChange])

  useEffect(() => {
    if (!isDragging) return undefined

    function handleWindowPointerMove(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) return

      const deltaX = event.clientX - dragSessionRef.current.startX
      const deltaY = event.clientY - dragSessionRef.current.startY

      setDragOffset({ x: deltaX, y: deltaY })
    }

    function resetBodySelection() {
      document.body.style.userSelect = previousUserSelectRef.current
    }

    function finishDrag(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) return

      const deltaX = event.clientX - dragSessionRef.current.startX
      const deltaY = event.clientY - dragSessionRef.current.startY

      dragSessionRef.current = { pointerId: null, startX: 0, startY: 0 }
      resetBodySelection()

      if (deltaX < -120) {
        setQueuedAction('skip')
        setIsDragging(false)
        setDragOffset({ x: -window.innerWidth * 0.8, y: deltaY })

        releaseTimerRef.current = window.setTimeout(() => {
          onSkip()
          setQueuedAction(null)
          releaseTimerRef.current = null
        }, 240)

        return
      }

      if (deltaX > 120) {
        setQueuedAction('save')
        setIsDragging(false)
        setDragOffset({ x: window.innerWidth * 0.8, y: deltaY })

        releaseTimerRef.current = window.setTimeout(() => {
          onSave()
          setQueuedAction(null)
          releaseTimerRef.current = null
        }, 240)

        return
      }

      if (deltaY > 120) {
        setQueuedAction('gem')
        setIsDragging(false)
        setDragOffset({ x: deltaX, y: window.innerHeight * 0.7 })

        releaseTimerRef.current = window.setTimeout(() => {
          onGem()
          setQueuedAction(null)
          releaseTimerRef.current = null
        }, 240)

        return
      }

      setQueuedAction(null)
      setIsDragging(false)
      setDragOffset({ x: 0, y: 0 })
    }

    function handleWindowPointerCancel(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) return

      dragSessionRef.current = { pointerId: null, startX: 0, startY: 0 }
      resetBodySelection()
      setQueuedAction(null)
      setIsDragging(false)
      setDragOffset({ x: 0, y: 0 })
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', handleWindowPointerCancel)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [isDragging, onGem, onSave, onSkip])

  const direction = useMemo(() => {
    if (dragOffset.x < -40) return 'left'
    if (dragOffset.x > 40) return 'right'
    if (dragOffset.y > 40) return 'down'
    return null
  }, [dragOffset.x, dragOffset.y])

  const progressOpacity = Math.min(Math.abs(dragOffset.x) / 120, 1)
  const gemOpacity = Math.min(dragOffset.y / 120, 1)
  const transformX = queuedAction === 'skip' ? -window.innerWidth * 0.8 : queuedAction === 'save' ? window.innerWidth * 0.8 : dragOffset.x
  const transformY = queuedAction === 'gem' ? window.innerHeight * 0.7 : dragOffset.y
  const rotate = Math.max(Math.min(transformX / 18, 16), -16)

  const themedCardBackground = dynamicTheme?.cardBackground
  const themedCardBorderColor = dynamicTheme?.borderColor || 'rgba(228, 228, 231, 1)'
  const themedTextColor = dynamicTheme?.textColor || (isDarkMode ? 'rgb(255, 255, 255)' : 'rgb(24, 24, 27)')
  const themedMutedTextColor = dynamicTheme?.mutedTextColor || (isDarkMode ? 'rgb(212, 212, 216)' : 'rgb(113, 113, 122)')
  const colorBendColors = useMemo(
    () => {
      if (!dynamicTheme) {
        return isDarkMode ? DARK_BEND_FALLBACK_COLORS : LIGHT_BEND_FALLBACK_COLORS
      }

      if (isDarkMode) {
        return [
          mixRgbString(dynamicTheme.accentColor, 'rgb(255, 255, 255)', 0.24),
          mixRgbString(dynamicTheme.textColor, dynamicTheme.accentColor, 0.16),
          mixRgbString(dynamicTheme.surfaceColor, 'rgb(255, 255, 255)', 0.5),
          mixRgbString(dynamicTheme.cardColor, dynamicTheme.accentColor, 0.34),
          mixRgbString(dynamicTheme.mainColor, 'rgb(255, 255, 255)', 0.42),
        ]
      }

      return [
        mixRgbString(dynamicTheme.accentColor, LIGHT_MODE_CREAM_RGB, 0.46),
        mixRgbString(dynamicTheme.mainColor, LIGHT_MODE_CREAM_RGB, 0.26),
        mixRgbString(dynamicTheme.surfaceColor, 'rgb(255, 255, 255)', 0.18),
        mixRgbString(dynamicTheme.cardColor, 'rgb(255, 255, 255)', 0.12),
        mixRgbString(dynamicTheme.accentColor, 'rgb(255, 255, 255)', 0.68),
      ]
    },
    [dynamicTheme, isDarkMode],
  )

  const articleStyle = dynamicTheme
    ? {
        background: dynamicTheme.articleBackground,
        borderColor: dynamicTheme.softBorderColor,
        color: dynamicTheme.textColor,
      }
    : undefined

  const sectionStyle = dynamicTheme
    ? {
        background: dynamicTheme.panelBackground,
        borderColor: dynamicTheme.softBorderColor,
        color: dynamicTheme.textColor,
      }
    : undefined

  const themedBoxStyle = dynamicTheme
    ? {
        background: dynamicTheme.mutedBackground,
        borderColor: themedCardBorderColor,
        color: themedTextColor,
      }
    : isDarkMode
      ? {
          background: 'rgba(24, 24, 27, 0.86)',
          borderColor: 'rgba(255, 255, 255, 0.18)',
          color: 'rgb(255, 255, 255)',
        }
      : {
          background: 'rgb(255, 255, 255)',
          borderColor: 'rgba(228, 228, 231, 1)',
          color: 'rgb(24, 24, 27)',
        }

  const mutedLabelStyle = dynamicTheme ? { color: toRgba(dynamicTheme.textColor, 0.72) } : undefined

  const hintBadgeStyle = dynamicTheme
    ? {
        borderColor: dynamicTheme.borderColor,
        background: toRgba(dynamicTheme.textColor, 0.12),
        color: dynamicTheme.textColor,
      }
    : {
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.24)' : 'rgba(228, 228, 231, 1)',
        background: isDarkMode ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.95)',
        color: isDarkMode ? 'rgb(255, 255, 255)' : 'rgb(82, 82, 91)',
      }

  const actionButtonStyle = dynamicTheme
    ? {
        borderColor: dynamicTheme.borderColor,
        background: toRgba(dynamicTheme.textColor, 0.12),
      }
    : {
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.28)' : 'rgba(212, 212, 216, 1)',
        background: isDarkMode ? 'rgba(24, 24, 27, 0.92)' : 'rgb(255, 255, 255)',
        color: isDarkMode ? 'rgb(255, 255, 255)' : 'rgb(24, 24, 27)',
      }

  const saveActionButtonStyle = isLiked
    ? {
        ...actionButtonStyle,
        borderColor: 'rgba(16, 185, 129, 0.8)',
        background: dynamicTheme ? toRgba('rgb(16, 185, 129)', 0.22) : 'rgb(236, 253, 245)',
      }
    : actionButtonStyle

  const tagChipStyle = dynamicTheme
    ? {
        background: dynamicTheme.chipBackground,
        borderColor: dynamicTheme.borderColor,
        color: dynamicTheme.textColor,
      }
    : undefined

  const genreOptions = useMemo(() => getGenreFilterOptions(tracks), [tracks])
  const selectedStyle = filters.style && filters.style !== 'all' ? filters.style : filters.genre || 'all'

  const skeletonBlockClass = isDarkMode
    ? 'animate-pulse rounded-xl border border-white/15 bg-white/10'
    : 'animate-pulse rounded-xl border border-zinc-200 bg-white'

  const skeletonLineClass = isDarkMode
    ? 'animate-pulse rounded bg-white/20'
    : 'animate-pulse rounded bg-zinc-200'

  const darkFallbackActive = isDarkMode && !dynamicTheme

  const cardStyle = {
    transform: `translate3d(${transformX}px, ${transformY}px, 0) rotate(${rotate}deg)`,
    transition: isDragging ? 'none' : 'transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease, opacity 240ms ease',
    touchAction: 'none',
    userSelect: 'none',
    cursor: isDragging ? 'grabbing' : 'grab',
    background: themedCardBackground || (isDarkMode ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)'),
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.16)',
    borderColor:
      direction === 'left'
        ? 'rgba(239, 68, 68, 0.55)'
        : direction === 'right'
          ? 'rgba(16, 185, 129, 0.55)'
          : direction === 'down'
            ? 'rgba(245, 158, 11, 0.55)'
            : themedCardBorderColor,
    opacity: queuedAction ? 0.92 : 1,
  }

  const noteSwipeInteraction = useCallback(() => {
    setIsHintActive(false)
    setInteractionTick((previousTick) => previousTick + 1)
  }, [])

  function startDrag(event) {
    if (event.target.closest('button, select, input, a')) return

    event.preventDefault()
    noteSwipeInteraction()

    clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = null

    previousUserSelectRef.current = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }

    setQueuedAction(null)
    setIsDragging(true)

    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleButtonAction = useCallback((action) => {
    if (!track || queuedAction) return

    noteSwipeInteraction()

    if (action === 'skip') {
      setQueuedAction('skip')
      setDragOffset({ x: -window.innerWidth * 0.8, y: 0 })

      releaseTimerRef.current = window.setTimeout(() => {
        onSkip()
        setQueuedAction(null)
        releaseTimerRef.current = null
      }, 240)

      return
    }

    if (action === 'save') {
      setQueuedAction('save')
      setDragOffset({ x: window.innerWidth * 0.8, y: 0 })

      releaseTimerRef.current = window.setTimeout(() => {
        onSave()
        setQueuedAction(null)
        releaseTimerRef.current = null
      }, 240)

      return
    }

    setQueuedAction('gem')
    setDragOffset({ x: 0, y: window.innerHeight * 0.7 })

    releaseTimerRef.current = window.setTimeout(() => {
      onGem()
      setQueuedAction(null)
      releaseTimerRef.current = null
    }, 240)
  }, [noteSwipeInteraction, onGem, onSave, onSkip, queuedAction, track])

  useEffect(() => {
    if (!track || isLoading) return undefined

    function handleShortcut(event) {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isShortcutEditableTarget(event.target)
      ) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'arrowleft' || key === 'j') {
        event.preventDefault()
        handleButtonAction('skip')
        return
      }

      if (key === 'arrowright' || key === 'l') {
        event.preventDefault()
        handleButtonAction('save')
        return
      }

      if (key === 'arrowdown' || key === 'g') {
        event.preventDefault()
        handleButtonAction('gem')
        return
      }

      if (key === ' ' || key === 'k') {
        event.preventDefault()
        onTogglePlayback?.()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [handleButtonAction, isLoading, onTogglePlayback, track])

  function updateSwipeStyle(value) {
    onChangeFilters?.((prev) => ({
      ...prev,
      genre: value,
      style: value,
    }))
  }

  if (isLoading) {
    return (
      <section className={`panel swipe-mode-panel flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 md:p-4 ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={`h-7 w-40 ${skeletonLineClass}`} />
            <div className={`h-3 w-28 ${skeletonLineClass}`} />
          </div>
          <div className={`h-8 w-28 ${skeletonLineClass}`} />
        </header>

        <article className={`swipe-workspace grid min-h-0 flex-1 grid-cols-1 gap-3 rounded-2xl border p-2 md:grid-cols-[18rem_minmax(24rem,1fr)_20rem] md:p-3 ${isDarkMode ? 'border-white/15 bg-black/50' : 'border-zinc-200 bg-zinc-50'}`}>
          <div className={`h-full ${skeletonBlockClass}`} />
          <div className="min-h-0 space-y-3 overflow-hidden">
            <div className={`swipe-skeleton-card mx-auto w-full max-w-xl ${skeletonBlockClass}`} />
            <div className={`mx-auto h-10 w-44 rounded-full ${skeletonLineClass}`} />
          </div>
          <div className="space-y-2">
            <div className={`h-16 ${skeletonBlockClass}`} />
            <div className={`h-16 ${skeletonBlockClass}`} />
            <div className={`h-20 ${skeletonBlockClass}`} />
          </div>
        </article>
      </section>
    )
  }

  if (!track) {
    return (
      <section className={`panel grid h-full min-h-0 place-items-center p-8 ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'}`}>
        <div className="space-y-2 text-center">
          <p className="text-2xl font-semibold">No tracks in queue</p>
          <p className={isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}>Use the "regen" button on the bottom left to refill the crate.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      className={[
        'panel swipe-mode-panel flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 md:p-4',
        darkFallbackActive ? 'border-white/15 bg-zinc-950 text-white' : '',
      ].join(' ')}
      style={sectionStyle}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl" style={{ color: themedTextColor }}>
            Swipe Mode
          </h2>
        </div>

        {genreOptions.length > 0 && (
          <GenreDropdown
            value={selectedStyle}
            options={genreOptions}
            totalCount={tracks.length}
            onChange={updateSwipeStyle}
            align="right"
            className="min-w-52"
            style={dynamicTheme ? {
              '--genre-picker-bg': dynamicTheme.mutedBackground,
              '--genre-picker-border': dynamicTheme.borderColor,
              '--genre-picker-text': dynamicTheme.textColor,
              '--genre-picker-muted': toRgba(dynamicTheme.textColor, 0.64),
              '--genre-picker-hover': toRgba(dynamicTheme.textColor, 0.12),
              '--genre-picker-active-bg': toRgba(dynamicTheme.accentColor, 0.24),
              '--genre-picker-active-border': dynamicTheme.borderColor,
              '--genre-picker-active-text': dynamicTheme.textColor,
            } : undefined}
          />
        )}
      </header>

      <article
        className={[
          'swipe-workspace relative isolate mx-auto grid min-h-0 flex-1 w-full max-w-7xl grid-cols-1 gap-3 rounded-2xl border p-2 md:grid-cols-[18rem_minmax(24rem,1fr)_20rem] md:p-3',
          darkFallbackActive ? 'border-white/15 bg-black/50' : 'border-zinc-200 bg-zinc-50',
        ].join(' ')}
        style={articleStyle}
      >
        <div className="swipe-workspace-bends pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <ColorBends
            className="h-full w-full"
            colors={colorBendColors}
            rotation={125}
            speed={0.16}
            transparent={!isDarkMode}
            autoRotate={0.4}
            scale={0.95}
            frequency={0.82}
            warpStrength={1.05}
            mouseInfluence={0.22}
            parallax={0.18}
            noise={0.2}
            iterations={4}
            intensity={isDarkMode ? 1.85 : 1.18}
            bandWidth={isDarkMode ? 6.8 : 6.1}
            style={{
              opacity: isDarkMode ? 0.82 : 0.78,
              mixBlendMode: isDarkMode ? 'screen' : 'normal',
              filter: isDarkMode ? 'saturate(1.55) contrast(1.16)' : 'saturate(1.1) contrast(0.94) brightness(1.06)',
            }}
          />
        </div>

        <div className="swipe-left-panel relative z-10 flex min-h-0 flex-col gap-2 overflow-hidden">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-1">
            <div className="rounded-xl border p-2.5" style={themedBoxStyle}>
              <p className="muted-label mb-1" style={mutedLabelStyle}>Like Rate</p>
              <p className="font-semibold">{formatRate(track.likeRate || 0)}</p>
            </div>

            <div className="rounded-xl border p-2.5" style={themedBoxStyle}>
              <p className="muted-label mb-1" style={mutedLabelStyle}>Comment Rate</p>
              <p className="font-semibold">{formatRate(track.commentRate || 0)}</p>
            </div>
          </div>

          <div className="rounded-xl border p-2.5" style={themedBoxStyle}>
            <p className="muted-label mb-1" style={mutedLabelStyle}>Gem Reason</p>
            <p className="text-xs leading-relaxed">{typedGemReason || '\u00A0'}</p>
          </div>

          <div className="rounded-xl border p-2" style={themedBoxStyle}>
            <p className="muted-label mb-1" style={mutedLabelStyle}>Tags</p>
            <div className="flex flex-wrap gap-1 overflow-hidden">
              {track.tags.slice(0, 10).map((tag) => (
                <span key={tag} className="chip text-[10px]" style={tagChipStyle}>
                  {tag}
                </span>
              ))}
              {track.tags.length > 10 && (
                <span className="chip text-[10px]" style={tagChipStyle}>
                  +{track.tags.length - 10}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed p-2.5" style={themedBoxStyle}>
            <p className="muted-label mb-2" style={mutedLabelStyle}>Preloaded Next</p>
            <div className="space-y-1">
              {nextTracks.length === 0 && (
                <p className="text-sm" style={{ color: themedMutedTextColor }}>No next tracks.</p>
              )}

              {nextTracks.slice(0, 3).map((nextTrack, index) => (
                <p key={nextTrack.id} className="truncate text-xs">
                  {index + 1}. {nextTrack.title} - {nextTrack.artist}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="swipe-stage relative z-30 flex min-h-0 flex-col items-center justify-center gap-2 overflow-visible pr-0 md:pr-1">
          <div className="swipe-card-shell relative mx-auto w-full max-w-[360px] overflow-visible px-3 pb-1 pt-1 sm:px-5">
            <div
              className="pointer-events-none absolute left-0 top-12 z-50 transition-all duration-150"
              style={{ opacity: direction === 'left' ? Math.min(progressOpacity, 1) : 0 }}
            >
              <img
                src={SKIP_ICON_SRC}
                alt="Skip"
                className="h-16 w-16 select-none md:h-20 md:w-20"
                style={{ transform: `scale(${1 + Math.min(progressOpacity, 1) * 0.45})` }}
                draggable={false}
              />
            </div>

            <div
              className="pointer-events-none absolute right-0 top-12 z-50 transition-all duration-150"
              style={{ opacity: direction === 'right' ? Math.min(progressOpacity, 1) : 0 }}
            >
              <img
                src={SAVE_ICON_SRC}
                alt="Save"
                className="h-16 w-16 select-none md:h-20 md:w-20"
                style={{ transform: `scale(${1 + Math.min(progressOpacity, 1) * 0.45})` }}
                draggable={false}
              />
            </div>

            <div
              className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 transition-all duration-150"
              style={{ opacity: direction === 'down' ? Math.min(gemOpacity, 1) : 0 }}
            >
              <img
                src={GEM_ICON_SRC}
                alt="Gem"
                className="h-16 w-16 select-none md:h-20 md:w-20"
                style={{ transform: `scale(${1 + Math.min(gemOpacity, 1) * 0.45})` }}
                draggable={false}
              />
            </div>

            <div className={`relative z-10 ${isHintActive && !isDragging && !queuedAction ? 'swipe-card-hint' : ''}`}>
              <div
                ref={cardRef}
                className="swipe-card relative overflow-hidden rounded-2xl border-2"
                style={cardStyle}
              >
                <div className="pointer-events-none relative z-0 select-none">
                  <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] shadow-sm"
                      style={hintBadgeStyle}
                    >
                      SWIPE ME
                    </span>
                  </div>

                  <div className="swipe-card-artwork relative w-full overflow-hidden">
                    <img
                      src={artworkSrc}
                      alt={track.title}
                      className="absolute inset-0 h-full w-full select-none object-cover"
                      loading="lazy"
                      draggable={false}
                      onError={handleArtworkError}
                    />
                  </div>

                  <div className="swipe-card-meta p-2.5">
                    <div className="space-y-0.5">
                      <p className="swipe-card-title text-lg font-semibold tracking-tight md:text-xl">{track.title}</p>
                      <p className="text-sm" style={{ color: themedMutedTextColor }}>{track.artist}</p>
                      <p className="text-xs" style={{ color: themedMutedTextColor }}>{track.channelTitle}</p>
                    </div>

                    <div className="swipe-card-stats mt-2 grid grid-cols-2 gap-1 text-[11px] sm:text-xs md:grid-cols-4">
                      <div className="rounded-xl border p-1.5" style={themedBoxStyle}>
                        <p className="muted-label mb-1" style={mutedLabelStyle}>Views</p>
                        <p className="font-semibold text-xl">{track.views.toLocaleString('en-US')}</p>
                      </div>

                      <div className="rounded-xl border p-1.5" style={themedBoxStyle}>
                        <p className="muted-label mb-1" style={mutedLabelStyle}>Likes</p>
                        <p className="font-semibold text-xl">{track.likes.toLocaleString('en-US')}</p>
                      </div>

                      <div className="rounded-xl border p-1.5" style={themedBoxStyle}>
                        <p className="muted-label mb-1" style={mutedLabelStyle}>Comments</p>
                        <p className="font-semibold text-xl">{track.comments.toLocaleString('en-US')}</p>
                      </div>

                      <div className="rounded-xl border p-1.5" style={themedBoxStyle}>
                        <p className="muted-label mb-1" style={mutedLabelStyle}>Score</p>
                        <p className="font-semibold text-xl">{track.gemScore.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pointer-events-auto absolute inset-0 z-10" onPointerDown={startDrag}>
                  <span className="sr-only">Swipe interaction layer</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px]" style={{ color: themedMutedTextColor }}>
            Swipe left for X, right for heart, down for diamond
          </p>

          <div className="relative z-0 flex items-center justify-center gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={() => handleButtonAction('skip')}
              className="tooltip-anchor grid h-10 w-10 place-items-center rounded-full border text-lg font-semibold transition hover:opacity-85 md:h-11 md:w-11"
              style={actionButtonStyle}
              aria-label="Skip track"
              data-tooltip="Skip track"
            >
              <img src={SKIP_ICON_SRC} alt="" className="h-6 w-6" draggable={false} />
            </button>

            <button
              type="button"
              onClick={() => handleButtonAction('save')}
              className="tooltip-anchor grid h-10 w-10 place-items-center rounded-full border text-lg font-semibold transition hover:opacity-85 md:h-11 md:w-11"
              style={saveActionButtonStyle}
              aria-label="Save track"
              data-tooltip={isLiked ? 'Saved to liked' : 'Save track'}
            >
              <img src={SAVE_ICON_SRC} alt="" className="h-6 w-6" draggable={false} />
            </button>

            <button
              type="button"
              onClick={() => handleButtonAction('gem')}
              className="tooltip-anchor grid h-10 w-10 place-items-center rounded-full border text-lg font-semibold transition hover:opacity-85 md:h-11 md:w-11"
              style={actionButtonStyle}
              aria-label="Gem track"
              data-tooltip="Gem track"
            >
              <img src={GEM_ICON_SRC} alt="" className="h-6 w-6" draggable={false} />
            </button>

            <button
              type="button"
              onClick={onTogglePlayback}
              className="tooltip-anchor grid h-10 w-10 place-items-center rounded-full border text-sm font-bold transition hover:opacity-85 md:h-11 md:w-11"
              style={actionButtonStyle}
              aria-label={isPlaybackLoading ? 'Loading track' : isPlaying ? 'Pause track' : 'Play track'}
              data-tooltip={isPlaybackLoading ? 'Loading track' : isPlaying ? 'Pause track' : 'Play track'}
            >
              {isPlaybackLoading ? (
                <span className="playback-loading-spinner" aria-hidden="true" />
              ) : isPlaying ? (
                <BsPauseFill className="h-5 w-5" />
              ) : (
                <BsPlayFill className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="swipe-side-panel relative z-10 flex min-h-0 flex-col gap-2 overflow-hidden pr-1">
          <TrackSearchLinks
            track={track}
            variant="swipe"
            compact
            surfaceStyle={themedBoxStyle}
            labelStyle={mutedLabelStyle}
            linkStyle={dynamicTheme ? {
              background: dynamicTheme.mutedBackground,
              borderColor: dynamicTheme.borderColor,
              color: dynamicTheme.textColor,
            } : undefined}
          />

          <PlaylistSaver
            track={track}
            playlists={playlists}
            onAddToPlaylist={onAddToPlaylist}
            onCreatePlaylist={onCreatePlaylist}
            compact
            surfaceStyle={themedBoxStyle}
            labelStyle={mutedLabelStyle}
            controlStyle={dynamicTheme ? {
              background: dynamicTheme.mutedBackground,
              borderColor: dynamicTheme.borderColor,
              color: dynamicTheme.textColor,
            } : undefined}
          />
        </div>
      </article>
    </section>
  )
}

export default SwipeMode
