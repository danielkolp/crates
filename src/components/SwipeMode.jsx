import { useEffect, useMemo, useRef, useState } from 'react'
import { publicAsset } from '../utils/assetUrl'
import { getGenreFilterOptions } from '../utils/filterTracks'
import GenreDropdown from './GenreDropdown'

const HINT_IDLE_DELAY_MS = 5000
const HINT_REPEAT_MS = 12000
const HINT_ANIMATION_MS = 3600
const GEM_REASON_TYPE_SPEED_MS = 15
const DEFAULT_GEM_REASON = 'Underground balance across views and engagement'
const SKIP_ICON_SRC = publicAsset('images/x.png')
const SAVE_ICON_SRC = publicAsset('images/heart.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`
}

function toRgba(rgb, alpha) {
  const values = String(rgb).match(/\d+/g)
  if (!values || values.length < 3) {
    return `rgba(0, 0, 0, ${alpha})`
  }

  return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toRgbString(color) {
  return `rgb(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)})`
}

function mixRgb(colorA, colorB, blend) {
  const ratio = Math.max(0, Math.min(Number(blend) || 0, 1))
  return {
    r: (colorA.r * (1 - ratio)) + (colorB.r * ratio),
    g: (colorA.g * (1 - ratio)) + (colorB.g * ratio),
    b: (colorA.b * (1 - ratio)) + (colorB.b * ratio),
  }
}

function getLuminance(color) {
  return (0.2126 * color.r) + (0.7152 * color.g) + (0.0722 * color.b)
}

function getSaturation(color) {
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  if (max === 0) {
    return 0
  }

  return (max - min) / max
}

function getColorDistance(colorA, colorB) {
  const deltaR = colorA.r - colorB.r
  const deltaG = colorA.g - colorB.g
  const deltaB = colorA.b - colorB.b
  return Math.sqrt((deltaR * deltaR) + (deltaG * deltaG) + (deltaB * deltaB))
}

function SwipeMode({
  track,
  nextTracks,
  tracks = [],
  filters = {},
  onChangeFilters,
  isLoading = false,
  isDarkMode = false,
  isLiked = false,
  onSave,
  onSkip,
  onGem,
  onThemeChange,
}) {
  const cardRef = useRef(null)
  const dragSessionRef = useRef({ pointerId: null, startX: 0, startY: 0 })
  const releaseTimerRef = useRef(null)
  const previousUserSelectRef = useRef('')
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [queuedAction, setQueuedAction] = useState(null)
  const [dynamicTheme, setDynamicTheme] = useState(null)
  const [isHintActive, setIsHintActive] = useState(false)
  const [interactionTick, setInteractionTick] = useState(0)
  const [typedGemReason, setTypedGemReason] = useState('')

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) {
        window.clearTimeout(releaseTimerRef.current)
      }
      document.body.style.userSelect = previousUserSelectRef.current
    }
  }, [])

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 })
    setIsDragging(false)
    setQueuedAction(null)
    setIsHintActive(false)
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [track?.id])

  useEffect(() => {
    if (!track?.id) {
      setTypedGemReason('')
      return undefined
    }

    const fullReason = track.gemReason || DEFAULT_GEM_REASON
    let characterIndex = 0
    setTypedGemReason('')

    const typingInterval = window.setInterval(() => {
      characterIndex += 2
      setTypedGemReason(fullReason.slice(0, characterIndex))
      if (characterIndex >= fullReason.length) {
        window.clearInterval(typingInterval)
      }
    }, GEM_REASON_TYPE_SPEED_MS)

    return () => {
      window.clearInterval(typingInterval)
    }
  }, [track?.gemReason, track?.id])

  useEffect(() => {
    if (!track?.id || isDragging || queuedAction) {
      setIsHintActive(false)
      return undefined
    }

    let repeatTimer = null
    let hintResetTimer = null

    const triggerHint = () => {
      setIsHintActive(true)
      if (hintResetTimer) {
        window.clearTimeout(hintResetTimer)
      }
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
      if (repeatTimer) {
        window.clearInterval(repeatTimer)
      }
      if (hintResetTimer) {
        window.clearTimeout(hintResetTimer)
      }
    }
  }, [interactionTick, isDragging, queuedAction, track?.id])

  useEffect(() => {
    if (!track?.artworkUrl) {
      setDynamicTheme(null)
      return
    }

    let isCancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (isCancelled) {
        return
      }

      try {
        const canvas = document.createElement('canvas')
        canvas.width = 24
        canvas.height = 24
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const buckets = new Map()

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const idx = (y * canvas.width + x) * 4
            const r = pixels[idx]
            const g = pixels[idx + 1]
            const b = pixels[idx + 2]
            const alpha = pixels[idx + 3]
            if (alpha < 120) {
              continue
            }

            const bucketR = clampChannel(Math.round(r / 32) * 32)
            const bucketG = clampChannel(Math.round(g / 32) * 32)
            const bucketB = clampChannel(Math.round(b / 32) * 32)
            const key = `${bucketR}-${bucketG}-${bucketB}`
            const existing = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
            existing.count += 1
            existing.r += r
            existing.g += g
            existing.b += b
            buckets.set(key, existing)
          }
        }

        const palette = [...buckets.values()]
          .sort((left, right) => right.count - left.count)
          .slice(0, 10)
          .map((bucket) => ({
            r: bucket.r / Math.max(bucket.count, 1),
            g: bucket.g / Math.max(bucket.count, 1),
            b: bucket.b / Math.max(bucket.count, 1),
          }))

        if (palette.length === 0) {
          setDynamicTheme(null)
          return
        }

        const paletteByLightness = [...palette].sort((left, right) => getLuminance(left) - getLuminance(right))
        let mainColor = paletteByLightness[0]
        let textColor = paletteByLightness[paletteByLightness.length - 1]

        if (getLuminance(mainColor) > 95) {
          mainColor = mixRgb(mainColor, { r: 0, g: 0, b: 0 }, 0.45)
        }

        if (getLuminance(textColor) < 185) {
          textColor = mixRgb(textColor, { r: 255, g: 255, b: 255 }, 0.55)
        }

        const accentCandidate = [...palette]
          .filter((candidate) => getColorDistance(candidate, mainColor) >= 70)
          .sort((left, right) => getSaturation(right) - getSaturation(left))[0]
        const accentColor = accentCandidate || textColor

        const surfaceColor = mixRgb(mainColor, accentColor, 0.16)
        const cardColor = mixRgb(mainColor, accentColor, 0.22)
        const mutedTextColor = mixRgb(textColor, mainColor, 0.22)

        const mainColorText = toRgbString(mainColor)
        const surfaceColorText = toRgbString(surfaceColor)
        const cardColorText = toRgbString(cardColor)
        const accentColorText = toRgbString(accentColor)
        const textColorText = toRgbString(textColor)
        const mutedTextColorText = toRgbString(mutedTextColor)

        setDynamicTheme({
          mainColor: mainColorText,
          surfaceColor: surfaceColorText,
          cardColor: cardColorText,
          accentColor: accentColorText,
          textColor: textColorText,
          mutedTextColor: mutedTextColorText,
          borderColor: toRgba(textColorText, 0.34),
          softBorderColor: toRgba(textColorText, 0.22),
          panelBackground: `linear-gradient(140deg, ${mainColorText} 0%, ${surfaceColorText} 56%, ${cardColorText} 100%)`,
          articleBackground: `linear-gradient(150deg, ${surfaceColorText} 0%, ${mainColorText} 100%)`,
          cardBackground: `linear-gradient(180deg, ${cardColorText} 0%, ${mainColorText} 100%)`,
          mutedBackground: toRgba(cardColorText, 0.95),
          chipBackground: toRgba(accentColorText, 0.2),
        })
      } catch {
        setDynamicTheme(null)
      }
    }

    img.onerror = () => {
      setDynamicTheme(null)
    }

    img.src = track.artworkUrl

    return () => {
      isCancelled = true
    }
  }, [track?.artworkUrl])

  useEffect(() => {
    onThemeChange?.(dynamicTheme)
  }, [dynamicTheme, onThemeChange])

  useEffect(() => {
    if (!isDragging) {
      return undefined
    }

    function handleWindowPointerMove(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) {
        return
      }

      const deltaX = event.clientX - dragSessionRef.current.startX
      const deltaY = event.clientY - dragSessionRef.current.startY
      setDragOffset({ x: deltaX, y: deltaY })
    }

    function resetBodySelection() {
      document.body.style.userSelect = previousUserSelectRef.current
    }

    function finishDrag(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) {
        return
      }

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

    function handleWindowPointerUp(event) {
      finishDrag(event)
    }

    function handleWindowPointerCancel(event) {
      if (event.pointerId !== dragSessionRef.current.pointerId) {
        return
      }

      dragSessionRef.current = { pointerId: null, startX: 0, startY: 0 }
      resetBodySelection()
      setQueuedAction(null)
      setIsDragging(false)
      setDragOffset({ x: 0, y: 0 })
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
    }
  }, [isDragging, onGem, onSave, onSkip])

  const direction = useMemo(() => {
    if (dragOffset.x < -40) {
      return 'left'
    }

    if (dragOffset.x > 40) {
      return 'right'
    }

    if (dragOffset.y > 40) {
      return 'down'
    }

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
  const mutedLabelStyle = dynamicTheme
    ? { color: toRgba(dynamicTheme.textColor, 0.72) }
    : undefined
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

  function noteSwipeInteraction() {
    setIsHintActive(false)
    setInteractionTick((previousTick) => previousTick + 1)
  }

  function startDrag(event) {
    if (event.target.closest('button, select, input, a')) {
      return
    }

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

  function handleButtonAction(action) {
    if (!track) {
      return
    }

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
  }

  function updateSwipeStyle(value) {
    onChangeFilters?.((prev) => ({
      ...prev,
      genre: value,
      style: value,
    }))
  }

  if (isLoading) {
    return (
      <section className={`panel flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 md:p-4 ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
        <header className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={`h-7 w-40 ${skeletonLineClass}`} />
            <div className={`h-3 w-28 ${skeletonLineClass}`} />
          </div>
          <div className={`h-8 w-28 ${skeletonLineClass}`} />
        </header>

        <article className={`grid h-full min-h-0 grid-cols-1 gap-3 rounded-2xl border p-2 md:grid-cols-[minmax(0,1fr)_300px] md:p-3 ${isDarkMode ? 'border-white/15 bg-black/50' : 'border-zinc-200 bg-zinc-50'}`}>
          <div className="space-y-3">
            <div className={`mx-auto h-[56vh] max-h-[560px] w-full max-w-xl ${skeletonBlockClass}`} />
            <div className={`mx-auto h-10 w-44 rounded-full ${skeletonLineClass}`} />
          </div>
          <div className="space-y-2">
            <div className={`h-16 ${skeletonBlockClass}`} />
            <div className={`h-16 ${skeletonBlockClass}`} />
            <div className={`h-20 ${skeletonBlockClass}`} />
            <div className={`h-24 ${skeletonBlockClass}`} />
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
          <p className={isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}>Adjust filters or search to refill swipe mode.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      className={[
        'panel flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 md:p-4',
        darkFallbackActive ? 'border-white/15 bg-zinc-950 text-white' : '',
      ].join(' ')}
      style={sectionStyle}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl" style={{ color: themedTextColor }}>Swipe Mode</h2>
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
          'mx-auto grid h-full min-h-0 w-full max-w-6xl grid-cols-1 gap-3 rounded-2xl border p-2 md:grid-cols-[minmax(0,1fr)_300px] md:p-3',
          darkFallbackActive ? 'border-white/15 bg-black/50' : 'border-zinc-200 bg-zinc-50',
        ].join(' ')}
        style={articleStyle}
      >
        <div className="flex min-h-0 flex-col justify-start gap-2 pr-1">
          <div className="relative mx-auto w-full max-w-xl overflow-visible px-6 pb-6 pt-1">
              <div
                className="pointer-events-none absolute left-0 top-12 z-20 transition-all duration-150"
                style={{ opacity: direction === 'left' ? Math.min(progressOpacity, 1) : 0 }}
              >
                <img
                  src={SKIP_ICON_SRC}
                  alt="Skip"
                  className="h-16 w-16 select-none md:h-20 md:w-20"
                  style={{ transform: `scale(${1 + (Math.min(progressOpacity, 1) * 0.45)})` }}
                  draggable={false}
                />
              </div>

              <div
                className="pointer-events-none absolute right-0 top-12 z-20 transition-all duration-150"
                style={{ opacity: direction === 'right' ? Math.min(progressOpacity, 1) : 0 }}
              >
                <img
                  src={SAVE_ICON_SRC}
                  alt="Save"
                  className="h-16 w-16 select-none md:h-20 md:w-20"
                  style={{ transform: `scale(${1 + (Math.min(progressOpacity, 1) * 0.45)})` }}
                  draggable={false}
                />
              </div>

              <div
                className="pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2 transition-all duration-150"
                style={{ opacity: direction === 'down' ? Math.min(gemOpacity, 1) : 0 }}
              >
                <img
                  src={GEM_ICON_SRC}
                  alt="Gem"
                  className="h-16 w-16 select-none md:h-20 md:w-20"
                  style={{ transform: `scale(${1 + (Math.min(gemOpacity, 1) * 0.45)})` }}
                  draggable={false}
                />
              </div>

              <div className={`relative z-20 ${isHintActive && !isDragging && !queuedAction ? 'swipe-card-hint' : ''}`}>
                <div
                  ref={cardRef}
                  className="relative overflow-hidden rounded-2xl border-2"
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

                    <img
                      src={track.artworkUrl}
                      alt={track.title}
                      className="h-[26vh] min-h-[150px] max-h-[240px] w-full object-cover select-none"
                      loading="lazy"
                      draggable={false}
                    />
                    <div className="p-3 pb-3">
                      <div className="space-y-0.5">
                        <p className="text-xl font-semibold tracking-tight md:text-2xl">{track.title}</p>
                        <p className="text-sm md:text-base" style={{ color: themedMutedTextColor }}>{track.artist}</p>
                        <p className="text-xs" style={{ color: themedMutedTextColor }}>{track.channelTitle}</p>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs md:grid-cols-4">
                        <div className="rounded-xl border p-2" style={themedBoxStyle}>
                          <p className="muted-label mb-1" style={mutedLabelStyle}>Views</p>
                          <p className="font-semibold">{track.views.toLocaleString('en-US')}</p>
                        </div>
                        <div className="rounded-xl border p-2" style={themedBoxStyle}>
                          <p className="muted-label mb-1" style={mutedLabelStyle}>Likes</p>
                          <p className="font-semibold">{track.likes.toLocaleString('en-US')}</p>
                        </div>
                        <div className="rounded-xl border p-2" style={themedBoxStyle}>
                          <p className="muted-label mb-1" style={mutedLabelStyle}>Comments</p>
                          <p className="font-semibold">{track.comments.toLocaleString('en-US')}</p>
                        </div>
                        <div className="rounded-xl border p-2" style={themedBoxStyle}>
                          <p className="muted-label mb-1" style={mutedLabelStyle}>Gem Score</p>
                          <p className="font-semibold">{track.gemScore.toFixed(1)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="absolute inset-0 z-10 pointer-events-auto"
                    onPointerDown={startDrag}
                  >
                    <span className="sr-only">Swipe interaction layer</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px]" style={{ color: themedMutedTextColor }}>Swipe left for X, right for heart, down for diamond</p>

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
            </div>
          </div>

        <div className="flex min-h-0 flex-col gap-2 pr-1">
          <div className="grid grid-cols-1 gap-1.5 text-sm">
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
            <p className="text-xs">{typedGemReason || '\u00A0'}</p>
          </div>

          <div className="rounded-xl border p-2.5" style={themedBoxStyle}>
            <p className="muted-label mb-2" style={mutedLabelStyle}>Tags</p>
            <div className="flex flex-wrap gap-2">
              {track.tags.map((tag) => (
                <span key={tag} className="chip" style={tagChipStyle}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dashed p-2.5" style={themedBoxStyle}>
            <p className="muted-label mb-2" style={mutedLabelStyle}>Preloaded Next</p>
            <div className="space-y-1">
              {nextTracks.length === 0 && <p className="text-sm" style={{ color: themedMutedTextColor }}>No next tracks.</p>}
              {nextTracks.map((nextTrack, index) => (
                <p key={nextTrack.id} className="text-xs">
                  {index + 1}. {nextTrack.title} - {nextTrack.artist}
                </p>
              ))}
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

export default SwipeMode
