import { useMemo, useState } from 'react'

const MAX_VIEWS_OPTIONS = [
  { label: 'Any Views', value: 'any' },
  { label: '< 10K', value: '10000' },
  { label: '< 20K', value: '20000' },
  { label: '< 50K', value: '50000' },
  { label: '< 100K', value: '100000' },
]

const SORT_OPTIONS = [
  { label: 'Gem Score', value: 'gemScore' },
  { label: 'Views', value: 'views' },
  { label: 'Likes', value: 'likes' },
  { label: 'Newest', value: 'newest' },
]

const MIN_GEM_SCORE_OPTIONS = [
  { label: 'Any Gem', value: 'any' },
  { label: '5+', value: '5' },
  { label: '7+', value: '7' },
  { label: '8+', value: '8' },
]

const LOCKED_FILTERS = {
  musicTracksOnly: true,
  preferTopicChannels: true,
  hideShorts: true,
}

function uniqueValues(list, key) {
  return [...new Set(list.map((item) => item[key]))].sort((a, b) => a.localeCompare(b))
}

function FilterBar({
  tracks,
  filters,
  onChangeFilters,
  digDeeperTags,
  digDeeperActive,
  onClearDigDeeper,
}) {
  const [pendingTag, setPendingTag] = useState('')
  const genres = useMemo(() => uniqueValues(tracks, 'genre'), [tracks])
  const vibes = useMemo(() => uniqueValues(tracks, 'vibe'), [tracks])
  const allTags = useMemo(() => [...new Set(tracks.flatMap((track) => track.tags))].sort(), [tracks])

  function applyLockedFilters(nextFilters) {
    return {
      ...nextFilters,
      ...LOCKED_FILTERS,
    }
  }

  function updateFilter(key, value) {
    onChangeFilters((prev) => applyLockedFilters({
      ...prev,
      [key]: value,
    }))
  }

  function addTag(tagToAdd) {
    const normalized = tagToAdd.trim().toLowerCase()
    if (!normalized || filters.activeTags.includes(normalized)) {
      return
    }

    onChangeFilters((prev) => applyLockedFilters({
      ...prev,
      activeTags: [...prev.activeTags, normalized],
    }))
  }

  function removeTag(tagToRemove) {
    onChangeFilters((prev) => applyLockedFilters({
      ...prev,
      activeTags: prev.activeTags.filter((tag) => tag !== tagToRemove),
    }))
  }

  function handleAddTagSubmit(event) {
    event.preventDefault()
    addTag(pendingTag)
    setPendingTag('')
  }

  return (
    <section className="panel space-y-4 p-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dig for Gems</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <label className="tooltip-anchor space-y-1" data-tooltip="Filter tracks by genre">
          <span className="muted-label">Genre</span>
          <select
            value={filters.genre}
            onChange={(event) => updateFilter('genre', event.target.value)}
            className="input-select"
          >
            <option value="all">All Genres</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </label>

        <label className="tooltip-anchor space-y-1" data-tooltip="Filter tracks by vibe">
          <span className="muted-label">Vibe</span>
          <select
            value={filters.vibe}
            onChange={(event) => updateFilter('vibe', event.target.value)}
            className="input-select"
          >
            <option value="all">All Vibes</option>
            {vibes.map((vibe) => (
              <option key={vibe} value={vibe}>
                {vibe}
              </option>
            ))}
          </select>
        </label>

        <label className="tooltip-anchor space-y-1" data-tooltip="Set a maximum views threshold">
          <span className="muted-label">Max Views</span>
          <select
            value={filters.maxViews}
            onChange={(event) => updateFilter('maxViews', event.target.value)}
            className="input-select"
          >
            {MAX_VIEWS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="tooltip-anchor space-y-1" data-tooltip="Choose result sorting">
          <span className="muted-label">Sort By</span>
          <select
            value={filters.sortBy}
            onChange={(event) => updateFilter('sortBy', event.target.value)}
            className="input-select"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="tooltip-anchor space-y-1" data-tooltip="Only include tracks above this gem score">
          <span className="muted-label">Gem Floor</span>
          <select
            value={filters.minGemScore}
            onChange={(event) => updateFilter('minGemScore', event.target.value)}
            className="input-select"
          >
            {MIN_GEM_SCORE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <form
          onSubmit={handleAddTagSubmit}
          className="flex w-full items-end gap-2 sm:col-span-2 xl:col-span-1 xl:w-auto xl:justify-end"
        >
          <div className="tooltip-anchor w-full xl:w-40" data-tooltip="Add a tag filter">
            <input
              list="track-tag-options"
              value={pendingTag}
              onChange={(event) => setPendingTag(event.target.value)}
              placeholder="Add tag"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-900"
            />
          </div>
          <datalist id="track-tag-options">
            {allTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <button
            type="submit"
            className="tooltip-anchor rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
            data-tooltip="Add tag to active filters"
          >
            + Add
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.strictCrateDiggingMode && (
          <span className="chip border-zinc-900 bg-zinc-900 text-white">strict playlist digging</span>
        )}
        {filters.strictGemsOnly && <span className="chip border-zinc-900 bg-zinc-900 text-white">strict gems only</span>}
        {filters.lowViewsOnly && <span className="chip">low views only</span>}
        {filters.minGemScore !== 'any' && <span className="chip">gem {filters.minGemScore}+</span>}

        {filters.activeTags.map((tag) => (
          <span key={tag} className="chip flex items-center gap-2">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="tooltip-anchor rounded-full border border-zinc-400 px-1 text-[10px] leading-none transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
              aria-label={`Remove tag ${tag}`}
              data-tooltip={`Remove tag ${tag}`}
            >
              x
            </button>
          </span>
        ))}

        {digDeeperActive && (
          <span className="chip border-zinc-900 bg-zinc-900 text-white">
            Dig deeper: {digDeeperTags.join(', ')}
            <button
              type="button"
              onClick={onClearDigDeeper}
              className="tooltip-anchor ml-2 rounded border border-white/60 px-1 py-[1px] text-[10px] leading-none text-white transition hover:bg-white hover:text-zinc-900"
              data-tooltip="Clear dig deeper focus tags"
            >
              clear
            </button>
          </span>
        )}
      </div>
    </section>
  )
}

export default FilterBar
