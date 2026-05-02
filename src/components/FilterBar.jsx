// FilterBar.jsx - React component for displaying and managing track filters.

import { useMemo, useState } from 'react'
import {
  getAvailableFormatOptions,
  getGenreFilterOptions,
} from '../utils/filterTracks'
import GenreDropdown from './GenreDropdown'

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

const TAG_MATCH_OPTIONS = [
  { label: 'Match All Tags', value: 'all' },
  { label: 'Match Any Tag', value: 'any' },
]

const LOCKED_FILTERS = {
  musicTracksOnly: true,
  hideShorts: true,
  preferTopicChannels: true,
}

function normalizeValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function displayValue(value) {
  return String(value ?? '').trim()
}

function uniqueValues(list, key) {
  return [
    ...new Set(
      list
        .map((item) => displayValue(item?.[key]))
        .filter(Boolean)
        .filter((value) => !['youtube', 'discovery'].includes(normalizeValue(value))),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

function uniqueTags(tracks) {
  const blockedTags = new Set(['youtube', 'music', 'video', 'videos', 'discovery'])

  return [
    ...new Set(
      tracks
        .flatMap((track) => (Array.isArray(track?.tags) ? track.tags : []))
        .map((tag) => normalizeValue(tag))
        .filter(Boolean)
        .filter((tag) => !blockedTags.has(tag)),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

function ensureFilterDefaults(filters) {
  return {
    genre: 'all',
    style: 'all',
    format: 'all',
    vibe: 'all',
    maxViews: 'any',
    sortBy: 'gemScore',
    minGemScore: 'any',
    activeTags: [],
    tagMatchMode: 'all',
    digDeeperMatchMode: 'any',
    lowViewsOnly: false,
    strictGemsOnly: false,
    strictCrateDiggingMode: false,
    ...LOCKED_FILTERS,
    ...filters,
  }
}

function FilterBar({
  tracks = [],
  filters,
  onChangeFilters,
  digDeeperTags = [],
  digDeeperActive = false,
  onClearDigDeeper,
}) {
  const safeFilters = ensureFilterDefaults(filters)
  const [pendingTag, setPendingTag] = useState('')

  const genreOptions = useMemo(() => getGenreFilterOptions(tracks), [tracks])
  const formatOptions = useMemo(() => getAvailableFormatOptions(tracks), [tracks])
  const vibes = useMemo(() => uniqueValues(tracks, 'vibe'), [tracks])
  const allTags = useMemo(() => uniqueTags(tracks), [tracks])

  const strictMode = safeFilters.strictGemsOnly || safeFilters.strictCrateDiggingMode

  function applyLockedFilters(nextFilters) {
    return {
      ...nextFilters,
      ...LOCKED_FILTERS,
    }
  }

  function updateFilter(key, value) {
    onChangeFilters((prev) =>
      applyLockedFilters({
        ...ensureFilterDefaults(prev),
        [key]: value,
      }),
    )
  }

  function updateGenre(value) {
    onChangeFilters((prev) =>
      applyLockedFilters({
        ...ensureFilterDefaults(prev),
        genre: value,
        style: value,
      }),
    )
  }

  function toggleFilter(key) {
    onChangeFilters((prev) => {
      const next = ensureFilterDefaults(prev)

      return applyLockedFilters({
        ...next,
        [key]: !next[key],
      })
    })
  }

  function addTag(tagToAdd) {
    const normalized = normalizeValue(tagToAdd)
    const activeTags = safeFilters.activeTags || []

    if (!normalized || activeTags.includes(normalized)) return

    onChangeFilters((prev) => {
      const next = ensureFilterDefaults(prev)

      return applyLockedFilters({
        ...next,
        activeTags: [...next.activeTags, normalized],
      })
    })
  }

  function removeTag(tagToRemove) {
    const normalized = normalizeValue(tagToRemove)

    onChangeFilters((prev) => {
      const next = ensureFilterDefaults(prev)

      return applyLockedFilters({
        ...next,
        activeTags: next.activeTags.filter((tag) => normalizeValue(tag) !== normalized),
      })
    })
  }

  function clearTags() {
    onChangeFilters((prev) => {
      const next = ensureFilterDefaults(prev)

      return applyLockedFilters({
        ...next,
        activeTags: [],
      })
    })
  }

  function clearFilters() {
    onChangeFilters((prev) =>
      applyLockedFilters({
        ...ensureFilterDefaults(prev),
        genre: 'all',
        style: 'all',
        format: 'all',
        vibe: 'all',
        maxViews: 'any',
        sortBy: 'gemScore',
        minGemScore: 'any',
        activeTags: [],
        tagMatchMode: 'all',
        lowViewsOnly: false,
        strictGemsOnly: false,
        strictCrateDiggingMode: false,
      }),
    )
  }

  function handleAddTagSubmit(event) {
    event.preventDefault()
    addTag(pendingTag)
    setPendingTag('')
  }

  const popularTags = allTags.slice(0, 12)
  const selectedGenre =
    safeFilters.style && safeFilters.style !== 'all'
      ? safeFilters.style
      : safeFilters.genre || 'all'
  const hasActiveFilters =
    selectedGenre !== 'all' ||
    safeFilters.format !== 'all' ||
    safeFilters.vibe !== 'all' ||
    safeFilters.maxViews !== 'any' ||
    safeFilters.minGemScore !== 'any' ||
    safeFilters.activeTags.length > 0 ||
    safeFilters.lowViewsOnly ||
    safeFilters.strictGemsOnly ||
    safeFilters.strictCrateDiggingMode

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Discover Gems</h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-500">
            <span>Music only</span>
            <span aria-hidden="true">/</span>
            <span>Shorts hidden</span>
            <span aria-hidden="true">/</span>
            <span>Topic channels boosted</span>
          </div>
        </div>

        <button
          type="button"
          onClick={clearFilters}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-xs font-semibold transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasActiveFilters}
        >
          Clear filters
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr_1fr_1fr]">
        {genreOptions.length > 0 && (
          <GenreDropdown
            value={selectedGenre}
            options={genreOptions}
            totalCount={tracks.length}
            onChange={updateGenre}
          />
        )}

        {formatOptions.length > 1 && (
          <label className="space-y-1">
            <span className="muted-label">Format</span>
            <select
              value={safeFilters.format || 'all'}
              onChange={(event) => updateFilter('format', event.target.value)}
              className="input-select"
            >
              <option value="all">All Formats</option>
              {formatOptions.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {vibes.length > 0 && (
          <label className="space-y-1">
            <span className="muted-label">Vibe</span>
            <select
              value={safeFilters.vibe}
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
        )}

        <label className="space-y-1">
          <span className="muted-label">Max Views</span>
          <select
            value={safeFilters.maxViews}
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

        <label className="space-y-1">
          <span className="muted-label">Sort By</span>
          <select
            value={strictMode ? 'gemScore' : safeFilters.sortBy}
            onChange={(event) => updateFilter('sortBy', event.target.value)}
            className="input-select"
            disabled={strictMode}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="muted-label">Gem Floor</span>
          <select
            value={safeFilters.minGemScore}
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

        <label className="space-y-1">
          <span className="muted-label">Tag Match</span>
          <select
            value={safeFilters.tagMatchMode}
            onChange={(event) => updateFilter('tagMatchMode', event.target.value)}
            className="input-select"
          >
            {TAG_MATCH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        {popularTags.length > 0 && (
          <div className="space-y-2">
            <span className="muted-label">Quick Tags</span>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => {
                const active = safeFilters.activeTags.includes(tag)

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => (active ? removeTag(tag) : addTag(tag))}
                    className={`chip group gap-1 transition hover:border-sky-500 hover:bg-sky-50 hover:text-sky-700 ${
                      active ? 'border-zinc-900 bg-zinc-900 text-white hover:border-red-500 hover:bg-red-500 hover:text-white' : ''
                    }`}
                    aria-label={active ? `Remove tag ${tag}` : `Add tag ${tag}`}
                  >
                    <span className="font-semibold">{active ? 'x' : '+'}</span>
                    <span>{tag}</span>
                  </button>
                )
              })}
            </div>
          </div>

        )}

        <div className="flex flex-wrap items-end gap-2 xl:justify-end">
          <button
            type="button"
            onClick={() => toggleFilter('lowViewsOnly')}
            className={`chip transition ${
              safeFilters.lowViewsOnly ? 'border-zinc-900 bg-zinc-900 text-white' : ''
            }`}
          >
            Low views only
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('strictGemsOnly')}
            className={`chip transition ${
              safeFilters.strictGemsOnly ? 'border-zinc-900 bg-zinc-900 text-white' : ''
            }`}
          >
            Strict gems
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('strictCrateDiggingMode')}
            className={`chip transition ${
              safeFilters.strictCrateDiggingMode ? 'border-zinc-900 bg-zinc-900 text-white' : ''
            }`}
          >
            Crate mode
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <form onSubmit={handleAddTagSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="space-y-1">
            <span className="muted-label">Custom Tag</span>
            <input
              list="track-tag-options"
              value={pendingTag}
              onChange={(event) => setPendingTag(event.target.value)}
              placeholder="Add tag"
              className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
            />
          </label>

          <datalist id="track-tag-options">
            {allTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>

          <button
            type="submit"
            className="filter-tag-add-button inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-emerald-500 bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <span aria-hidden="true">+</span>
            <span>Add</span>
          </button>

          {safeFilters.activeTags.length > 0 && (
            <button
              type="button"
              onClick={clearTags}
              className="h-9 min-w-[4.75rem] shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium transition hover:border-red-500 hover:bg-red-500 hover:text-white"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {safeFilters.strictCrateDiggingMode && (
          <span className="chip border-zinc-900 bg-zinc-900 text-white">
            crate mode: gem 7+, max 50K, quality 3+
          </span>
        )}

        {safeFilters.strictGemsOnly && (
          <span className="chip border-zinc-900 bg-zinc-900 text-white">
            strict gems: gem 7+, max 50K
          </span>
        )}

        {safeFilters.lowViewsOnly && <span className="chip">low views only</span>}

        {selectedGenre !== 'all' && <span className="chip">genre: {selectedGenre}</span>}

        {safeFilters.format !== 'all' && <span className="chip">format: {safeFilters.format}</span>}

        {safeFilters.vibe !== 'all' && <span className="chip">vibe: {safeFilters.vibe}</span>}

        {safeFilters.minGemScore !== 'any' && (
          <span className="chip">gem {safeFilters.minGemScore}+</span>
        )}

        {safeFilters.maxViews !== 'any' && (
          <span className="chip">&lt; {Number(safeFilters.maxViews).toLocaleString()} views</span>
        )}

        {safeFilters.activeTags.map((tag) => (
          <span key={tag} className="chip flex items-center gap-2 border-zinc-400 bg-white">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="tooltip-anchor rounded-full border border-red-300 px-1 text-[10px] leading-none text-red-600 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
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
