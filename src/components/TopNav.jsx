import { BsMoonStarsFill, BsSunFill } from 'react-icons/bs'

const SCREEN_ITEMS = [
  { id: 'digger', label: 'Discover' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'crates', label: 'Playlists' },
  { id: 'liked', label: 'Liked' },
  { id: 'gems', label: 'Gems' },
  { id: 'history', label: 'History' },
]

function TopNav({ activeScreen, onScreenChange, isDarkMode, onToggleTheme }) {
  return (
    <header className={`sticky top-0 z-20 border-b border-zinc-300/90 bg-zinc-50/90 px-4 py-3 backdrop-blur-md md:px-6 ${isDarkMode ? 'theme-dark-chrome' : ''}`}>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          className="tooltip-anchor tooltip-bottom inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          data-tooltip="Dark mode (experimental)"
        >
          {isDarkMode ? <BsSunFill className="h-3.5 w-3.5" aria-hidden="true" /> : <BsMoonStarsFill className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{isDarkMode ? 'Light' : 'Dark'}</span>
        </button>

        <nav className="hide-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-zinc-300 bg-white p-1">
          {SCREEN_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onScreenChange(item.id)}
              className={[
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
                item.id === 'gems'
                  ? activeScreen === item.id
                    ? 'gems-tab gems-tab-active bg-amber-300 text-amber-950'
                    : 'gems-tab gems-tab-inactive text-amber-700 hover:-rotate-2 hover:scale-110 hover:bg-amber-200 hover:shadow-[0_0_18px_rgba(251,191,36,0.8)]'
                  : activeScreen === item.id
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-700 hover:bg-zinc-100',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default TopNav
