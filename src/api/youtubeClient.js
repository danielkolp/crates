// youtubeClient.js - handles searching YouTube for music tracks, normalizing results,
// and applying quality filters. Uses YouTube Data API v3 only.

import { attachGemScores, getTrackQualityScore } from '../utils/gemScore'
import {
  filterTracks,
  getAvailableFormatOptions,
  getAvailableStyleOptions,
  getMusicLikelihoodDetails,
  getTrackFormatLabels,
  getTrackStyleLabels,
  isLikelyMusicTrack,
  isLikelyShort,
} from '../utils/filterTracks'

const searchCache = new Map()
const DEV = import.meta.env.DEV

const YOUTUBE_DAILY_QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'dailyLimitExceededUnreg',
])

const SEED_QUERY_COUNT = 6
const YOUTUBE_RESULTS_PER_QUERY = 12
const YOUTUBE_VIDEO_DETAILS_BATCH_SIZE = 50
const DEFAULT_NUMERIC_SEED = '10000000'
const DISCOVERY_YEAR_START = 2012
const DISCOVERY_YEAR_END = 2026

const DISCOVERY_YEARS = Array.from(
  { length: DISCOVERY_YEAR_END - DISCOVERY_YEAR_START + 1 },
  (_, index) => String(DISCOVERY_YEAR_END - index),
)

const DISCOVERY_STYLES = [
  'uk garage',
  '2 step garage',
  'speed garage',
  'deep house',
  'lo-fi house',
  'tech house',
  'dub techno',
  'breakbeat',
  'jungle',
  'electro',
  'minimal',
  'soulful house',
  'uk funky',
  'bassline',
  'downtempo',
  'ambient',
]

const TRACK_VERSION_TERMS = [
  'original mix',
  'extended mix',
  'dub mix',
  'club mix',
]

const OCCASIONAL_TRACK_VERSION_TERMS = [
  'extended mix',
  'dub mix',
  'club mix',
]

const TRACK_FIRST_QUERY_FORMATS = [
  'official audio',
  'provided to youtube',
  'topic',
  'single',
  'track',
  'release',
  'original mix',
  'premiere',
  'white label',
  'vinyl rip',
  'b side',
]

const DISCOVERY_FORMATS = [
  ...TRACK_FIRST_QUERY_FORMATS,
  ...OCCASIONAL_TRACK_VERSION_TERMS,
]

const DISCOVERY_CONTEXTS = [
  'underground',
  'rare',
  'deep cut',
  'small label',
  'independent',
  'afterhours',
  'warehouse',
  'dubplate',
  '12 inch',
  'self released',
]

const DISCOVERY_QUERY_ACCENTS = [
  'deep cut',
  'low views',
  'small label',
  'independent release',
  'underrated',
  'raw',
  'club track',
  'dancefloor',
  'record label',
  'upload',
]

const DISCOVERY_INTENT_GROUPS = [
  ['official audio', 'single'],
  ['provided to youtube', 'topic'],
  ['track', 'release'],
  ['single', 'release'],
  ['official audio', 'track'],
  ['premiere', 'original mix'],
  ['full track', 'music'],
  ['vinyl', 'white label'],
]

const STYLE_VARIANT_GROUPS = [
  {
    aliases: ['uk garage', 'ukg', 'garage'],
    variants: [
      'uk garage',
      'ukg',
      '2 step garage',
      '2-step garage',
      'speed garage',
      'white label uk garage',
      'uk garage dub mix',
      'uk garage vinyl rip',
    ],
  },
  {
    aliases: ['house', 'deep house', 'tech house', 'soulful house'],
    variants: [
      'deep house',
      'underground house',
      'lo-fi house',
      'tech house',
      'soulful house',
      'house original mix',
      'house vinyl rip',
      'house dub mix',
    ],
  },
  {
    aliases: ['techno', 'dub techno', 'minimal'],
    variants: [
      'techno',
      'dub techno',
      'minimal techno',
      'detroit techno',
      'warehouse techno',
      'techno dub mix',
      'techno vinyl rip',
    ],
  },
  {
    aliases: ['breakbeat', 'breaks', 'jungle', 'drum & bass', 'drum and bass', 'dnb'],
    variants: [
      'breakbeat',
      'breaks',
      'jungle',
      'drum and bass',
      'dnb',
      'breaks dubplate',
      'jungle vinyl rip',
      'breakbeat white label',
    ],
  },
  {
    aliases: ['electro', 'ambient', 'downtempo'],
    variants: [
      'electro',
      'ambient',
      'downtempo',
      'electronica',
      'idm',
      'ambient dub',
      'electro vinyl rip',
    ],
  },
  {
    aliases: ['uk funky', 'bassline'],
    variants: [
      'uk funky',
      'bassline',
      'funky house',
      'uk funky white label',
      'bassline dub',
      'uk funky vinyl rip',
    ],
  },
]

const ALL_DISCOVERY_STYLE_VARIANTS = [
  ...new Set([
    ...DISCOVERY_STYLES,
    ...STYLE_VARIANT_GROUPS.flatMap((group) => group.variants),
  ]),
]

const SEARCH_DEFAULTS = [
  'underground uk garage full track',
  '2 step garage vinyl',
  'white label garage dub',
  'underground house official audio',
  'breaks dub track',
]

const MUSIC_INTENT_APPEND = [
  'official audio',
  'provided to youtube',
  'topic',
  'single',
  'track',
  'release',
  'full track',
  'music',
  'original mix',
  'premiere',
]

