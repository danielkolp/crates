import { useEffect, useRef, useState } from 'react'
import {
  SiApplemusic,
  SiBandcamp,
  SiGoogle,
  SiSoundcloud,
  SiSpotify,
  SiYoutube,
} from 'react-icons/si'

const SEARCH_PLATFORMS = [
  {
    id: 'google',
    label: 'Google',
    Icon: SiGoogle,
    buildUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    Icon: SiYoutube,
    buildUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  },
  {
    id: 'soundcloud',
    label: 'SoundCloud',
    Icon: SiSoundcloud,
    buildUrl: (query) => `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`,
  },
  {
    id: 'spotify',
    label: 'Spotify',
    Icon: SiSpotify,
    buildUrl: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`,
  },
  {
    id: 'apple-music',
    label: 'Apple',
    Icon: SiApplemusic,
    buildUrl: (query) => `https://music.apple.com/us/search?term=${encodeURIComponent(query)}`,
  },
  {
    id: 'bandcamp',
    label: 'Bandcamp',
    Icon: SiBandcamp,
    buildUrl: (query) => `https://bandcamp.com/search?q=${encodeURIComponent(query)}`,
  },
]

function buildTrackSearchQuery(track) {
  const artist = String(track?.artist || track?.channelTitle || '').trim()
  const title = String(track?.title || '').trim()

  if (artist && title) {
    return `${artist} - ${title}`
  }

  return title || artist
}

function TrackSearchLinks({
  track,
  variant = 'panel',
  compact = false,
  surfaceStyle,
  labelStyle,
  linkStyle,
}) {
  const query = buildTrackSearchQuery(track)

  if (!query) {
    return null
  }

  if (variant === 'menu') {
    return <TrackSearchMenu query={query} linkStyle={linkStyle} />
  }

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white ${compact ? 'p-2.5' : 'p-3'}`}
      style={surfaceStyle}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="muted-label" style={labelStyle}>Search Track</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SEARCH_PLATFORMS.map(({ id, label, Icon, buildUrl }) => (
          <a
            key={id}
            href={buildUrl(query)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:border-sky-500 hover:bg-sky-500 hover:text-white"
            style={linkStyle}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function TrackSearchMenu({ query, linkStyle }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="tooltip-anchor hover-swap inline-flex min-w-[4rem] items-center justify-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:border-sky-500 hover:bg-sky-500 hover:text-white"
        data-tooltip="Search this track"
      >
        <span className="hover-swap-text">Search</span>
        <SiGoogle className="hover-swap-icon h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] grid w-44 grid-cols-1 gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl">
          {SEARCH_PLATFORMS.map(({ id, label, Icon, buildUrl }) => (
            <a
              key={id}
              href={buildUrl(query)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-zinc-700 transition hover:bg-sky-500 hover:text-white"
              style={linkStyle}
              onClick={() => setOpen(false)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default TrackSearchLinks
