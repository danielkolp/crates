import { useEffect, useMemo, useRef, useState } from 'react'
import { publicAsset } from '../utils/assetUrl'

const LIGHT_LOGO_SRC = publicAsset('images/logo.png')
const DARK_LOGO_SRC = publicAsset('images/logo-darkmode.png')
const GEM_ICON_SRC = publicAsset('images/diamond.png')

const NAV_ITEMS = [
  { id: 'digger', label: 'Discover' },
  { id: 'swipe', label: 'Swipe Mode' },
  { id: 'crates', label: 'Playlists' },
  { id: 'liked', label: 'Liked' },
  { id: 'gems', label: 'Gems', icon: GEM_ICON_SRC },
  { id: 'history', label: 'History' },
  { id: 'how-it-works', label: 'How It Works' },
]

const GENRE_BPM = {
  'uk garage': 132,
  breaks: 130,
  'minimal house': 124,
  'bass house': 126,
  techno: 132,
  'deep house': 122,
  'progressive house': 126,
  electro: 128,
  'afro house': 123,
  'dub techno': 118,
  jungle: 168,
  'minimal techno': 129,
  leftfield: 124,
  'tech house': 126,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
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

function hashText(value) {
  return String(value || '').split('').reduce((hash, char) => hash + char.charCodeAt(0), 0)
}

function estimateTrackBpm(track) {
  const explicitBpm = Number(track?.bpm)
  if (Number.isFinite(explicitBpm) && explicitBpm >= 70 && explicitBpm <= 190) {
    return explicitBpm
  }

  const genreBpm = GENRE_BPM[String(track?.genre || '').toLowerCase()]
  if (Number.isFinite(genreBpm)) {
    return genreBpm
  }

  return 118 + (hashText(track?.youtubeVideoId || track?.id || 'track') % 18)
}

function Sidebar({
  activeScreen,
  onScreenChange,
  currentTrack = null,
  isPlaying = false,
  playbackProgress = 0,
  isDarkMode = false,
  crateSeed = '',
  onRegenerateSeed,
  onSetSeed,
}) {
  const logoRef = useRef(null)
  const progressSnapshotRef = useRef({ seconds: 0, updatedAt: 0 })
  const smoothImpactRef = useRef(0)
  const beatClockRef = useRef({ bpm: 124, phaseOffset: 0 })
  const [seedCopied, setSeedCopied] = useState(false)
  const seedCopyTimerRef = useRef(0)
  const displaySeed = String(crateSeed || '').trim()

  const playbackSnapshotSeconds = useMemo(() => {
    if (!currentTrack) {
      return 0
    }

    const durationSeconds = parseDuration(currentTrack.duration)
    if (durationSeconds <= 0) {
      return 0
    }

    const progressPercent = clamp(Number(playbackProgress) || 0, 0, 100)
    return (progressPercent / 100) * durationSeconds
  }, [currentTrack, playbackProgress])

  useEffect(() => {
    progressSnapshotRef.current = {
      seconds: playbackSnapshotSeconds,
      updatedAt: performance.now(),
    }
  }, [playbackSnapshotSeconds, isPlaying])

  useEffect(() => {
    beatClockRef.current = {
      bpm: estimateTrackBpm(currentTrack),
      phaseOffset: 0,
    }
  }, [currentTrack])

  useEffect(() => {
    const sources = [LIGHT_LOGO_SRC, DARK_LOGO_SRC]
    const preloaders = sources.map((src) => {
      const image = new Image()
      image.src = src
      if (typeof image.decode === 'function') {
        return image.decode().catch(() => undefined)
      }

      return Promise.resolve()
    })

    Promise.all(preloaders).catch(() => undefined)
  }, [])

  useEffect(() => () => {
    if (seedCopyTimerRef.current) {
      window.clearTimeout(seedCopyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let animationFrameId = 0

    const animateLogo = () => {
      const logo = logoRef.current
      if (logo) {
        const now = performance.now()
        const snapshot = progressSnapshotRef.current
        const snapshotUpdatedAt = snapshot.updatedAt > 0 ? snapshot.updatedAt : now
        const elapsedSeconds = isPlaying ? Math.max((now - snapshotUpdatedAt) / 1000, 0) : 0
        const playbackSeconds = snapshot.seconds + elapsedSeconds
        const beatClock = beatClockRef.current
        const beatPosition = ((playbackSeconds * (beatClock.bpm / 60)) + beatClock.phaseOffset) % 1

        const impact = Math.exp(-beatPosition * 16)
        const rebound = Math.exp(-Math.pow((beatPosition - 0.22) / 0.12, 2))
        const targetImpact = isPlaying ? clamp((impact * 0.92) + (rebound * 0.68), 0, 1) : 0

        const smoothImpact = smoothImpactRef.current + ((targetImpact - smoothImpactRef.current) * 0.23)
        smoothImpactRef.current = smoothImpact

        const squashAmount = smoothImpact * impact
        const stretchAmount = smoothImpact * rebound

        const scaleX = 1 + (squashAmount * 0.16) - (stretchAmount * 0.06)
        const scaleY = 1 - (squashAmount * 0.11) + (stretchAmount * 0.21)

        logo.style.transformOrigin = '50% 100%'
        logo.style.transform = `translate3d(0, 0, 0) scaleX(${scaleX.toFixed(4)}) scaleY(${scaleY.toFixed(4)})`
      }

      animationFrameId = window.requestAnimationFrame(animateLogo)
    }

    animationFrameId = window.requestAnimationFrame(animateLogo)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [isPlaying])

  async function handleCopySeed() {
    if (!displaySeed) {
      return
    }

    try {
      await navigator.clipboard.writeText(displaySeed)
      setSeedCopied(true)

      if (seedCopyTimerRef.current) {
        window.clearTimeout(seedCopyTimerRef.current)
      }

      seedCopyTimerRef.current = window.setTimeout(() => {
        setSeedCopied(false)
        seedCopyTimerRef.current = 0
      }, 1200)
    } catch {
      setSeedCopied(false)
    }
  }

  return (
    <aside className={`relative z-40 hidden h-full border-r border-zinc-200/40 bg-zinc-50/70 lg:flex lg:w-[15rem] lg:flex-col ${isDarkMode ? 'theme-dark-chrome' : ''}`}>
      <div className="border-b border-zinc-200/30 px-5 py-6">
        <div className="flex items-center justify-center">
          <img
            ref={logoRef}
            src={isDarkMode ? DARK_LOGO_SRC : LIGHT_LOGO_SRC}
            alt="Crate Digger"
            className="h-28 w-28 will-change-transform"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-8">
        <div>
          <p className="mb-4 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">Navigate</p>
          <div className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScreenChange(item.id)}
                className={[
                  'tooltip-anchor tooltip-bottom flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm font-medium transition',
                  item.id === 'gems'
                    ? activeScreen === item.id
                      ? 'gems-tab gems-tab-active bg-amber-50 text-amber-900 shadow-[inset_2px_0_0_#f59e0b]'
                      : 'gems-tab gems-tab-inactive text-amber-700 hover:bg-amber-50'
                    : activeScreen === item.id
                      ? 'bg-white/80 text-zinc-950 shadow-[inset_2px_0_0_#18181b]'
                      : 'text-zinc-500 hover:bg-white/70 hover:text-zinc-900',
                ].join(' ')}
                data-tooltip={`Go to ${item.label}`}
              >
                <span className="flex items-center gap-2">
                  {item.icon && <img src={item.icon} alt="" className="h-4 w-4" />}
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {displaySeed && (
        <div className="px-5 pb-5">
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCopySeed}
              className="mono block w-full border-0 bg-transparent p-0 text-left text-[11px] leading-4 text-zinc-400 opacity-70 transition hover:text-zinc-700 hover:opacity-100"
              aria-label={`Copy crate seed ${displaySeed}`}
            >
              <span className="block break-all">{seedCopied ? 'Seed copied' : `Seed: ${displaySeed}`}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRegenerateSeed}
                className="mono shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium lowercase leading-4 text-zinc-500 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
              >
                regen
              </button>

              <button
                type="button"
                onClick={onSetSeed}
                className="mono shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium lowercase leading-4 text-zinc-500 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
              >
                set seed
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