const OPTIONAL_INTENT = [
  'official audio',
  'topic',
  'provided to youtube',
  'single',
  'release',
  'track',
  'original mix',
]

const HARD_NON_MUSIC_PATTERNS = [
  { label: 'tutorial', pattern: /\btutorial\b|\bhow to\b|\blesson\b|\bwalkthrough\b/i },
  { label: 'production-tutorial', pattern: /\bableton\b|\bfl studio\b|\bmixing tutorial\b|\bmastering tutorial\b/i },
  { label: 'reaction', pattern: /\breaction\b|\breacts?\b|\bfirst time hearing\b/i },
  { label: 'review', pattern: /\breview\b|\bunboxing\b|\bgear review\b/i },
  { label: 'interview-podcast', pattern: /\binterview\b|\bpodcast\b/i },
  { label: 'explainer', pattern: /\bexplained\b|\bvideo essay\b|\bbehind the scenes\b/i },
  { label: 'vlog-prank', pattern: /\bvlog\b|\bprank\b/i },
  { label: 'game-content', pattern: /\bminecraft\b|\broblox\b|\bfortnite\b/i },
]

const HARD_LONG_FORM_TITLE_PATTERN =
  /\b(?:dj\s*set|live\s*set|radio\s*show|podcast|compilation|playlist|boiler\s*room|essential\s*mix|mixmag|hour\s*mix|full\s*mix)\b/i

const DATED_MIX_TITLE_PATTERN =
  /\bmix\s*(?:20\d{2})\b|\b(?:20\d{2})\s*mix\b/i

const LONG_FORM_DURATION_KEYWORD_PATTERN =
  /\b(?:mix|set|session|radio|show|compilation|playlist)\b/i

