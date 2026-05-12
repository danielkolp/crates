import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BsBoxSeam,
  BsBullseye,
  BsCalendar3,
  BsChevronDown,
  BsChevronUp,
  BsClock,
  BsFunnel,
  BsGraphUpArrow,
  BsHdd,
  BsInfoCircle,
  BsPlayBtn,
  BsSearch,
  BsShuffle,
  BsTag,
} from 'react-icons/bs'
import { createDiscoverySeed } from '../api/youtubeClient'

const WORKFLOW_STEPS = [
  {
    title: 'Start a crate',
    icon: BsSearch,
    description:
      'The seed creates a music-digging route. Crates starts by loading the first search lane.',
  },
  {
    title: 'Remove junk',
    icon: BsFunnel,
    description:
      'Shorts, tutorials, playlists, reactions, podcasts, and weak matches are filtered out.',
  },
  {
    title: 'Rank tracks',
    icon: BsGraphUpArrow,
    description:
      'Tracks move up when they look like real music uploads with useful metadata and believable engagement.',
  },
  {
    title: 'Dig deeper',
    icon: BsShuffle,
    description:
      'When the queue runs low, Crates can load the next lane from the same seed.',
  },
]

const SCORE_FACTORS = [
  'real music metadata',
  'low-view discovery',
  'engagement vs views',
  'clean upload signals',
  'less spam risk',
  'style confidence',
]

const REEL_FRAME_COUNT = 8
const REEL_DURATION_MS = 1080

function fitReelValue(value, length) {
  const digits = String(value || '').replace(/\D/g, '')

  if (!digits) {
    return '0'.repeat(length)
  }

  return digits.length >= length ? digits.slice(0, length) : digits.padEnd(length, '0')
}

function createRandomDigits(length) {
  return Array.from({ length }, () => String(Math.floor(Math.random() * 10))).join('')
}

function createReelFrames(previousParts, nextParts) {
  return nextParts.map((part, index) => {
    const length = Math.max(String(part.digits || '').length, 1)
    const previousDigits = fitReelValue(previousParts[index]?.digits, length)
    const randomFrames = Array.from({ length: REEL_FRAME_COUNT - 2 }, () => createRandomDigits(length))

    return [previousDigits, ...randomFrames, part.digits]
  })
}

function getDisplaySeed(discoverySeed) {
  return String(discoverySeed?.numericSeed || discoverySeed?.id || discoverySeed?.seed || '00000000')
}

function getWindowLabel(discoverySeed) {
  const startYear = Number(discoverySeed.year)

  if (!Number.isFinite(startYear)) {
    return String(discoverySeed.year || '')
  }

  if (discoverySeed.windowSpanYears <= 1) {
    return String(startYear)
  }

  return `${startYear}-${startYear + discoverySeed.windowSpanYears - 1}`
}

function getSeedSegment(seed, index) {
  const value = String(seed || '00000000')
  const start = Math.floor((value.length * index) / 4)
  const end = Math.floor((value.length * (index + 1)) / 4)

  return (value.slice(start, end) || value.slice(index * 2, index * 2 + 2) || '00').slice(0, 4)
}

function getSeedParts(discoverySeed) {
  const displaySeed = getDisplaySeed(discoverySeed)
  const queryPlan = discoverySeed.queryPlan || []
  const firstLane = queryPlan[0] || {}
  const secondLane = queryPlan[1] || {}

  return [
    {
      id: 'crate',
      digits: getSeedSegment(displaySeed, 0),
      label: 'Crate vibe',
      value: discoverySeed.style || 'music discovery',
      icon: BsShuffle,
      description:
        'This is the general direction of the crate. One seed might lean toward techno, another toward garage, house, rap, or something else.',
      example: discoverySeed.style || 'music discovery',
    },
    {
      id: 'terms',
      digits: getSeedSegment(displaySeed, 1),
      label: 'Search words',
      value: discoverySeed.format || 'track uploads',
      icon: BsPlayBtn,
      description:
        'These words help YouTube return actual music tracks instead of random videos. Examples include official audio, topic, release, white label, or original mix.',
      example: discoverySeed.format || 'track uploads',
    },
    {
      id: 'context',
      digits: getSeedSegment(displaySeed, 2),
      label: 'Digging clues',
      value: discoverySeed.context || 'underground',
      icon: BsBullseye,
      description:
        'These clues make the search feel more like crate digging. They can push results toward underground, rare, small-label, or deep-cut uploads.',
      example: discoverySeed.context || 'underground',
    },
    {
      id: 'lanes',
      digits: getSeedSegment(displaySeed, 3),
      label: 'Search lanes',
      value: `${queryPlan.length || 0} lanes`,
      icon: BsSearch,
      description:
        'A seed can create multiple lanes. Crates starts with one lane, then can load another from the same seed when you keep swiping.',
      example:
        secondLane.searchQuery || firstLane.searchQuery || 'More tracks from the same crate',
    },
  ]
}

