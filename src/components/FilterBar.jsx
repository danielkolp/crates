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

const QUICK_TAG_LIMIT = 6

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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMoreTags, setShowMoreTags] = useState(false)

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
    setShowMoreTags(false)
  }

  function handleAddTagSubmit(event) {
    event.preventDefault()
    addTag(pendingTag)
    setPendingTag('')
  }

  const selectedGenre =
    safeFilters.style && safeFilters.style !== 'all'
      ? safeFilters.style
      : safeFilters.genre || 'all'

  const advancedActiveItems = [
    safeFilters.format !== 'all',
    safeFilters.vibe !== 'all',
    safeFilters.minGemScore !== 'any',
    safeFilters.activeTags.length > 0,
    safeFilters.lowViewsOnly,
    safeFilters.strictGemsOnly,
    safeFilters.strictCrateDiggingMode,
  ].filter(Boolean).length

  const hasActiveFilters =
    selectedGenre !== 'all' ||
    safeFilters.maxViews !== 'any' ||
    safeFilters.sortBy !== 'gemScore' ||
    advancedActiveItems > 0

  const quickTags = showMoreTags ? allTags.slice(0, 18) : allTags.slice(0, QUICK_TAG_LIMIT)
  const hiddenTagCount = Math.max(allTags.length - QUICK_TAG_LIMIT, 0)

  return (
    <section className="discover-filter-panel rounded-xl border border-zinc-200/70 bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.015)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Discover Gems</h2>
          <p className="mt-1 text-xs text-zinc-500">
            We dig through the noise so you don't have to.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={[
              'h-9 rounded-lg border px-3 text-xs font-semibold transition',
              showAdvanced || advancedActiveItems > 0
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900',
            ].join(' ')}
            aria-expanded={showAdvanced}
          >
            Advanced{advancedActiveItems > 0 ? ` (${advancedActiveItems})` : ''}
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasActiveFilters}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-200 pt-4 md:grid-cols-[minmax(14rem,1.25fr)_minmax(9rem,0.75fr)_minmax(9rem,0.75fr)]">
        {genreOptions.length > 0 && (
          <GenreDropdown
            value={selectedGenre}
            options={genreOptions}
            totalCount={tracks.length}
            onChange={updateGenre}
          />
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
          <span className="muted-label">Sort</span>
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
      </div>

      {showAdvanced && (
        <div className="advanced-filter-panel mt-4 space-y-4 border-t border-zinc-200 pt-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            {quickTags.length > 0 && (
              <div className="min-w-0 space-y-2">
                <span className="muted-label">Quick Tags</span>
                <div className="hide-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-1">
                  {quickTags.map((tag) => {
                    const active = safeFilters.activeTags.includes(tag)

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => (active ? removeTag(tag) : addTag(tag))}
                        className={[
                          'chip shrink-0 gap-1 transition',
                          active
                            ? 'border-zinc-900 bg-zinc-900 text-white hover:border-red-500 hover:bg-red-500 hover:text-white'
                            : 'hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700',
                        ].join(' ')}
                        aria-label={active ? `Remove tag ${tag}` : `Add tag ${tag}`}
                      >
                        <span className="font-semibold">{active ? 'x' : '+'}</span>
                        <span>{tag}</span>
                      </button>
                    )
                  })}

                  {hiddenTagCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMoreTags((prev) => !prev)}
                      className="chip shrink-0 border-dashed bg-white"
                    >
                      {showMoreTags ? 'Show fewer' : `+${hiddenTagCount} more`}
                    </button>
                  )}
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
                Low views
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

          <form
            onSubmit={handleAddTagSubmit}
            className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          >
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
              className="filter-tag-add-button inline-flex h-9 min-w-[4.75rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              <span aria-hidden="true">+</span>
              <span>Add</span>
            </button>

            {safeFilters.activeTags.length > 0 && (
              <button
                type="button"
                onClick={clearTags}
                className="h-9 min-w-[4.75rem] shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium transition hover:border-red-500 hover:bg-red-500 hover:text-white"
              >
                Clear tags
              </button>
            )}
          </form>
        </div>
      )}

      {(hasActiveFilters || digDeeperActive) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          {safeFilters.strictCrateDiggingMode && (
            <span className="chip border-zinc-900 bg-zinc-900 text-white">crate mode</span>
          )}

          {safeFilters.strictGemsOnly && (
            <span className="chip border-zinc-900 bg-zinc-900 text-white">strict gems</span>
          )}

          {safeFilters.lowViewsOnly && <span className="chip">low views</span>}

          {selectedGenre !== 'all' && <span className="chip">genre: {selectedGenre}</span>}

          {safeFilters.format !== 'all' && <span className="chip">format: {safeFilters.format}</span>}

          {safeFilters.vibe !== 'all' && <span className="chip">vibe: {safeFilters.vibe}</span>}

          {safeFilters.minGemScore !== 'any' && (
            <span className="chip">gem {safeFilters.minGemScore}+</span>
          )}

          {safeFilters.maxViews !== 'any' && (
            <span className="chip">&lt; {Number(safeFilters.maxViews).toLocaleString()} views</span>
          )}

          {safeFilters.activeTags.slice(0, 6).map((tag) => (
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

          {safeFilters.activeTags.length > 6 && (
            <span className="chip">+{safeFilters.activeTags.length - 6} tags</span>
          )}

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
      )}
    </section>
  )
}

export default FilterBar