const TRACK_VERSION_TITLE_PATTERN = new RegExp(
  `\\b(?:${TRACK_VERSION_TERMS.map((term) => term.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'i',
)

const EXCLUDE_TERMS = [
  '-shorts',
  '-reaction',
  '-kids',
  '-news',
  '-cover',
  '-tutorial',
  '-podcast',
  '-compilation',
  '-playlist',
  '-boiler',
  '-mixmag',
  '-"dj set"',
  '-"live set"',
  '-"radio show"',
]

let lastSearchStatus = {
  source: 'youtube',
  usedFallback: false,
  message: 'Ready for live YouTube search.',
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function getEntropyInt(maxExclusive) {
  const max = Math.max(Number(maxExclusive) || 1, 1)

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return values[0] % max
  }

  const performanceNow =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : 0
  const fallback = Date.now() + Math.floor(performanceNow * 1000)
  return Math.abs(fallback) % max
}

export function createNumericSeed() {
  const length = 8 + getEntropyInt(9)
  const digits = [String(1 + getEntropyInt(9))]

  for (let index = 1; index < length; index += 1) {
    digits.push(String(getEntropyInt(10)))
  }

  return digits.join('')
}

export function normalizeNumericSeed(seed = DEFAULT_NUMERIC_SEED) {
  const rawValue =
    typeof seed === 'object' && seed
      ? seed.numericSeed || seed.id || seed.seed || ''
      : seed

  const digits = String(rawValue || '').replace(/\D/g, '')

  if (!digits) {
    return DEFAULT_NUMERIC_SEED
  }

  if (digits.length < 8) {
    return digits.padEnd(8, '0')
  }

  return digits.slice(0, 16)
}

function hashSeed(seed) {
  const value = String(seed || DEFAULT_NUMERIC_SEED)
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function createSeededRandom(seed = DEFAULT_NUMERIC_SEED) {
  let state = hashSeed(seed) || 0x6d2b79f5

  return function seededRandom() {
    state += 0x6d2b79f5

    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function seededPick(array = [], rng = createSeededRandom()) {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined
  }

  const index = Math.floor(rng() * array.length)
  return array[Math.min(index, array.length - 1)]
}

export function seededShuffle(array = [], rng = createSeededRandom()) {
  const next = [...array]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

function getApiKey() {
  return import.meta.env.VITE_YOUTUBE_API_KEY || ''
}

function cleanYouTubeVideoId(value) {
  const match = String(value || '').match(/[a-zA-Z0-9_-]{11}/)
  return match?.[0] || ''
}

function extractYouTubeVideoId(value) {
  const raw = String(value || '').trim().replace(/^yt-/, '')

  if (!raw) return ''
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw

  try {
    const url = new URL(raw)
    const videoParam = cleanYouTubeVideoId(url.searchParams.get('v'))

    if (videoParam) return videoParam

    const pathParts = url.pathname.split('/').filter(Boolean)

    if (url.hostname.includes('youtu.be')) {
      return cleanYouTubeVideoId(pathParts[0])
    }

    const idParentIndex = pathParts.findIndex((part) =>
      ['embed', 'live', 'shorts', 'v'].includes(part.toLowerCase()),
    )

    if (idParentIndex >= 0) {
      return cleanYouTubeVideoId(pathParts[idParentIndex + 1])
    }

    return cleanYouTubeVideoId(pathParts[pathParts.length - 1])
  } catch {
    const urlLikeMatch = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/)
    return urlLikeMatch?.[1] || ''
  }
}

function setSearchStatus(source, usedFallback, message, details = {}) {
  lastSearchStatus = {
    source,
    usedFallback,
    message,
    ...details,
  }
}

export function getLastSearchStatus() {
  return lastSearchStatus
}

function getYouTubeErrorReasons(data) {
  const reasons = Array.isArray(data?.error?.errors)
    ? data.error.errors.map((item) => item?.reason).filter(Boolean)
    : []

  if (data?.error?.status) {
    reasons.push(data.error.status)
  }

  return reasons
}

function isYouTubeDailyQuotaReason(reason) {
  return YOUTUBE_DAILY_QUOTA_REASONS.has(String(reason || '').trim())
}

export function isYouTubeDailyQuotaError(error) {
  if (error?.isDailyQuotaExceeded) {
    return true
  }

  return isYouTubeDailyQuotaReason(error?.quotaReason || error?.reason)
}

function normalizeCacheList(values = []) {
  return [...values].map((value) => String(value).toLowerCase()).sort()
}

function normalizeDiscoveryText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s&+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueDiscoveryValues(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function getSelectedDiscoveryStyle(filters = {}) {
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre && filters.genre !== 'all'
        ? filters.genre
        : ''

  return String(selectedStyle || '').trim()
}

function getKnownStyleVariants(style) {
  const normalizedStyle = normalizeDiscoveryText(style)

  if (!normalizedStyle) {
    return []
  }

  const variantGroup = STYLE_VARIANT_GROUPS.find((group) =>
    group.aliases.some((alias) => normalizeDiscoveryText(alias) === normalizedStyle),
  )

  return variantGroup?.variants || []
}

function getStyleVariantPool(filters = {}) {
  const selectedStyle = getSelectedDiscoveryStyle(filters)

  if (!selectedStyle) {
    return ALL_DISCOVERY_STYLE_VARIANTS
  }

  const knownVariants = getKnownStyleVariants(selectedStyle)

  return uniqueDiscoveryValues([
    selectedStyle,
    ...knownVariants,
    `underground ${selectedStyle}`,
    `${selectedStyle} original mix`,
    `${selectedStyle} extended mix`,
    `${selectedStyle} dub mix`,
    `${selectedStyle} vinyl rip`,
    `${selectedStyle} white label`,
  ])
}

function buildSeedUploadWindow(year, spanYears = 1) {
  const numericYear = Number(year)
  const numericSpan = Math.max(Number(spanYears) || 1, 1)

  if (!Number.isInteger(numericYear) || numericYear < DISCOVERY_YEAR_START) {
    return null
  }

  const startYear = Math.min(Math.max(numericYear, DISCOVERY_YEAR_START), DISCOVERY_YEAR_END)
  const endYear = Math.min(startYear + numericSpan, DISCOVERY_YEAR_END + 1)
  const after = Date.UTC(startYear, 0, 1)
  const before = Date.UTC(endYear, 0, 1)

  if (before <= after) {
    return null
  }

  return {
    after: new Date(after).toISOString(),
    before: new Date(before).toISOString(),
  }
}

export function buildSeedProfile(seed = DEFAULT_NUMERIC_SEED, filters = {}) {
  const numericSeed = normalizeNumericSeed(seed)
  const rng = createSeededRandom(`${numericSeed}:profile`)
  const styleVariants = seededShuffle(getStyleVariantPool(filters), rng)
  const style = styleVariants[0] || seededPick(ALL_DISCOVERY_STYLE_VARIANTS, rng) || 'underground music'
  const format = seededPick(DISCOVERY_FORMATS, rng) || 'official audio'
  const context = seededPick(DISCOVERY_CONTEXTS, rng) || 'underground'
  const year = seededPick(DISCOVERY_YEARS, rng) || String(DISCOVERY_YEAR_END)
  const windowSpanYears = seededPick([1, 1, 1, 2, 2, 3], rng) || 1
  const uploadWindow = buildSeedUploadWindow(year, windowSpanYears)

  return {
    id: numericSeed,
    numericSeed,
    selectedGenre: getSelectedDiscoveryStyle(filters) || 'all',
    style,
    styleVariants,
    format,
    context,
    year,
    windowSpanYears,
    uploadWindow,
    queryPlan: [],
  }
}

export function createDiscoverySeed(seedOrFilters, maybeFilters = {}) {
  const firstArgLooksLikeFilters =
    seedOrFilters &&
    typeof seedOrFilters === 'object' &&
    !seedOrFilters.numericSeed &&
    !seedOrFilters.seed &&
    !seedOrFilters.id

  const filters = firstArgLooksLikeFilters ? seedOrFilters : maybeFilters
  const seed = firstArgLooksLikeFilters || seedOrFilters === undefined || seedOrFilters === null
    ? createNumericSeed()
    : seedOrFilters
  const seedProfile = buildSeedProfile(seed, filters)
  const queryPlan = buildSeededSearchQueries('', filters, seedProfile)

  return {
    ...seedProfile,
    queryPlan,
  }
}

function getDiscoverySeedKey(discoverySeed) {
  return normalizeNumericSeed(discoverySeed)
}

function buildSearchKey(query, filters = {}) {
  return JSON.stringify({
    query: String(query || '').trim().toLowerCase(),
    refreshKey: filters.refreshKey ?? 0,
    discoverySeed: getDiscoverySeedKey(filters.discoverySeed),
    seedQueryCount: SEED_QUERY_COUNT,
    youtubeResultsPerQuery: YOUTUBE_RESULTS_PER_QUERY,
    genre: filters.genre ?? 'all',
    style: filters.style ?? 'all',
    format: filters.format ?? 'all',
    vibe: filters.vibe ?? 'all',
    maxViews: filters.maxViews ?? 'any',
    minGemScore: filters.minGemScore ?? 'any',
    lowViewsOnly: Boolean(filters.lowViewsOnly),
    strictGemsOnly: Boolean(filters.strictGemsOnly),
    strictCrateDiggingMode: Boolean(filters.strictCrateDiggingMode),
    musicTracksOnly: Boolean(filters.musicTracksOnly),
    hideShorts: Boolean(filters.hideShorts),
    preferTopicChannels: Boolean(filters.preferTopicChannels),
    sortBy: filters.sortBy ?? 'gemScore',
    activeTags: normalizeCacheList(filters.activeTags || []),
    digDeeperTags: normalizeCacheList(filters.digDeeperTags || []),
  })
}

function parseYouTubeDuration(duration = '') {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i)

  if (!match) {
    return { seconds: 0, label: '0:00' }
  }

  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  const labelMinutes = Math.floor(totalSeconds / 60)
  const labelSeconds = totalSeconds % 60

  return {
    seconds: totalSeconds,
    label: `${labelMinutes}:${String(labelSeconds).padStart(2, '0')}`,
  }
}

function buildWaveformSeed(youtubeVideoId) {
  const length = 24
  const seed = String(youtubeVideoId || 'seed')
  const values = []

  for (let index = 0; index < length; index += 1) {
    const charCode = seed.charCodeAt(index % seed.length) || 48
    const value = ((charCode + index * 17) % 70) / 100 + 0.25
    values.push(Number(Math.min(value, 0.92).toFixed(2)))
  }

  return values
}

function countHashtags(text = '') {
  return (String(text).match(/#[\w-]+/g) || []).length
}

function emojiHeavyTitle(title = '') {
  const value = String(title)
  const emojiLike = (value.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) || []).length
  const alnum = (value.match(/[a-z0-9]/gi) || []).length

  return emojiLike > 4 && emojiLike > alnum
}

function promoWordCount(text = '') {
  const promoWords = ['bio', 'viral', 'subscribe', 'follow', 'new song', 'newsong']
  const normalized = String(text).toLowerCase()

  return promoWords.reduce((count, word) => count + (normalized.includes(word) ? 1 : 0), 0)
}

function getTrackDurationSeconds(track) {
  const directDuration = Number(track?.durationSeconds)

  if (Number.isFinite(directDuration) && directDuration >= 0) {
    return directDuration
  }

  return parseYouTubeDuration(String(track?.duration || '')).seconds
}

function titleClearlyLooksLikeSingleTrack(title = '') {
  const normalizedTitle = String(title || '').trim()

  if (!normalizedTitle) {
    return false
  }

  if (HARD_LONG_FORM_TITLE_PATTERN.test(normalizedTitle) || DATED_MIX_TITLE_PATTERN.test(normalizedTitle)) {
    return false
  }

  if (TRACK_VERSION_TITLE_PATTERN.test(normalizedTitle)) {
    return true
  }

  return (
    /\S+\s[-\u2013\u2014]\s\S+/.test(normalizedTitle) &&
    !LONG_FORM_DURATION_KEYWORD_PATTERN.test(normalizedTitle)
  )
}

export function isLikelyLongFormMix(track) {
  const title = String(track?.title || '')
  const durationSeconds = getTrackDurationSeconds(track)

  if (HARD_LONG_FORM_TITLE_PATTERN.test(title) || DATED_MIX_TITLE_PATTERN.test(title)) {
    return true
  }

  if (durationSeconds > 20 * 60) {
    return !titleClearlyLooksLikeSingleTrack(title)
  }

  if (durationSeconds > 12 * 60 && LONG_FORM_DURATION_KEYWORD_PATTERN.test(title)) {
    return true
  }

  return false
}

function getSeededTerms(values = [], rng, limit = 2) {
  return seededShuffle(values, rng).slice(0, limit).filter(Boolean)
}

function getSeededQueryFormatPool(seedProfile, filters, rng) {
  const selectedFormat = filters.format && filters.format !== 'all' ? filters.format : ''
  const occasionalTrackVersion = seededPick(OCCASIONAL_TRACK_VERSION_TERMS, rng)

  return uniqueDiscoveryValues([
    seedProfile.format,
    selectedFormat,
    ...TRACK_FIRST_QUERY_FORMATS,
    occasionalTrackVersion,
  ])
}

function buildYouTubeQuery(query, filters = {}, seedProfile = buildSeedProfile(filters.discoverySeed, filters), queryPlanItem = {}) {
  const parts = []
  const rng = createSeededRandom(`${seedProfile.numericSeed}:query:${queryPlanItem.index ?? 0}`)

  const normalizedQuery = String(query || '').trim()
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre

  const hasSelectedStyle = selectedStyle && selectedStyle !== 'all'
  const style = queryPlanItem.style || seedProfile.style
  const format = filters.format && filters.format !== 'all'
    ? filters.format
    : queryPlanItem.format || seedProfile.format
  const context = queryPlanItem.context || seedProfile.context
  const accent = queryPlanItem.accent || seededPick(DISCOVERY_QUERY_ACCENTS, rng)
  const intentGroup = queryPlanItem.intentGroup || seededPick(DISCOVERY_INTENT_GROUPS, rng) || []

  if (normalizedQuery) {
    parts.push(normalizedQuery)
    if (style) {
      parts.push(style)
    }
  } else if (hasSelectedStyle) {
    parts.push(`underground ${style || selectedStyle}`)
  } else if (style) {
    parts.push(`underground ${style}`)
  } else {
    parts.push(seededPick(SEARCH_DEFAULTS, rng))
  }

  if (hasSelectedStyle && normalizedQuery && !normalizeDiscoveryText(normalizedQuery).includes(normalizeDiscoveryText(selectedStyle))) {
    parts.push(selectedStyle)
  }

  if (format) {
    parts.push(format)
  }

  if (context) {
    parts.push(context)
  }

  if (accent) {
    parts.push(accent)
  }

  if (filters.vibe && filters.vibe !== 'all') {
    parts.push(filters.vibe)
  }

  if (Array.isArray(filters.activeTags) && filters.activeTags.length > 0) {
    parts.push(filters.activeTags.slice(0, 3).join(' '))
  }

  if (Array.isArray(filters.digDeeperTags) && filters.digDeeperTags.length > 0) {
    parts.push(filters.digDeeperTags.slice(0, 3).join(' '))
  }

  if (filters.musicTracksOnly !== false) {
    parts.push(...uniqueDiscoveryValues([...intentGroup, ...getSeededTerms(MUSIC_INTENT_APPEND, rng, 1)]))
  }

  if (filters.preferTopicChannels !== false) {
    parts.push(...getSeededTerms(OPTIONAL_INTENT, rng, 2))
  }

  parts.push(...EXCLUDE_TERMS)

  return uniqueDiscoveryValues(parts)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildSeededSearchQueries(query = '', filters = {}, seedProfile = buildSeedProfile(filters.discoverySeed, filters)) {
  const rng = createSeededRandom(`${seedProfile.numericSeed}:queries`)
  const styles = seededShuffle(seedProfile.styleVariants?.length ? seedProfile.styleVariants : getStyleVariantPool(filters), rng)
  const formats = seededShuffle(getSeededQueryFormatPool(seedProfile, filters, rng), rng)
  const contexts = seededShuffle(uniqueDiscoveryValues([
    seedProfile.context,
    ...DISCOVERY_CONTEXTS,
    ...DISCOVERY_QUERY_ACCENTS,
  ]), rng)
  const queryPlan = []
  const seenQueries = new Set()
  const maxAttempts = SEED_QUERY_COUNT * 4

  for (let attempt = 0; queryPlan.length < SEED_QUERY_COUNT && attempt < maxAttempts; attempt += 1) {
    const planItem = {
      index: queryPlan.length,
      style: styles[attempt % styles.length] || seedProfile.style,
      format: formats[attempt % formats.length] || seedProfile.format,
      context: contexts[attempt % contexts.length] || seedProfile.context,
      accent: seededPick(DISCOVERY_QUERY_ACCENTS, rng),
      intentGroup: seededPick(DISCOVERY_INTENT_GROUPS, rng),
      year: seedProfile.year,
      uploadWindow: seedProfile.uploadWindow,
    }
    const searchQuery = buildYouTubeQuery(query, filters, seedProfile, planItem)
    const normalizedSearchQuery = normalizeDiscoveryText(searchQuery)

    if (!normalizedSearchQuery || seenQueries.has(normalizedSearchQuery)) {
      continue
    }

    seenQueries.add(normalizedSearchQuery)
    queryPlan.push({
      ...planItem,
      searchQuery,
    })
  }

  return queryPlan
}

function findHardNonMusicPattern(title = '', description = '', channel = '') {
  const haystack = `${title} ${description} ${channel}`
  return HARD_NON_MUSIC_PATTERNS.find(({ pattern }) => pattern.test(haystack)) || null
}

function incrementReason(map, reason) {
  map.set(reason, (map.get(reason) || 0) + 1)
}

function stripTopicSuffix(name = '') {
  const normalized = String(name || '').trim()

  if (!normalized) {
    return ''
  }

  const withoutTopicSuffix = normalized.replace(/\s*[-\u2013\u2014]\s*topic\s*$/i, '').trim()
  return withoutTopicSuffix || normalized
}

function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeYouTubeVideo(video, filters = {}) {
  if (!video) {
    return null
  }

  const youtubeVideoId = video.id?.videoId || video.id || ''
  const snippet = video.snippet || {}
  const statistics = video.statistics || {}
  const contentDetails = video.contentDetails || {}
  const parsedDuration = parseYouTubeDuration(contentDetails.duration || 'PT0S')
  const sourceChannelTitle = snippet.channelTitle || 'Unknown Channel'
  const displayArtist = stripTopicSuffix(sourceChannelTitle) || sourceChannelTitle

  const genre =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre && filters.genre !== 'all'
        ? filters.genre
        : ''

  const vibe = filters.vibe && filters.vibe !== 'all' ? filters.vibe : ''

  const tags = [
    ...(Array.isArray(snippet.tags) ? snippet.tags : []),
    ...(filters.activeTags || []),
  ]

  const normalizedTrack = {
    id: youtubeVideoId ? `yt-${youtubeVideoId}` : `yt-${snippet.channelId || snippet.title || 'unknown'}`,
    youtubeVideoId,
    title: snippet.title || 'Untitled Upload',
    description: snippet.description || '',
    artist: displayArtist,
    channelTitle: displayArtist,
    sourceChannelTitle,
    duration: parsedDuration.label,
    durationSeconds: parsedDuration.seconds,
    categoryId: Number(snippet.categoryId || 0),
    genre,
    vibe,
    tags,
    views: Number(statistics.viewCount || 0),
    likes: Number(statistics.likeCount || 0),
    comments: Number(statistics.commentCount || 0),
    publishedAt: snippet.publishedAt || new Date().toISOString(),
    artworkUrl: youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : '',
    thumbnailUrl: youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : '',
    waveform: buildWaveformSeed(youtubeVideoId),
    embedUrl: youtubeVideoId ? `https://www.youtube.com/embed/${youtubeVideoId}` : '',
  }

  const styles = getTrackStyleLabels(normalizedTrack)
  const formats = getTrackFormatLabels(normalizedTrack)

  const enhancedTags = [
    ...normalizedTrack.tags,
    ...styles.map((style) => style.toLowerCase()),
    ...formats.map((format) => format.toLowerCase()),
  ]

  return {
    ...normalizedTrack,
    genre: styles[0] || '',
    style: styles[0] || '',
    styles,
    format: formats[0] || 'Track',
    formats,
    platform: 'YouTube',
    tags: [...new Set(enhancedTags.map(normalizeTag).filter(Boolean))],
  }
}