function SectionLabel({ children }) {
  return (
    <p className="how-section-label text-[0.68rem] font-black uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-500">
      {children}
    </p>
  )
}

function Panel({ children, className = '' }) {
  return (
    <section
      className={[
        'how-page-panel',
        'rounded-2xl border border-zinc-300/80 bg-[#fffdf8] shadow-[0_1px_2px_rgba(24,24,27,0.05)]',
        'dark:border-white/10 dark:bg-[#0b0b0b] dark:shadow-none',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  )
}

function Pill({ children }) {
  return (
    <span className="how-pill rounded-full border border-zinc-300 bg-[#f4efe4] px-3 py-1.5 text-xs font-bold text-zinc-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200">
      {children}
    </span>
  )
}

function SeedSlot({ part, active, frames, isReeling, onActivate, delay = 0 }) {
  const reelFrames = frames?.length ? frames : [part.digits]
  const shouldReel = isReeling && reelFrames.length > 1

  return (
    <button
      type="button"
      onFocus={onActivate}
      onMouseEnter={onActivate}
      onClick={onActivate}
      aria-label={`${part.label} guide segment ${part.digits}`}
      className={[
        'how-seed-slot min-w-0 overflow-hidden rounded-2xl px-2 py-2 text-center transition',
        active ? 'is-active bg-zinc-950 text-white shadow-lg dark:bg-white dark:text-zinc-950' : 'text-zinc-400 hover:bg-[#eee8dc] hover:text-zinc-950 dark:text-zinc-700 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100',
        shouldReel ? 'is-reeling' : '',
      ].join(' ')}
      style={{
        '--reel-steps': Math.max(reelFrames.length - 1, 0),
        '--reel-delay': `${delay}ms`,
      }}
    >
      <span className="how-reel-window" aria-hidden={shouldReel}>
        <span
          key={shouldReel ? reelFrames.join('-') : part.digits}
          className={`how-reel-track ${shouldReel ? 'is-reeling' : ''}`}
        >
          {reelFrames.map((frame, frameIndex) => (
            <span key={`${frame}-${frameIndex}`} className="how-reel-frame tabular-nums">
              {frame}
            </span>
          ))}
        </span>
      </span>
      {shouldReel && <span className="sr-only">{part.digits}</span>}
    </button>
  )
}

function SegmentButton({ part, active, onActivate }) {
  return (
    <button
      type="button"
      onFocus={onActivate}
      onMouseEnter={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      className={[
        'how-segment-button',
        active ? 'is-active' : '',
        'rounded-xl border px-4 py-3 text-sm font-black transition',
        active
          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
          : 'border-zinc-300 bg-[#fffdf8] text-zinc-700 hover:border-zinc-500 hover:bg-white hover:text-zinc-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:bg-white/[0.08] dark:hover:text-white',
      ].join(' ')}
    >
      {part.label}
    </button>
  )
}

function HowItWorks() {
  const [discoverySeed, setDiscoverySeed] = useState(() => createDiscoverySeed())
  const [activePartId, setActivePartId] = useState('crate')
  const [showAllQueries, setShowAllQueries] = useState(false)
  const [isReeling, setIsReeling] = useState(false)
  const [reelFrames, setReelFrames] = useState([])
  const reelTimerRef = useRef(null)

  const displaySeed = getDisplaySeed(discoverySeed)
  const seedParts = useMemo(() => getSeedParts(discoverySeed), [discoverySeed])
  const activePart = seedParts.find((part) => part.id === activePartId) || seedParts[0]
  const ActiveIcon = activePart.icon

  const visibleQueries = showAllQueries
    ? discoverySeed.queryPlan
    : discoverySeed.queryPlan.slice(0, 3)

  const summaryRows = [
    {
      label: 'Crate vibe',
      value: discoverySeed.style,
      icon: BsTag,
    },
    {
      label: 'Search words',
      value: discoverySeed.format,
      icon: BsPlayBtn,
    },
    {
      label: 'Digging clues',
      value: discoverySeed.context,
      icon: BsBullseye,
    },
    {
      label: 'Upload era',
      value: getWindowLabel(discoverySeed),
      icon: BsCalendar3,
    },
    {
      label: 'Search lanes',
      value: `${discoverySeed.queryPlan.length} lanes`,
      icon: BsSearch,
    },
  ]

  useEffect(() => () => {
    if (reelTimerRef.current) {
      window.clearTimeout(reelTimerRef.current)
    }
  }, [])

  function handleNewExampleSeed() {
    const nextDiscoverySeed = createDiscoverySeed()
    const nextParts = getSeedParts(nextDiscoverySeed)

    if (reelTimerRef.current) {
      window.clearTimeout(reelTimerRef.current)
    }

    setReelFrames(createReelFrames(seedParts, nextParts))
    setIsReeling(true)
    setDiscoverySeed(nextDiscoverySeed)
    setActivePartId('crate')
    setShowAllQueries(false)

    reelTimerRef.current = window.setTimeout(() => {
      setIsReeling(false)
      setReelFrames([])
      reelTimerRef.current = null
    }, REEL_DURATION_MS)
  }

  return (
    <section className="how-page-shell min-h-full bg-[#f4f1ea] px-5 py-7 pb-28 text-zinc-950 transition-colors dark:bg-black dark:text-zinc-50 lg:px-8">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h2 className="how-strong-text text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
            How Seeds Work
          </h2>
          <p className="how-muted-text mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
            A seed is a crate number. It creates a repeatable route for finding music.
            Crates starts with one search lane, then can dig deeper into the same seed.
          </p>
        </div>

        <div className="how-brand hidden items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-zinc-500 dark:text-zinc-500 sm:flex">
          <BsBoxSeam className="h-5 w-5" aria-hidden="true" />
          <span>Crates</span>
        </div>
      </header>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,2.05fr)_minmax(25rem,0.85fr)]">
        <Panel className="overflow-hidden p-5 lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionLabel>Example seed</SectionLabel>
              <h3 className="how-strong-text mt-2 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
                One number, one crate route
              </h3>
              <p className="how-muted-text mt-2 max-w-2xl text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
                This seed was generated live. Hover over a section to see what part of the
                discovery recipe it helps explain.
              </p>
            </div>

            <button
              type="button"
              onClick={handleNewExampleSeed}
              className="how-seed-action self-start rounded-xl border border-zinc-300 bg-[#fffdf8] px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-700 transition hover:border-zinc-500 hover:bg-white hover:text-zinc-950 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:border-white/25 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              {isReeling ? 'Spinning' : 'New seed'}
            </button>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="min-w-0">
              <div
                className="grid w-full grid-cols-4 gap-1.5 font-mono text-[clamp(2.4rem,5.6vw,5.8rem)] font-black leading-none tracking-[0.015em]"
                aria-label={`Example seed ${displaySeed}`}
              >
                {seedParts.map((part, index) => (
                  <SeedSlot
                    key={part.id}
                    part={part}
                    active={activePart.id === part.id}
                    frames={reelFrames[index]}
                    isReeling={isReeling}
                    delay={index * 70}
                    onActivate={() => setActivePartId(part.id)}
                  />
                ))}
              </div>

              <div className="how-soft-panel mt-4 rounded-2xl border border-zinc-300 bg-[#f8f5ee] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex gap-3">
                  <BsInfoCircle className="how-muted-icon mt-0.5 h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-500" aria-hidden="true" />
                  <p className="how-muted-text text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-300">
                    The whole seed powers the recipe. The highlighted sections are a visual guide,
                    not a literal digit-by-digit decoding system.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {seedParts.map((part) => (
                  <SegmentButton
                    key={part.id}
                    part={part}
                    active={activePart.id === part.id}
                    onActivate={() => setActivePartId(part.id)}
                  />
                ))}
              </div>
            </div>

            <aside className="how-soft-panel rounded-2xl border border-zinc-300 bg-[#f8f5ee] p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                <span className="how-icon-box flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-[#fffdf8] text-zinc-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-100">
                  <ActiveIcon className="h-4 w-4" aria-hidden="true" />
                </span>

                <div className="min-w-0">
                  <SectionLabel>{activePart.label}</SectionLabel>
                  <p className="how-strong-text mt-1 truncate text-lg font-black tracking-[-0.02em] text-zinc-950 dark:text-white">
                    {activePart.value}
                  </p>
                </div>
              </div>

              <p className="how-muted-text mt-4 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-300">
                {activePart.description}
              </p>

              <div className="how-inset-panel mt-4 rounded-xl border border-zinc-300 bg-[#fffdf8] p-3 dark:border-white/10 dark:bg-black/40">
                <SectionLabel>Example</SectionLabel>
                <p className="how-strong-text mt-2 truncate text-sm font-black text-zinc-950 dark:text-zinc-100">
                  {activePart.example || 'More tracks from this crate'}
                </p>
              </div>

              <div className="how-inset-panel mt-4 rounded-xl border border-zinc-300 bg-[#fffdf8] p-3 dark:border-white/10 dark:bg-black/40">
                <p className="how-muted-text text-xs font-bold leading-5 text-zinc-700 dark:text-zinc-300">
                  New seed = new crate. More lanes = deeper digging inside the same crate.
                </p>
              </div>
            </aside>
          </div>
        </Panel>

        <Panel className="p-5 lg:p-6">
          <SectionLabel>Recipe summary</SectionLabel>
          <h3 className="how-strong-text mt-2 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
            What this seed produced
          </h3>

          <div className="how-list-panel mt-4 overflow-hidden rounded-2xl border border-zinc-300 bg-[#fffdf8] dark:border-white/10 dark:bg-white/[0.04]">
            {summaryRows.map((row) => {
              const Icon = row.icon

              return (
                <div
                  key={row.label}
                  className="how-list-row grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-zinc-300 px-4 py-3.5 last:border-b-0 dark:border-white/10"
                >
                  <Icon className="how-muted-icon h-4 w-4 text-zinc-500 dark:text-zinc-500" aria-hidden="true" />
                  <span className="how-muted-text text-sm font-bold text-zinc-700 dark:text-zinc-300">
                    {row.label}
                  </span>
                  <strong className="how-strong-text max-w-[11rem] truncate text-right text-sm font-black text-zinc-950 dark:text-white">
                    {row.value}
                  </strong>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <Panel className="mt-5 p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionLabel>Search lanes</SectionLabel>
            <h3 className="how-strong-text mt-1 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
              The routes this seed can dig through
            </h3>
            <p className="how-muted-text mt-2 max-w-3xl text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
              Think of each lane like another row in the same record crate. Crates starts with
              the first lane, then loads more from the same seed only when needed.
            </p>
          </div>

          <span className="how-inline-note inline-flex items-center gap-2 self-start rounded-xl border border-zinc-300 bg-[#f8f5ee] px-3 py-2 text-xs font-bold leading-5 text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
            <BsInfoCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Lanes are loaded only when the queue needs more tracks.
          </span>
        </div>

        <div className="mt-5 space-y-2">
          {visibleQueries.map((query) => (
            <div
              key={`${query.index}-${query.searchQuery}`}
              className="how-lane-row grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-zinc-300 bg-[#fffdf8] px-4 py-3 transition hover:border-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
            >
              <span className="how-lane-index flex h-7 w-7 items-center justify-center rounded-full bg-[#eee8dc] text-xs font-black text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-300">
                {query.index + 1}
              </span>

              <p className="how-code-line truncate font-mono text-xs font-semibold leading-5 text-zinc-800 dark:text-zinc-300">
                {query.searchQuery}
              </p>

              <span className="how-lane-year rounded-lg bg-[#eee8dc] px-2 py-1 text-xs font-black text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300">
                {query.year || discoverySeed.year}
              </span>
            </div>
          ))}
        </div>

        {discoverySeed.queryPlan.length > 3 && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllQueries((prev) => !prev)}
              className="how-secondary-button inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-[#fffdf8] px-4 py-2 text-sm font-black text-zinc-700 transition hover:border-zinc-500 hover:bg-white hover:text-zinc-950 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              {showAllQueries
                ? 'Show first 3 lanes'
                : `View all ${discoverySeed.queryPlan.length} lanes`}

              {showAllQueries ? (
                <BsChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BsChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(22rem,0.85fr)]">
        <Panel className="p-5 lg:p-6">
          <SectionLabel>Pipeline</SectionLabel>
          <h3 className="how-strong-text mt-1 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
            From seed to crate
          </h3>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {WORKFLOW_STEPS.map((step, index) => {
              const Icon = step.icon

              return (
                <article
                  key={step.title}
                  className="how-step-card-theme rounded-2xl border border-zinc-300 bg-[#fffdf8] p-4 transition hover:border-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="how-step-number flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white dark:bg-white dark:text-zinc-950">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Icon className="how-muted-icon h-5 w-5 text-zinc-500 dark:text-zinc-500" aria-hidden="true" />
                  </div>

                  <h4 className="how-strong-text text-base font-black tracking-[-0.02em] text-zinc-950 dark:text-white">
                    {step.title}
                  </h4>
                  <p className="how-muted-text mt-2 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
                    {step.description}
                  </p>
                </article>
              )
            })}
          </div>
        </Panel>

        <Panel className="p-5 lg:p-6">
          <SectionLabel>Gem score</SectionLabel>
          <h3 className="how-strong-text mt-1 text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white">
            Why some tracks move up
          </h3>

          <div className="mt-4 flex flex-wrap gap-2">
            {SCORE_FACTORS.map((factor) => (
              <Pill key={factor}>{factor}</Pill>
            ))}
          </div>

          <p className="how-muted-text mt-4 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
            Low views are not enough by themselves. A track still needs signs that it is real music
            and not spam.
          </p>
        </Panel>
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel className="flex gap-4 p-5">
          <span className="how-icon-box flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-300 bg-[#f8f5ee] text-zinc-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
            <BsClock className="h-5 w-5" aria-hidden="true" />
          </span>

          <div>
            <SectionLabel>Rate limits</SectionLabel>
            <h3 className="how-strong-text mt-1 text-lg font-black tracking-[-0.02em] text-zinc-950 dark:text-white">
              Searches are limited
            </h3>
            <p className="how-muted-text mt-2 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
              YouTube search is expensive, so Crates limits live searches and shows cooldowns when needed.
            </p>
          </div>
        </Panel>

        <Panel className="flex gap-4 p-5">
          <span className="how-icon-box flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-300 bg-[#f8f5ee] text-zinc-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
            <BsHdd className="h-5 w-5" aria-hidden="true" />
          </span>

          <div>
            <SectionLabel>Saved state</SectionLabel>
            <h3 className="how-strong-text mt-1 text-lg font-black tracking-[-0.02em] text-zinc-950 dark:text-white">
              Your saved tracks stay here
            </h3>
            <p className="how-muted-text mt-2 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-400">
              Likes, gems, playlists, history, seed, and theme settings are saved locally in this browser.
            </p>
          </div>
        </Panel>
      </section>
    </section>
  )
}

export default HowItWorks
