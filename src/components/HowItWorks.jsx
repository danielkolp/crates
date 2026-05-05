const WORKFLOW_STEPS = [
  {
    title: 'Find',
    label: 'Live source',
    description:
      'The app asks YouTube for music-focused, embeddable videos using the current genre, format, vibe, and tag filters.',
  },
  {
    title: 'Clean',
    label: 'Quality gate',
    description:
      'Shorts, obvious non-music uploads, spam-heavy titles, reactions, tutorials, and weak music matches are removed before ranking.',
  },
  {
    title: 'Score',
    label: 'Gem score',
    description:
      'Each track is ranked with metadata, views, likes, comments, age, music likelihood, underground fit, and confidence signals.',
  },
  {
    title: 'Collect',
    label: 'Your crates',
    description:
      'Saved tracks go to Liked, diamond picks go to Gems, custom playlists stay in Playlists, and actions are logged in History.',
  },
]

const SCORE_FACTORS = [
  'strong music-track metadata',
  'good engagement relative to views',
  'low-to-mid view counts with discovery potential',
  'healthy view velocity or long-term staying power',
  'enough stats to trust the signal',
  'lower spam, shorts, and non-music risk',
]

const SCREEN_GUIDES = [
  {
    name: 'Discover',
    details:
      'Browse the ranked table, filter by genre or format, add tags, limit view counts, and open a track to inspect the score and save it.',
  },
  {
    name: 'Swipe Mode',
    details:
      'Listen through one track at a time. Swipe left to skip, right to save, or down to mark a gem. The buttons under the card do the same thing.',
  },
  {
    name: 'Playlists',
    details:
      'Create custom crates and add tracks from details, swipe mode, or saved collections.',
  },
  {
    name: 'Liked, Gems, History',
    details:
      'Liked stores saved tracks, Gems stores diamond picks, and History keeps a timeline of selected, played, skipped, saved, and gemmed tracks.',
  },
]

function HowItWorks() {
  return (
    <section className="space-y-4 p-4 md:p-6">
      <header className="panel overflow-hidden">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:p-6">
          <div className="min-w-0">
            <p className="muted-label">Crate Digger</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
              How the app works
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 md:text-base">
              Crate Digger turns YouTube search results into a ranked discovery queue for underground music. It narrows the source pool, scores each track, then gives you fast ways to listen, save, and organize finds.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 self-stretch">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="muted-label">Default sort</p>
              <p className="mt-2 text-2xl font-semibold">Gem Score</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="muted-label">Source</p>
              <p className="mt-2 text-2xl font-semibold">YouTube</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="muted-label">Actions</p>
              <p className="mt-2 text-2xl font-semibold">Skip / Save / Gem</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="muted-label">Storage</p>
              <p className="mt-2 text-2xl font-semibold">This browser</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
        <section className="panel p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-3">
            <div>
              <p className="muted-label">Pipeline</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">From search to crate</h3>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {WORKFLOW_STEPS.map((step, index) => (
              <article key={step.title} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="mono grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-300 bg-white text-xs font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="muted-label">{step.label}</p>
                    <h4 className="text-lg font-semibold">{step.title}</h4>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel p-4">
          <p className="muted-label">Gem Score</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">What moves a track up</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {SCORE_FACTORS.map((factor) => (
              <span key={factor} className="chip bg-zinc-50">
                {factor}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-600">
            A low-view upload is not automatically a gem. The score also needs enough evidence that it is music, has real engagement, and is not risky metadata.
          </p>
        </aside>
      </div>

      <section className="panel p-4">
        <div className="border-b border-zinc-200 pb-3">
          <p className="muted-label">Views</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">Where everything lands</h3>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SCREEN_GUIDES.map((screen) => (
            <article key={screen.name} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h4 className="text-lg font-semibold">{screen.name}</h4>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{screen.details}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <p className="muted-label">Live data</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">API behavior</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Live discovery uses the YouTube Data API key from the app environment. If the key is missing, invalid, or out of daily quota, the app shows a status message instead of silently pretending results are available.
          </p>
        </div>

        <div>
          <p className="muted-label">Persistence</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">Saved state</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Liked tracks, gems, playlists, discovery history, and the theme setting are saved in this browser. Clearing site data clears those local collections.
          </p>
        </div>
      </section>
    </section>
  )
}

export default HowItWorks
