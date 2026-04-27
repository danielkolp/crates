import { useEffect, useMemo, useRef } from 'react'

const LIGHT_LOGO_SRC = '/images/logo.png'
const DARK_LOGO_SRC = '/images/logo-darkmode.png'

const NAV_ITEMS = [
  { id: 'digger', label: 'Digger' },
  { id: 'swipe', label: 'Swipe Mode' },
  { id: 'crates', label: 'Playlists' },
  { id: 'liked', label: 'Liked' },
  { id: 'gems', label: 'Gems', icon: '/images/diamond.png' },
  { id: 'history', label: 'History' },
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
}) {
  const logoRef = useRef(null)
  const progressSnapshotRef = useRef({ seconds: 0, updatedAt: 0 })
  const smoothImpactRef = useRef(0)
  const beatClockRef = useRef({ bpm: 124, phaseOffset: 0 })

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

  return (
    <aside className={`hidden h-full border-r border-zinc-300/90 bg-zinc-50 lg:flex lg:w-64 lg:flex-col ${isDarkMode ? 'theme-dark-chrome' : ''}`}>
      <div className="border-b border-zinc-300 px-5 py-5">
        <div className="flex items-center justify-center">
          <img
            ref={logoRef}
            src={isDarkMode ? DARK_LOGO_SRC : LIGHT_LOGO_SRC}
            alt="Crate Digger"
            className="h-36 w-36 will-change-transform"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div>
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Discover</p>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScreenChange(item.id)}
                className={[
                  'tooltip-anchor tooltip-right flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition',
                  item.id === 'gems'
                    ? activeScreen === item.id
                      ? 'gems-tab gems-tab-active border-amber-400 bg-amber-300 text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.85)]'
                      : 'gems-tab gems-tab-inactive border-amber-300 bg-amber-100 text-amber-900 hover:-rotate-2 hover:scale-[1.04] hover:border-amber-400 hover:bg-amber-200 hover:shadow-[0_0_24px_rgba(251,191,36,0.85)]'
                    : activeScreen === item.id
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-transparent text-zinc-700 hover:border-zinc-300 hover:bg-white',
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
    </aside>
  )
}

export default Sidebar