function evaluateVideoQuality(track, filters = {}) {
  const title = String(track.title || '')
  const description = String(track.description || '')
  const channel = String(track.sourceChannelTitle || track.channelTitle || '')
  const musicLikelihood = getMusicLikelihoodDetails(track)
  const hashtagCountTitle = countHashtags(title)
  const hashtagCountDescription = countHashtags(description)
  const qualityScore = getTrackQualityScore(track)

  if (isLikelyLongFormMix(track)) {
    return {
      keep: false,
      reason: 'rejected: long-form mix/set',
      qualityScore,
      musicLikelihood,
    }
  }

  if (filters.hideShorts !== false && isLikelyShort(track)) {
    return {
      keep: false,
      reason: 'rejected: shorts guard',
      qualityScore,
      musicLikelihood,
    }
  }

  const hardNonMusicPattern = findHardNonMusicPattern(title, description, channel)

  if (hardNonMusicPattern && musicLikelihood.score < 7.1) {
    return {
      keep: false,
      reason: `rejected: non-music intent (${hardNonMusicPattern.label})`,
      qualityScore,
      musicLikelihood,
    }
  }

  if (filters.musicTracksOnly !== false && !isLikelyMusicTrack(track)) {
    return {
      keep: false,
      reason: 'rejected: low music likelihood',
      qualityScore,
      musicLikelihood,
    }
  }

  if (hashtagCountTitle > 3 && musicLikelihood.score < 7.5) {
    return {
      keep: false,
      reason: 'rejected: title hashtag spam',
      qualityScore,
      musicLikelihood,
    }
  }

  if (hashtagCountDescription > 14 && musicLikelihood.score < 7.5) {
    return {
      keep: false,
      reason: 'rejected: description hashtag spam',
      qualityScore,
      musicLikelihood,
    }
  }

  if (emojiHeavyTitle(title) && musicLikelihood.score < 7.5) {
    return {
      keep: false,
      reason: 'rejected: emoji-heavy title',
      qualityScore,
      musicLikelihood,
    }
  }

  if (promoWordCount(title) >= 2 && musicLikelihood.score < 7.5) {
    return {
      keep: false,
      reason: 'rejected: promo-heavy title',
      qualityScore,
      musicLikelihood,
    }
  }

  if (qualityScore < 2.4 && musicLikelihood.score < 5.4) {
    return {
      keep: false,
      reason: 'rejected: low track quality score',
      qualityScore,
      musicLikelihood,
    }
  }

  return {
    keep: true,
    qualityScore,
    musicLikelihood,
  }
}

