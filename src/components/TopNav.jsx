import { BsInfoCircle, BsMoonStarsFill, BsSunFill } from 'react-icons/bs'

const SCREEN_ITEMS = [
  { id: 'digger', label: 'Discover' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'crates', label: 'Playlists' },
  { id: 'liked', label: 'Liked' },
  { id: 'gems', label: 'Gems' },
  { id: 'history', label: 'History' },
  { id: 'how-it-works', label: 'How' },
]

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(value, 0), 1)
}

function formatRateLimitTime(ms = 0) {
  const totalSeconds = Math.max(Math.ceil(Number(ms || 0) / 1000), 0)

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getRateLimitHoverLabel(rateLimit) {
  if (rateLimit?.reason === 'session') {
    return 'new session'
  }

  if (rateLimit?.remainingMs > 0) {
    return formatRateLimitTime(rateLimit.remainingMs)
  }

  return 'soon'
}

function TopNav({
  activeScreen,
  onScreenChange,
  isDarkMode,
  isDemoMode = false,
  onToggleTheme,
  searchRateLimit = null,
}) {
  const showRateLimit = Boolean(searchRateLimit?.isLimited)
  const rateLimitProgress = `${Math.round(clampProgress(searchRateLimit?.progress) * 100)}%`
  const rateLimitHoverLabel = getRateLimitHoverLabel(searchRateLimit)
  const rateLimitAriaLabel = searchRateLimit?.reason === 'session'
    ? 'Rate limited. Start a new browser session to search again.'
    : `Rate limited. ${rateLimitHoverLabel} remaining.`
  const rateLimitTextClass = isDarkMode ? 'text-yellow-300' : 'text-yellow-700'
  const rateLimitTrackClass = isDarkMode ? 'bg-yellow-400/20' : 'bg-yellow-200'
  const rateLimitBarClass = isDarkMode ? 'bg-yellow-300' : 'bg-yellow-500'

  return (
    <header className={`sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-md md:px-6 ${isDarkMode ? 'theme-dark-chrome' : ''}`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="mono text-xs font-semibold lowercase tracking-[0.12em] text-zinc-500">
            disclaimer
          </span>
          <span
            className="tooltip-anchor tooltip-always tooltip-bottom-start top-nav-disclaimer-tooltip inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-950"
            data-tooltip="Crates is not affiliated with the content loaded in the app. Videos and metadata are provided by YouTube."
            aria-label="Disclaimer: Crates is not affiliated with loaded content. Videos and metadata are provided by YouTube."
            tabIndex={0}
          >
            <BsInfoCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {showRateLimit && (
            <span
              className={`group inline-flex h-9 shrink-0 items-center gap-2 px-1 ${rateLimitTextClass}`}
              aria-label={rateLimitAriaLabel}
            >
              <span className="mono inline-flex w-[5.75rem] justify-center text-xs font-semibold">
                <span className="group-hover:hidden">cooldown</span>
                <span className="hidden group-hover:inline">{rateLimitHoverLabel}</span>
              </span>
              <span className={`h-1.5 w-20 overflow-hidden rounded-full ${rateLimitTrackClass}`} aria-hidden="true">
                <span
                  className={`block h-full rounded-full transition-[width] duration-500 ease-linear ${rateLimitBarClass}`}
                  style={{ width: rateLimitProgress }}
                />
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="tooltip-anchor tooltip-always tooltip-bottom grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
            aria-label={isDarkMode ? 'Switch to light mode (why would you?)' : 'Switch to dark mode'}
            data-tooltip={isDarkMode ? 'Switch to light mode (why would you?)' : 'Switch to dark mode'}
          >
            {isDarkMode ? <BsSunFill className="h-3.5 w-3.5" aria-hidden="true" /> : <BsMoonStarsFill className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>

          <nav className="hide-scrollbar flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
            {SCREEN_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScreenChange(item.id)}
                className={[
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                  item.id === 'gems'
                    ? activeScreen === item.id
                      ? 'gems-tab gems-tab-active bg-amber-100 text-amber-900'
                      : 'gems-tab gems-tab-inactive text-amber-700 hover:bg-amber-50'
                    : activeScreen === item.id
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-700 hover:bg-zinc-100',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {isDemoMode && (
            <span className="mono inline-flex h-9 shrink-0 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold tracking-[0.14em] text-amber-800">
              DEMO
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

export default TopNav
