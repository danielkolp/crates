import { BsMoonStarsFill, BsSunFill } from 'react-icons/bs'

const SCREEN_ITEMS = [
  { id: 'digger', label: 'Discover' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'crates', label: 'Playlists' },
  { id: 'liked', label: 'Liked' },
  { id: 'gems', label: 'Gems' },
  { id: 'history', label: 'History' },
  { id: 'how-it-works', label: 'How' },
]

function TopNav({ activeScreen, onScreenChange, isDarkMode, isDemoMode = false, onToggleTheme }) {
  return (
    <header className={`sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-md md:px-6 ${isDarkMode ? 'theme-dark-chrome' : ''}`}>
      <div className="flex items-center justify-end gap-2">
        <nav className="hide-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
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

        <button
          type="button"
          onClick={onToggleTheme}
          className="tooltip-anchor tooltip-bottom grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          data-tooltip={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <BsSunFill className="h-3.5 w-3.5" aria-hidden="true" /> : <BsMoonStarsFill className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

export default TopNav