async function fetchYouTubeJson(url) {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('[CrateDigger][youtube] full API error:', data)

    const reasons = getYouTubeErrorReasons(data)
    const reason =
      reasons[0] ||
      `HTTP_${response.status}`
    const quotaReason = reasons.find(isYouTubeDailyQuotaReason) || ''
    const error = new Error(`YouTube request failed: ${response.status} (${reason})`)

    error.name = 'YouTubeApiError'
    error.status = response.status
    error.reason = reason
    error.quotaReason = quotaReason
    error.isDailyQuotaExceeded = Boolean(quotaReason)
    error.details = data?.error || null

    throw error
  }

  return data
}

function getVideoId(track) {
  return String(track?.youtubeVideoId || track?.videoId || track?.id || '').replace(/^yt-/, '')
}

function summarizeTopTrack(track) {
  const breakdown = track.scoreBreakdown || {}

  return {
    title: track.title,
    channel: track.sourceChannelTitle || track.channelTitle || track.artist,
    style: track.style,
    styles: track.styles,
    format: track.format,
    views: track.views,
    qualityScore: track.qualityScore,
    gemScore: track.gemScore,
    musicLikelihood: breakdown.musicLikelihood,
    baseGemScore: breakdown.baseGemScore,
    engagementBoost: breakdown.engagementBoost,
    lowViewBoost: breakdown.lowViewBoost,
    nicheGenreBoost: breakdown.nicheGenreBoost,
    topicBoost: breakdown.topicBoost,
    qualityBoost: breakdown.qualityBoost,
    penalties: breakdown.penalties,
    finalGemScore: breakdown.finalGemScore,
  }
}

function debugYouTubeResults({ searchQuery, queryPlan, candidates, accepted, rejectedCounts, scored }) {
  if (!DEV) {
    return
  }

  console.groupCollapsed(`[CrateDigger][youtube] accepted ${accepted.length}/${candidates.length}`)
  console.log('query:', searchQuery)
  console.table(queryPlan || [])

  console.table(
    Array.from(rejectedCounts.entries()).map(([reason, count]) => ({
      reason,
      count,
    })),
  )

  console.table(
    [...scored]
      .sort((a, b) => b.gemScore - a.gemScore)
      .slice(0, 10)
      .map(summarizeTopTrack),
  )

  console.table(getAvailableStyleOptions(scored).slice(0, 15))
  console.table(getAvailableFormatOptions(scored).slice(0, 15))

  const goldCandidate =
    scored.find((track) => getVideoId(track) === 'AE_fJPFMC1M') ||
    candidates.find((track) => getVideoId(track) === 'AE_fJPFMC1M')

  if (goldCandidate) {
    console.log('[CrateDigger][gold-hidden-gem]', {
      accepted: scored.some((track) => getVideoId(track) === 'AE_fJPFMC1M'),
      musicLikelihood: getMusicLikelihoodDetails(goldCandidate),
      scoreBreakdown: goldCandidate.scoreBreakdown,
      track: goldCandidate,
    })
  }

  if (candidates.length > 0 && accepted.length / candidates.length <= 0.25) {
    console.warn('[CrateDigger][youtube] preflight removed most candidates', {
      candidates: candidates.length,
      accepted: accepted.length,
    })
  }

  console.groupEnd()
}

function chunkArray(values = [], chunkSize = YOUTUBE_VIDEO_DETAILS_BATCH_SIZE) {
  const chunks = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

async function fetchYouTubeSearchVideoIds(apiKey, queryPlanItem) {
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')

  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', String(YOUTUBE_RESULTS_PER_QUERY))
  searchUrl.searchParams.set('videoCategoryId', '10')
  searchUrl.searchParams.set('videoEmbeddable', 'true')
  searchUrl.searchParams.set('videoSyndicated', 'true')
  searchUrl.searchParams.set('safeSearch', 'none')
  searchUrl.searchParams.set('q', queryPlanItem.searchQuery)
  searchUrl.searchParams.set('key', apiKey)

  if (queryPlanItem.uploadWindow) {
    searchUrl.searchParams.set('publishedAfter', queryPlanItem.uploadWindow.after)
    searchUrl.searchParams.set('publishedBefore', queryPlanItem.uploadWindow.before)
  }

  const searchResult = await fetchYouTubeJson(searchUrl.toString())
  return (searchResult.items || []).map((item) => item.id?.videoId).filter(Boolean)
}

async function fetchYouTubeVideosByIds(apiKey, videoIds = []) {
  const videosById = new Map()

  for (const videoIdChunk of chunkArray(videoIds)) {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')

    videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    videosUrl.searchParams.set('id', videoIdChunk.join(','))
    videosUrl.searchParams.set('key', apiKey)

    const videosResult = await fetchYouTubeJson(videosUrl.toString())

    ;(videosResult.items || []).forEach((item) => {
      videosById.set(item.id, item)
    })
  }

  return videosById
}

async function fetchYouTubeTracks(query, filters = {}) {
  const apiKey = getApiKey()

  if (!apiKey) {
    return []
  }

  const seedProfile = buildSeedProfile(filters.discoverySeed, filters)
  const queryPlan = buildSeededSearchQueries(query, filters, seedProfile)
  const seenVideoIds = new Set()
  const videoIds = []

  for (const queryPlanItem of queryPlan) {
    const queryVideoIds = await fetchYouTubeSearchVideoIds(apiKey, queryPlanItem)

    queryVideoIds.forEach((videoId) => {
      if (seenVideoIds.has(videoId)) {
        return
      }

      seenVideoIds.add(videoId)
      videoIds.push(videoId)
    })
  }

  if (videoIds.length === 0) {
    return []
  }

  const videosById = await fetchYouTubeVideosByIds(apiKey, videoIds)
  const candidates = videoIds
    .map((videoId) => normalizeYouTubeVideo(videosById.get(videoId), filters))
    .filter(Boolean)

  const accepted = []
  const rejectedCounts = new Map()

  for (const candidate of candidates) {
    const qualityCheck = evaluateVideoQuality(candidate, filters)

    if (!qualityCheck.keep) {
      incrementReason(rejectedCounts, qualityCheck.reason)
      continue
    }

    accepted.push(candidate)
  }

  const scored = attachGemScores(accepted)

  debugYouTubeResults({
    searchQuery: queryPlan.map((item) => item.searchQuery).join(' | '),
    queryPlan,
    candidates,
    accepted,
    rejectedCounts,
    scored,
  })

  return scored
}

export async function searchTracks(query = '', filters = {}) {
  const effectiveFilters = {
    ...filters,
    refreshKey: filters.refreshKey ?? 0,
    discoverySeed: filters.discoverySeed ?? '',
  }
  const seedProfile = buildSeedProfile(effectiveFilters.discoverySeed, effectiveFilters)
  const queryPlan = buildSeededSearchQueries(query, effectiveFilters, seedProfile)

  const cacheKey = buildSearchKey(query, effectiveFilters)

  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)
  }

  const cachedPromise = (async () => {
    const apiKey = getApiKey()

    if (!apiKey) {
      setSearchStatus(
        'youtube',
        false,
        'No YouTube API key found. Add VITE_YOUTUBE_API_KEY to enable live search.',
      )

      await wait(180)
      return []
    }

    try {
      const apiTracks = await fetchYouTubeTracks(query, effectiveFilters)

      if (Array.isArray(apiTracks)) {
        setSearchStatus(
          'youtube',
          false,
          apiTracks.length === 0
            ? 'No clean music tracks found for this search.'
            : 'Live YouTube results loaded.',
          {
            discoverySeed: {
              ...seedProfile,
              queryPlan,
            },
          },
        )

        return seededShuffle(
          filterTracks(apiTracks, { ...effectiveFilters, query: '' }),
          createSeededRandom(`${seedProfile.numericSeed}:result-order`),
        )
      }
    } catch (error) {
      console.error('[CrateDigger][youtube] request failed', error)

      if (isYouTubeDailyQuotaError(error)) {
        setSearchStatus(
          'youtube',
          false,
          'YouTube API daily quota exceeded. Discovery will resume after the quota resets or you update the API key.',
          {
            isQuotaExceeded: true,
            errorReason: error.quotaReason || error.reason || 'quotaExceeded',
          },
        )
      } else {
        setSearchStatus(
          'youtube',
          false,
          'YouTube request failed. Try again or check your API key/quota.',
        )
      }

      await wait(180)
      return []
    }

    setSearchStatus('youtube', false, 'Live YouTube results loaded.')
    return []
  })()

  searchCache.set(cacheKey, cachedPromise)

  try {
    const result = await cachedPromise
    searchCache.set(cacheKey, Promise.resolve(result))
    return result
  } catch (error) {
    searchCache.delete(cacheKey)
    throw error
  }
}

export async function searchYouTubeVideos(query = '', filters = {}) {
  return fetchYouTubeTracks(query, {
    ...filters,
    refreshKey: filters.refreshKey ?? 0,
    discoverySeed: filters.discoverySeed ?? '',
  })
}

export async function getTrackById(id) {
  const videoId = extractYouTubeVideoId(id)

  if (!videoId) {
    return null
  }

  return getVideoDetails(videoId)
}

export async function getRelatedTracks(trackId) {
  const baseTrack = await getTrackById(trackId)

  if (!baseTrack) {
    return []
  }

  const relatedQuery = [
    baseTrack.artist,
    baseTrack.title,
    baseTrack.styles?.[0] || baseTrack.style || baseTrack.genre,
    baseTrack.format === 'DJ Set' ? 'dj set' : 'official audio',
  ]
    .filter(Boolean)
    .join(' ')

  const related = await searchTracks(relatedQuery, {
    genre: 'all',
    style: 'all',
    format: 'all',
    vibe: 'all',
    maxViews: 'any',
    minGemScore: 'any',
    lowViewsOnly: false,
    strictGemsOnly: false,
    strictCrateDiggingMode: true,
    musicTracksOnly: true,
    preferTopicChannels: true,
    hideShorts: true,
    sortBy: 'gemScore',
    activeTags: baseTrack.tags?.slice(0, 3) || [],
  })

  return related.filter((track) => track.id !== baseTrack.id).slice(0, 12)
}

export async function addTrackToCrate(trackId, crateId) {
  return {
    ok: true,
    trackId,
    crateId,
  }
}

export async function getVideoDetails(videoId, filters = {}) {
  const apiKey = getApiKey()
  const normalizedVideoId = extractYouTubeVideoId(videoId)

  if (!apiKey || !normalizedVideoId) {
    return null
  }

  try {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')

    videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    videosUrl.searchParams.set('id', normalizedVideoId)
    videosUrl.searchParams.set('key', apiKey)

    const videosResult = await fetchYouTubeJson(videosUrl.toString())
    const video = videosResult.items?.[0]

    return normalizeYouTubeVideo(video, filters) || null
  } catch (error) {
    console.error('[CrateDigger][youtube] video details failed', error)
    return null
  }
}

export async function getYouTubeGemScoreDetails(link, filters = {}) {
  const videoId = extractYouTubeVideoId(link)

  if (!videoId) {
    throw new Error('Could not find a YouTube video ID in that link.')
  }

  if (!getApiKey()) {
    throw new Error('No YouTube API key found. Add VITE_YOUTUBE_API_KEY to score a link.')
  }

  const track = await getVideoDetails(videoId, filters)

  if (!track) {
    throw new Error(`No YouTube video details found for ${videoId}.`)
  }

  const scoredTrack = attachGemScores([track])[0]
  const musicLikelihood = getMusicLikelihoodDetails(scoredTrack)

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: scoredTrack.title,
    channel: scoredTrack.sourceChannelTitle || scoredTrack.channelTitle || scoredTrack.artist,
    gemScore: scoredTrack.gemScore,
    qualityScore: scoredTrack.qualityScore,
    musicLikelihood: musicLikelihood.score,
    isLikelyMusic: musicLikelihood.isLikelyMusic,
    styles: scoredTrack.styles || [],
    formats: scoredTrack.formats || [],
    reason: scoredTrack.gemReason,
    track: scoredTrack,
  }
}

export async function getYouTubeGemScore(link, filters = {}) {
  const details = await getYouTubeGemScoreDetails(link, filters)
  return details.gemScore
}

export async function logYouTubeGemScore(link, filters = {}) {
  const details = await getYouTubeGemScoreDetails(link, filters)
  console.log('[CrateDigger][gem-score]', details)
  return details.gemScore
}

export function normalizeYouTubeVideoForTests(video, filters = {}) {
  return normalizeYouTubeVideo(video, filters)
}

export { extractYouTubeVideoId, parseYouTubeDuration, normalizeYouTubeVideo }
