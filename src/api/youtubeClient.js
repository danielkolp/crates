// this file talks to youtube, turns api videos into app tracks, and ranks them for discovery.
// it only uses the youtube data api v3.

// these imports score tracks, filter noisy results, and read music/style metadata from track text.
import { attachGemScores, getGemReasons, getTrackQualityScore } from '../utils/gemScore'
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

// these flags control local debug output and quota logging.
const DEV = import.meta.env.DEV
const QUOTA_DEBUG = DEV || import.meta.env.VITE_YOUTUBE_QUOTA_DEBUG === 'true'

// these caches keep repeated api calls cheap during a browser session.
const searchCache = new Map()
const searchResultCache = new Map()
const videoDetailsCache = new Map()
const videoBatchCache = new Map()
const channelMetadataCache = new Map()
const channelBatchCache = new Map()
const playlistItemsCache = new Map()
const requestInFlightCache = new Map()

// these youtube error reason codes mean the daily quota is gone.
const YOUTUBE_DAILY_QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'dailyLimitExceededUnreg',
])

// these values decide how much youtube data to request for each discovery pass.
const SEED_QUERY_COUNT = 6
const YOUTUBE_RESULTS_PER_QUERY = 12
const YOUTUBE_VIDEO_DETAILS_BATCH_SIZE = 50
const YOUTUBE_CHANNEL_DETAILS_BATCH_SIZE = 50
const YOUTUBE_DISCOVERY_MAX_VIDEO_IDS = SEED_QUERY_COUNT * YOUTUBE_RESULTS_PER_QUERY
const YOUTUBE_CHANNEL_EXPANSION_LIMIT = 6
const YOUTUBE_UPLOADS_PER_CHANNEL = 3
const CHANNEL_EXPANSION_ACCEPTED_RESULT_FLOOR = 6
const PREVIOUS_EAGER_SEARCH_LIST_COUNT = SEED_QUERY_COUNT
const MINIMAL_METADATA_RELEASE_GEM_BOOST = 0.35
const DEFAULT_NUMERIC_SEED = '10000000'
const DISCOVERY_YEAR_START = 2012
const DISCOVERY_YEAR_END = 2026

// these are approximate youtube api quota costs used for the local quota estimate.
const YOUTUBE_QUOTA_COSTS = {
  search: 100,
  videos: 1,
  channels: 1,
  playlistItems: 1,
}

// these cache lifetimes balance freshness with quota savings.
const TRACK_RESULT_CACHE_TTL_MS = 30 * 60 * 1000
const SEARCH_RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const VIDEO_DETAILS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CHANNEL_METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PLAYLIST_ITEMS_CACHE_TTL_MS = 30 * 60 * 1000

// these field lists ask youtube for only the data this app actually needs.
const YOUTUBE_SEARCH_FIELDS =
  'etag,items(id/videoId,snippet(channelId,channelTitle,title,publishedAt))'
const YOUTUBE_VIDEOS_FIELDS =
  'etag,items(id,etag,snippet(publishedAt,channelId,channelTitle,title,description,tags,categoryId),statistics(viewCount,likeCount,commentCount),contentDetails(duration))'
const YOUTUBE_CHANNELS_FIELDS =
  'etag,items(id,etag,snippet(title),contentDetails/relatedPlaylists/uploads)'
const YOUTUBE_PLAYLIST_ITEMS_FIELDS =
  'etag,items(snippet(resourceId/videoId))'
const QUOTA_USAGE_STORAGE_KEY = 'crateDigger.youtubeQuotaUsageEstimate'

// this descending year list is used to build seeded discovery windows.
const DISCOVERY_YEARS = Array.from(
  { length: DISCOVERY_YEAR_END - DISCOVERY_YEAR_START + 1 },
  (_, index) => String(DISCOVERY_YEAR_END - index),
)

// these are the broad default styles used when the user has not picked a style.
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

// these words push searches toward actual track uploads instead of general videos.
const TRACK_VERSION_TERMS = [
  'original mix',
  'extended mix',
  'dub mix',
  'club mix',
]

// these extra version words are mixed into some searches for variety.
const OCCASIONAL_TRACK_VERSION_TERMS = [
  'extended mix',
  'dub mix',
  'club mix',
]

// these terms make queries prefer direct track pages and official audio uploads.
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

// this is the full pool of format words used for seeded queries.
const DISCOVERY_FORMATS = [
  ...TRACK_FIRST_QUERY_FORMATS,
  ...OCCASIONAL_TRACK_VERSION_TERMS,
]

// these words bias discovery toward underground and independent music results.
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

// these words add flavor and extra specificity to seeded youtube searches.
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

// these paired terms describe the intent of a search query.
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

// these special queries target youtube's official release metadata patterns.
const RELEASE_PATTERN_QUERIES = [
  'provided to youtube by topic official audio',
  'auto-generated by youtube released on track',
  'official audio topic single release',
  'released on provided to youtube by',
  'topic official audio single',
  'provided to youtube by independent release',
  'provided to youtube by small label',
  'released on topic track',
]

// these groups map one selected style to several youtube-friendly search phrases.
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

// this is the flattened list of every style phrase the query builder can choose from.
const ALL_DISCOVERY_STYLE_VARIANTS = [
  ...new Set([
    ...DISCOVERY_STYLES,
    ...STYLE_VARIANT_GROUPS.flatMap((group) => group.variants),
  ]),
]

// these fallback searches are used when no specific query can be built.
const SEARCH_DEFAULTS = [
  'underground uk garage full track',
  '2 step garage vinyl',
  'white label garage dub',
  'underground house official audio',
  'breaks dub track',
]

// these words are appended to queries to keep results focused on music.
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

// these optional intent words are mixed into seeded queries for variety.
const OPTIONAL_INTENT = [
  'official audio',
  'topic',
  'provided to youtube',
  'single',
  'release',
  'track',
  'original mix',
]

// these patterns reject videos that clearly are not music tracks.
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

// these regexes catch long mixes, bad release contexts, release metadata, and track versions.
const HARD_LONG_FORM_TITLE_PATTERN =
  /\b(?:dj\s*set|live\s*set|radio\s*show|podcast|compilation|playlist|boiler\s*room|essential\s*mix|mixmag|hour\s*mix|full\s*mix)\b/i

const RELEASE_METADATA_BAD_CONTEXT_PATTERN =
  /\b(?:podcast|tutorial|how to|reaction|reacts?|playlist|compilation|gameplay|gaming|minecraft|roblox|fortnite|news|interview|vlog|prank|boiler\s*room|dj\s*set|live\s*set|radio\s*show|essential\s*mix|mixmag)\b/i

const RELEASE_METADATA_MARKER_PATTERN =
  /\b(?:provided to youtube by|auto-generated by youtube|released on:|composer:|producer:|arranger:|lyricist:|writer:|associated performer:|music publisher:|copyright|phonographic copyright|licensed to youtube by|distributed by|label:|record label)\b|[\u2117\u00a9]|\(p\)/i

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

// this stores the last search state so the app can show a useful status message.
let lastSearchStatus = {
  source: 'youtube',
  usedFallback: false,
  message: 'Ready for live YouTube search.',
}

// this pauses async work for small delays such as empty api-key fallback behavior.
function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

// this returns a random integer and uses crypto when the browser exposes it.
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

// this creates a fresh numeric seed for repeatable discovery.
export function createNumericSeed() {
  const length = 8 + getEntropyInt(9)
  const digits = [String(1 + getEntropyInt(9))]

  for (let index = 1; index < length; index += 1) {
    digits.push(String(getEntropyInt(10)))
  }

  return digits.join('')
}

// this cleans any seed-like input into a stable numeric seed string.
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

// this turns a seed string into a deterministic integer hash.
function hashSeed(seed) {
  const value = String(seed || DEFAULT_NUMERIC_SEED)
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

// this returns a deterministic random number generator for a seed.
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

// this picks one item from an array using the seeded random generator.
export function seededPick(array = [], rng = createSeededRandom()) {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined
  }

  const index = Math.floor(rng() * array.length)
  return array[Math.min(index, array.length - 1)]
}

// this shuffles an array without changing the original array.
export function seededShuffle(array = [], rng = createSeededRandom()) {
  const next = [...array]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

// this reads the youtube api key from vite environment variables.
function getApiKey() {
  return import.meta.env.VITE_YOUTUBE_API_KEY || ''
}

// this safely returns local storage when the browser allows access.
function getSafeLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // ignore storage access failures.
  }

  return null
}

// this returns today's date key for quota tracking.
function getQuotaDateKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}

// this loads the saved quota estimate and resets it on a new day.
function readStoredQuotaUsage() {
  const today = getQuotaDateKey()
  const storage = getSafeLocalStorage()

  if (!storage) {
    return {
      date: today,
      dailyUnits: 0,
      sessionUnits: 0,
    }
  }

  try {
    const stored = JSON.parse(storage.getItem(QUOTA_USAGE_STORAGE_KEY) || '{}')

    return {
      date: today,
      dailyUnits: stored.date === today ? Number(stored.dailyUnits || 0) : 0,
      sessionUnits: 0,
    }
  } catch {
    return {
      date: today,
      dailyUnits: 0,
      sessionUnits: 0,
    }
  }
}

// this holds quota estimates for the current browser session.
let quotaUsage = readStoredQuotaUsage()

// this writes the quota estimate back to local storage.
function persistQuotaUsage() {
  const storage = getSafeLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      QUOTA_USAGE_STORAGE_KEY,
      JSON.stringify({
        date: quotaUsage.date,
        dailyUnits: quotaUsage.dailyUnits,
      }),
    )
  } catch {
    // ignore quota estimate persistence failures.
  }
}

// this records estimated youtube quota use and logs it in debug mode.
function recordQuotaUsage({ endpoint, cost, requestKey, cacheStatus = 'network' }) {
  const estimatedCost = Number(cost || 0)

  if (estimatedCost <= 0) {
    return
  }

  const today = getQuotaDateKey()

  if (quotaUsage.date !== today) {
    quotaUsage = {
      date: today,
      dailyUnits: 0,
      sessionUnits: 0,
    }
  }

  quotaUsage.dailyUnits += estimatedCost
  quotaUsage.sessionUnits += estimatedCost
  persistQuotaUsage()

  if (!QUOTA_DEBUG) {
    return
  }

  const logPayload = {
    endpoint,
    estimatedCost,
    cacheStatus,
    sessionUnits: quotaUsage.sessionUnits,
    dailyUnits: quotaUsage.dailyUnits,
    requestKey,
  }

  if (estimatedCost >= YOUTUBE_QUOTA_COSTS.search) {
    console.warn('[CrateDigger][youtube][quota] expensive request', logPayload)
    return
  }

  console.info('[CrateDigger][youtube][quota] request', logPayload)
}

// this logs when a request was avoided by a cache hit.
function logQuotaCacheHit(label, key) {
  if (!QUOTA_DEBUG) {
    return
  }

  console.info('[CrateDigger][youtube][quota] cache hit', {
    label,
    key,
    estimatedCost: 0,
    sessionUnits: quotaUsage.sessionUnits,
    dailyUnits: quotaUsage.dailyUnits,
  })
}

// this returns cached data only while it is still fresh.
function getFreshCacheEntry(cache, key) {
  const entry = cache.get(key)

  if (!entry || entry.expiresAt <= Date.now()) {
    return null
  }

  return entry
}

// this returns cached data even if it is expired.
function getStaleCacheEntry(cache, key) {
  return cache.get(key) || null
}

// this stores data with an expiry time and optional etag.
function setCacheEntry(cache, key, data, ttlMs, etag = '') {
  const now = Date.now()

  cache.set(key, {
    data,
    etag,
    cachedAt: now,
    expiresAt: now + ttlMs,
  })
}

// this wraps a fetch with fresh cache, stale etag support, and in-flight request reuse.
async function getOrFetchCached(cache, key, ttlMs, fetcher, options = {}) {
  const label = options.label || 'youtube request'
  const freshEntry = getFreshCacheEntry(cache, key)

  if (freshEntry) {
    logQuotaCacheHit(label, key)
    return freshEntry.data
  }

  const inFlightKey = `${label}:${key}`

  if (requestInFlightCache.has(inFlightKey)) {
    logQuotaCacheHit(`${label} in-flight`, key)
    return requestInFlightCache.get(inFlightKey)
  }

  const staleEntry = getStaleCacheEntry(cache, key)
  const requestPromise = (async () => {
    const result = await fetcher(staleEntry)
    const data = result && Object.prototype.hasOwnProperty.call(result, 'data')
      ? result.data
      : result
    const etag = result?.etag || staleEntry?.etag || ''

    setCacheEntry(cache, key, data, ttlMs, etag)
    return data
  })()

  requestInFlightCache.set(inFlightKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    requestInFlightCache.delete(inFlightKey)
  }
}

// this builds a safe request key for logs without exposing the api key.
function buildRequestLogKey(url) {
  try {
    const requestUrl = new URL(url)
    requestUrl.searchParams.delete('key')
    requestUrl.searchParams.sort()
    return `${requestUrl.pathname}?${requestUrl.searchParams.toString()}`
  } catch {
    return 'youtube-data-api'
  }
}

// this extracts a valid 11 character youtube video id from loose text.
function cleanYouTubeVideoId(value) {
  const match = String(value || '').match(/[a-zA-Z0-9_-]{11}/)
  return match?.[0] || ''
}

// this reads a video id from a raw id, app id, or youtube url.
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

// this updates the status object that the app reads after searches.
function setSearchStatus(source, usedFallback, message, details = {}) {
  lastSearchStatus = {
    source,
    usedFallback,
    message,
    ...details,
  }
}

// this exposes the latest search status to the app.
export function getLastSearchStatus() {
  return lastSearchStatus
}

// this pulls youtube error reason codes out of an api error response.
function getYouTubeErrorReasons(data) {
  const reasons = Array.isArray(data?.error?.errors)
    ? data.error.errors.map((item) => item?.reason).filter(Boolean)
    : []

  if (data?.error?.status) {
    reasons.push(data.error.status)
  }

  return reasons
}

// this checks whether a youtube reason code means daily quota is exhausted.
function isYouTubeDailyQuotaReason(reason) {
  return YOUTUBE_DAILY_QUOTA_REASONS.has(String(reason || '').trim())
}

// this checks whether an error object represents daily youtube quota exhaustion.
export function isYouTubeDailyQuotaError(error) {
  if (error?.isDailyQuotaExceeded) {
    return true
  }

  return isYouTubeDailyQuotaReason(error?.quotaReason || error?.reason)
}

// this normalizes arrays before they become part of cache keys.
function normalizeCacheList(values = []) {
  return [...values].map((value) => String(value).toLowerCase()).sort()
}

// this makes text comparable by lowering case and removing punctuation noise.
function normalizeDiscoveryText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s&+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// this removes empty and repeated discovery terms while preserving order.
function uniqueDiscoveryValues(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

// this picks the active style from filters, falling back to genre.
function getSelectedDiscoveryStyle(filters = {}) {
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre && filters.genre !== 'all'
        ? filters.genre
        : ''

  return String(selectedStyle || '').trim()
}

// this finds known search variants for a selected style.
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

// this builds the style phrase pool for the current filters.
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

// this turns a seed year and span into youtube published-after and published-before dates.
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

// this turns a seed into the style, format, context, year, and upload window for discovery.
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

// this creates the full seed profile and query plan used by the app.
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

// this gets the stable numeric part of a discovery seed for cache keys.
function getDiscoverySeedKey(discoverySeed) {
  return normalizeNumericSeed(discoverySeed)
}

// this reads which query-plan slot should be loaded next.
function getDiscoveryQueueIndex(filters = {}) {
  const index = Number(filters.discoveryQueueIndex ?? 0)

  if (!Number.isFinite(index) || index < 0) {
    return 0
  }

  return Math.floor(index)
}

// this builds the discovery seed object for a specific search query.
function createDiscoverySeedForQuery(seed, query = '', filters = {}) {
  const seedProfile = buildSeedProfile(seed, filters)
  const queryPlan = buildSeededSearchQueries(query, filters, seedProfile)

  return {
    ...seedProfile,
    queryPlan,
  }
}

// this builds the cache key for a full search request.
function buildSearchKey(query, filters = {}) {
  return JSON.stringify({
    query: String(query || '').trim().toLowerCase(),
    // the discovery seed already controls refresh variety. excluding refreshkey
    // prevents repeated api work when the same seed, query, and filter set is retried.
    discoverySeed: getDiscoverySeedKey(filters.discoverySeed),
    discoveryQueueIndex: getDiscoveryQueueIndex(filters),
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

// this parses youtube iso duration strings into seconds and a display label.
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

// this makes deterministic fake waveform bars from a video id.
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

// this counts hashtags in youtube title or description text.
function countHashtags(text = '') {
  return (String(text).match(/#[\w-]+/g) || []).length
}

// this detects titles that are mostly emoji noise.
function emojiHeavyTitle(title = '') {
  const value = String(title)
  const emojiLike = (value.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) || []).length
  const alnum = (value.match(/[a-z0-9]/gi) || []).length

  return emojiLike > 4 && emojiLike > alnum
}

// this counts common promotional words that make a result less trustworthy.
function promoWordCount(text = '') {
  const promoWords = ['bio', 'viral', 'subscribe', 'follow', 'new song', 'newsong']
  const normalized = String(text).toLowerCase()

  return promoWords.reduce((count, word) => count + (normalized.includes(word) ? 1 : 0), 0)
}

// this gets duration from normalized seconds or from youtube's duration text.
function getTrackDurationSeconds(track) {
  const directDuration = Number(track?.durationSeconds)

  if (Number.isFinite(directDuration) && directDuration >= 0) {
    return directDuration
  }

  return parseYouTubeDuration(String(track?.duration || '')).seconds
}

// this checks if a long-looking title is still probably a single track.
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

// this rejects long mixes and sets so the app favors individual tracks.
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

// this chooses a small deterministic set of terms from a pool.
function getSeededTerms(values = [], rng, limit = 2) {
  return seededShuffle(values, rng).slice(0, limit).filter(Boolean)
}

// this builds the format terms available to a seeded search.
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

// this assembles one youtube search query from the seed, filters, and query plan item.
function buildYouTubeQuery(query, filters = {}, seedProfile = buildSeedProfile(filters.discoverySeed, filters), queryPlanItem = {}) {
  const parts = []
  const rng = createSeededRandom(`${seedProfile.numericSeed}:query:${queryPlanItem.index ?? 0}`)

  const normalizedQuery = String(query || '').trim()
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre

  const hasSelectedStyle = selectedStyle && selectedStyle !== 'all'
  const hasPlanContext = Object.prototype.hasOwnProperty.call(queryPlanItem, 'context')
  const hasPlanAccent = Object.prototype.hasOwnProperty.call(queryPlanItem, 'accent')
  const style = queryPlanItem.style || seedProfile.style
  const format = filters.format && filters.format !== 'all'
    ? filters.format
    : queryPlanItem.format || seedProfile.format
  const context = hasPlanContext ? queryPlanItem.context : seedProfile.context
  const accent = hasPlanAccent ? queryPlanItem.accent : seededPick(DISCOVERY_QUERY_ACCENTS, rng)
  const intentGroup = queryPlanItem.intentGroup || seededPick(DISCOVERY_INTENT_GROUPS, rng) || []
  const releasePatternQuery = String(queryPlanItem.releasePatternQuery || '').trim()

  if (releasePatternQuery) {
    if (normalizedQuery) {
      parts.push(normalizedQuery)
    }

    if (hasSelectedStyle) {
      parts.push(selectedStyle)
    }

    parts.push(releasePatternQuery)
  } else if (normalizedQuery) {
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

// this builds the list of youtube queries that one seed can load over time.
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
  const selectedFormat = filters.format && filters.format !== 'all' ? filters.format : ''
  const selectedStyle = getSelectedDiscoveryStyle(filters)
  const releasePatterns = seededShuffle(RELEASE_PATTERN_QUERIES, rng)

  for (let attempt = 0; queryPlan.length < SEED_QUERY_COUNT && attempt < maxAttempts; attempt += 1) {
    const isInitialCandidate = queryPlan.length === 0
    const useReleasePattern = isInitialCandidate || queryPlan.length % 2 === 0
    const releasePatternQuery = useReleasePattern
      ? releasePatterns[queryPlan.length % releasePatterns.length]
      : ''
    const planItem = {
      index: queryPlan.length,
      releasePattern: useReleasePattern,
      releasePatternQuery,
      style: useReleasePattern
        ? selectedStyle
        : styles[attempt % styles.length] || seedProfile.style,
      format: useReleasePattern
        ? selectedFormat
        : formats[attempt % formats.length] || seedProfile.format,
      context: useReleasePattern ? '' : contexts[attempt % contexts.length] || seedProfile.context,
      accent: useReleasePattern ? '' : seededPick(DISCOVERY_QUERY_ACCENTS, rng),
      intentGroup: useReleasePattern ? [] : seededPick(DISCOVERY_INTENT_GROUPS, rng),
      year: seedProfile.year,
      uploadWindow: useReleasePattern ? null : seedProfile.uploadWindow,
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

// this returns the first hard reject pattern found in a video's text.
function findHardNonMusicPattern(title = '', description = '', channel = '') {
  const haystack = `${title} ${description} ${channel}`
  return HARD_NON_MUSIC_PATTERNS.find(({ pattern }) => pattern.test(haystack)) || null
}

// this increments a reject reason counter for debug summaries.
function incrementReason(map, reason) {
  map.set(reason, (map.get(reason) || 0) + 1)
}

// this removes youtube's topic suffix from auto-generated artist names.
function stripTopicSuffix(name = '') {
  const normalized = String(name || '').trim()

  if (!normalized) {
    return ''
  }

  const withoutTopicSuffix = normalized.replace(/\s*[-\u2013\u2014]\s*topic\s*$/i, '').trim()
  return withoutTopicSuffix || normalized
}

// this normalizes a tag before storing it on a track.
function normalizeTag(value) {
  return String(value ?? '').trim().toLowerCase()
}

// this combines the searchable text used to detect style names in metadata.
function getMetadataTextForStyle({ title = '', description = '', channelTitle = '', tags = [] } = {}) {
  return normalizeDiscoveryText(`${title} ${description} ${channelTitle} ${tags.join(' ')}`)
}

// this checks if a selected style or one of its aliases appears in video metadata.
function styleMatchesMetadata(style, metadataText) {
  const normalizedStyle = normalizeDiscoveryText(style)

  if (!normalizedStyle || !metadataText) {
    return false
  }

  const variants = uniqueDiscoveryValues([
    normalizedStyle,
    ...getKnownStyleVariants(normalizedStyle),
  ]).map(normalizeDiscoveryText)

  return variants.some((variant) => {
    if (!variant) {
      return false
    }

    const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    return new RegExp(`(?:^|\\b)${escapedVariant}(?:\\b|$)`, 'i').test(metadataText)
  })
}

// this decides whether a track style came from metadata or only from the query that found it.
function getStyleAttribution({
  metadataStyles = [],
  metadataText = '',
  selectedStyle = '',
  queryPlanItem = {},
} = {}) {
  const queryStyle = String(queryPlanItem.style || selectedStyle || '').trim()
  const metadataStyle = metadataStyles.find(Boolean) || ''

  if (metadataStyle) {
    return {
      displayStyle: metadataStyle,
      styles: metadataStyles,
      discoveredViaStyle: queryStyle,
      styleConfidence: 'high',
      styleSource: 'metadata',
    }
  }

  if (queryStyle && styleMatchesMetadata(queryStyle, metadataText)) {
    return {
      displayStyle: queryStyle,
      styles: [queryStyle],
      discoveredViaStyle: queryStyle,
      styleConfidence: 'high',
      styleSource: 'metadata',
    }
  }

  if (queryStyle) {
    return {
      displayStyle: queryStyle,
      styles: [queryStyle],
      discoveredViaStyle: queryStyle,
      styleConfidence: 'weak',
      styleSource: 'query-context',
    }
  }

  return {
    displayStyle: '',
    styles: [],
    discoveredViaStyle: '',
    styleConfidence: 'unknown',
    styleSource: queryPlanItem.releasePattern ? 'release-pattern' : 'metadata',
  }
}

// this reads youtube metadata clues that make a video look like a real music release.
export function getReleaseMetadataSignals(track = {}) {
  const title = String(track?.title || '')
  const description = String(track?.description || '')
  const channel = String(track?.sourceChannelTitle || track?.channelTitle || track?.artist || '')
  const tags = Array.isArray(track?.youtubeTags)
    ? track.youtubeTags
    : Array.isArray(track?.rawTags)
      ? track.rawTags
      : Array.isArray(track?.tags)
        ? track.tags
        : []
  const tagCount = tags.length
  const durationSeconds = getTrackDurationSeconds(track)
  const categoryId = Number(track?.categoryId || 0)
  const fullText = `${title} ${description} ${channel}`
  const normalizedDescription = normalizeDiscoveryText(description)

  // these booleans represent youtube release metadata patterns that are hard to fake by accident.
  const topicChannel = /\s[-\u2013\u2014]\s*topic\s*$/i.test(channel)
  const providedToYouTube = /\bprovided to youtube by\b/i.test(description)
  const autoGenerated = /\bauto-generated by youtube\b/i.test(description)
  const releasedOn = /\breleased on:\b/i.test(description)
  const releaseMarker = RELEASE_METADATA_MARKER_PATTERN.test(description)
  const sparseCleanTags = tagCount >= 1 && tagCount <= 5 && tags.every((tag) => {
    const normalizedTag = normalizeDiscoveryText(tag)
    return normalizedTag && !RELEASE_METADATA_BAD_CONTEXT_PATTERN.test(normalizedTag)
  })
  const normalSingleDuration = durationSeconds >= 90 && durationSeconds <= 540
  const acceptableSingleDuration = durationSeconds >= 70 && durationSeconds <= 720
  const lowViews = Number(track?.views || 0) > 0 && Number(track.views) <= 25000
  const hardNonMusicPattern = findHardNonMusicPattern(title, description, channel)

  // this prevents non-music, shorts, and long mixes from getting release boosts.
  const badContext =
    Boolean(hardNonMusicPattern) ||
    RELEASE_METADATA_BAD_CONTEXT_PATTERN.test(fullText) ||
    isLikelyLongFormMix(track) ||
    isLikelyShort(track)
  const signals = []
  let score = 0

  // each signal adds a small amount of confidence that the upload is a clean release.
  if (topicChannel) {
    score += 1.3
    signals.push('topic-channel')
  }

  if (categoryId === 10) {
    score += 1.1
    signals.push('youtube-music-category')
  }

  if (providedToYouTube) {
    score += 1.4
    signals.push('provided-to-youtube-by')
  }

  if (autoGenerated) {
    score += 1
    signals.push('auto-generated-by-youtube')
  }

  if (releasedOn) {
    score += 0.9
    signals.push('released-on')
  }

  if (releaseMarker) {
    score += 0.8
    signals.push('release-rights-metadata')
  }

  if (sparseCleanTags) {
    score += 0.35
    signals.push('sparse-clean-tags')
  }

  if (normalSingleDuration) {
    score += 0.75
    signals.push('single-track-duration')
  } else if (acceptableSingleDuration) {
    score += 0.35
    signals.push('acceptable-track-duration')
  }

  if (lowViews) {
    score += 0.25
    signals.push('low-exposure')
  }

  if (badContext) {
    score -= 3.5
    signals.push(hardNonMusicPattern ? `blocked-${hardNonMusicPattern.label}` : 'blocked-non-release-context')
  }

  // strong metadata means youtube itself is describing this as a released music upload.
  const hasStrongReleaseMetadata =
    topicChannel ||
    categoryId === 10 ||
    providedToYouTube ||
    autoGenerated ||
    releasedOn ||
    releaseMarker ||
    normalizedDescription.includes('released on')

  return {
    score: Number(Math.max(0, score).toFixed(2)),
    isCleanAutoGeneratedRelease:
      !badContext &&
      acceptableSingleDuration &&
      hasStrongReleaseMetadata &&
      score >= 3.1,
    signals,
  }
}

// this turns one youtube api video object into the track shape used by the app.
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
  const queryPlanItem = filters.discoveryQueryPlanItem || {}
  const rawTags = Array.isArray(snippet.tags) ? snippet.tags : []

  // selected style and vibe are kept when the query context can help describe a sparse upload.
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre && filters.genre !== 'all'
        ? filters.genre
        : ''

  const vibe = filters.vibe && filters.vibe !== 'all' ? filters.vibe : ''

  // this is the base track before style labels, release signals, and normalized tags are attached.
  const normalizedTrack = {
    id: youtubeVideoId ? `yt-${youtubeVideoId}` : `yt-${snippet.channelId || snippet.title || 'unknown'}`,
    youtubeVideoId,
    title: snippet.title || 'Untitled Upload',
    description: snippet.description || '',
    artist: displayArtist,
    channelId: snippet.channelId || '',
    channelTitle: displayArtist,
    sourceChannelTitle,
    duration: parsedDuration.label,
    durationSeconds: parsedDuration.seconds,
    categoryId: Number(snippet.categoryId || 0),
    genre: '',
    vibe,
    tags: rawTags,
    youtubeTags: rawTags,
    views: Number(statistics.viewCount || 0),
    likes: Number(statistics.likeCount || 0),
    comments: Number(statistics.commentCount || 0),
    publishedAt: snippet.publishedAt || new Date().toISOString(),
    artworkUrl: youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : '',
    thumbnailUrl: youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : '',
    waveform: buildWaveformSeed(youtubeVideoId),
    embedUrl: youtubeVideoId ? `https://www.youtube.com/embed/${youtubeVideoId}` : '',
  }

  // metadata labels are preferred over query labels when they are available.
  const metadataText = getMetadataTextForStyle({
    title: normalizedTrack.title,
    description: normalizedTrack.description,
    channelTitle: sourceChannelTitle,
    tags: rawTags,
  })
  const metadataStyles = getTrackStyleLabels({
    ...normalizedTrack,
    genre: '',
    style: '',
    styles: [],
    tags: rawTags,
  })
  const styleAttribution = getStyleAttribution({
    metadataStyles,
    metadataText,
    selectedStyle,
    queryPlanItem,
  })
  const releaseMetadataSignals = getReleaseMetadataSignals(normalizedTrack)
  const formats = getTrackFormatLabels(normalizedTrack)

  // these tags merge youtube tags with app-level style and format tags.
  const enhancedTags = [
    ...rawTags,
    ...(filters.activeTags || []),
    ...metadataStyles.map((style) => style.toLowerCase()),
    ...formats.map((format) => format.toLowerCase()),
  ]

  return {
    ...normalizedTrack,
    genre: styleAttribution.displayStyle,
    style: styleAttribution.displayStyle,
    styles: styleAttribution.styles,
    discoveredViaStyle: styleAttribution.discoveredViaStyle,
    styleConfidence: styleAttribution.styleConfidence,
    styleSource: styleAttribution.styleSource,
    releaseMetadataSignals,
    format: formats[0] || 'Track',
    formats,
    platform: 'YouTube',
    tags: [...new Set(enhancedTags.map(normalizeTag).filter(Boolean))],
  }
}

// this rejects videos that look like shorts, mixes, spam, or non-music before scoring.
function evaluateVideoQuality(track, filters = {}) {
  const title = String(track.title || '')
  const description = String(track.description || '')
  const channel = String(track.sourceChannelTitle || track.channelTitle || '')
  const musicLikelihood = getMusicLikelihoodDetails(track)
  const hashtagCountTitle = countHashtags(title)
  const hashtagCountDescription = countHashtags(description)
  const qualityScore = getTrackQualityScore(track)
  const releaseSignals = track.releaseMetadataSignals || getReleaseMetadataSignals(track)

  // long-form mixes and sets are not treated as single discovery tracks.
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

  // hard non-music terms can still pass only when the music likelihood is very strong. helps boost non-topic channel music 
  if (hardNonMusicPattern && musicLikelihood.score < 7.1) {
    return {
      keep: false,
      reason: `rejected: non-music intent (${hardNonMusicPattern.label})`,
      qualityScore,
      musicLikelihood,
    }
  }

  if (
    filters.musicTracksOnly !== false &&
    !releaseSignals.isCleanAutoGeneratedRelease &&
    !isLikelyMusicTrack(track)
  ) {
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

  if (!releaseSignals.isCleanAutoGeneratedRelease && qualityScore < 2.4 && musicLikelihood.score < 5.4) {
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

// this performs one youtube request, records estimated quota use, and handles etag caching.
async function fetchYouTubeJson(url, options = {}) {
  const {
    endpoint = 'youtube.list',
    quotaCost = 1,
    cacheEntry = null,
  } = options
  const requestKey = buildRequestLogKey(url)
  const headers = {}

  // etag headers let youtube return a cheap not-modified response when cached data is still valid.
  if (cacheEntry?.etag) {
    headers['If-None-Match'] = cacheEntry.etag
  }

  recordQuotaUsage({
    endpoint,
    cost: quotaCost,
    requestKey,
    cacheStatus: cacheEntry?.etag ? 'conditional-network' : 'network',
  })

  let response

  try {
    response = await fetch(
      url,
      Object.keys(headers).length > 0
        ? { headers }
        : undefined,
    )
  } catch (error) {
    // if a conditional request fails, retry once without the etag before giving up.
    if (cacheEntry?.etag) {
      if (QUOTA_DEBUG) {
        console.warn('[CrateDigger][youtube] conditional request failed; retrying without ETag', {
          endpoint,
          requestKey,
          error,
        })
      }

      try {
        response = await fetch(url)
      } catch (retryError) {
        if (cacheEntry?.data) {
          return {
            data: cacheEntry.data,
            etag: cacheEntry.etag || '',
            notModified: true,
          }
        }

        throw retryError
      }
    } else {
      throw error
    }
  }

  // a not-modified response means the cached payload is still usable.
  if (response.status === 304 && cacheEntry?.data) {
    return {
      data: cacheEntry.data,
      etag: cacheEntry.etag || '',
      notModified: true,
    }
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('[CrateDigger][youtube] full API error:', data)

    // youtube error reasons are copied onto the error so callers can show quota-specific messages.
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

  return {
    data,
    etag: response.headers.get('etag') || data?.etag || cacheEntry?.etag || '',
    notModified: false,
  }
}

// this extracts the raw youtube id from any app track id shape.
function getVideoId(track) {
  return String(track?.youtubeVideoId || track?.videoId || track?.id || '').replace(/^yt-/, '')
}

// this builds a compact debug row for a scored track.
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
    rankScore: track.rankScore,
    diversityPenalty: track.diversityPenalty,
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

// this prints discovery diagnostics in development without affecting users.
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
      .sort((a, b) => (b.rankScore ?? b.gemScore) - (a.rankScore ?? a.gemScore))
      .slice(0, 10)
      .map(summarizeTopTrack),
  )

  console.table(getAvailableStyleOptions(scored).slice(0, 15))
  console.table(getAvailableFormatOptions(scored).slice(0, 15))

  // this one known hidden gem is used as a quick sanity check while tuning filters.
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

// this decides how much extra gem score a clean sparse release should receive.
function getMinimalMetadataReleaseBoost(track) {
  const releaseSignals = track?.releaseMetadataSignals
  const tagCount = Array.isArray(track?.youtubeTags)
    ? track.youtubeTags.length
    : Array.isArray(track?.tags)
      ? track.tags.length
      : 0

  if (!releaseSignals?.isCleanAutoGeneratedRelease) {
    return 0
  }

  if (tagCount >= 1 && tagCount <= 5) {
    return MINIMAL_METADATA_RELEASE_GEM_BOOST
  }

  return 0.2
}

// this applies the clean-release boost and refreshes the human-readable gem reasons.
function applyReleaseMetadataGemBoost(track) {
  const minimalMetadataBoost = getMinimalMetadataReleaseBoost(track)

  if (minimalMetadataBoost <= 0) {
    const gemReasons = getGemReasons(track)

    return {
      ...track,
      minimalMetadataBoostApplied: false,
      gemReasons,
      gemReason: gemReasons.length > 0 ? gemReasons.join('; ') : track.gemReason,
    }
  }

  // the cap keeps metadata boosts from creating unrealistic visible scores.
  const nextGemScore = Number(Math.min((Number(track.gemScore) || 0) + minimalMetadataBoost, 9.6).toFixed(1))
  const nextScoreBreakdown = {
    ...(track.scoreBreakdown || {}),
    minimalMetadataBoost: Number(minimalMetadataBoost.toFixed(2)),
    finalGemScore: nextGemScore,
    finalScore: nextGemScore,
  }

  const nextTrack = {
    ...track,
    gemScore: nextGemScore,
    minimalMetadataBoostApplied: true,
    scoreBreakdown: nextScoreBreakdown,
    flags: [...new Set([...(track.flags || []), 'clean-auto-generated-release'])],
    qualityBadges: [...new Set(['Clean Release', ...(track.qualityBadges || [])])].slice(0, 4),
  }
  const gemReasons = getGemReasons(nextTrack)

  return {
    ...nextTrack,
    gemReasons,
    gemReason: gemReasons.length > 0 ? gemReasons.join('; ') : nextTrack.gemReason,
  }
}

// this scores tracks first, then applies youtube release metadata boosts.
function attachGemScoresWithReleaseBoost(tracks = []) {
  return attachGemScores(tracks).map(applyReleaseMetadataGemBoost)
}

// this logs release metadata signals while tuning discovery in development.
function debugReleaseSignals(tracks = []) {
  if (!DEV || tracks.length === 0) {
    return
  }

  console.groupCollapsed(`[CrateDigger][release-signals] ${tracks.length} tracks`)
  console.table(
    tracks.map((track) => ({
      title: track.title,
      channel: track.sourceChannelTitle || track.channelTitle || track.artist,
      tagCount: Array.isArray(track.youtubeTags) ? track.youtubeTags.length : 0,
      releaseSignalScore: track.releaseMetadataSignals?.score || 0,
      isCleanAutoGeneratedRelease: Boolean(track.releaseMetadataSignals?.isCleanAutoGeneratedRelease),
      discoveredViaStyle: track.discoveredViaStyle || '',
      styleConfidence: track.styleConfidence || 'unknown',
      styleSource: track.styleSource || 'metadata',
      minimalMetadataBoostApplied: Boolean(track.minimalMetadataBoostApplied),
    })),
  )
  console.groupEnd()
}

// this splits ids into youtube batch sizes.
function chunkArray(values = [], chunkSize = YOUTUBE_VIDEO_DETAILS_BATCH_SIZE) {
  const chunks = []

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }

  return chunks
}

// this appends video ids without duplicates and stops at the discovery limit.
function appendUniqueVideoIds(targetVideoIds, seenVideoIds, nextVideoIds = [], limit = YOUTUBE_DISCOVERY_MAX_VIDEO_IDS) {
  for (const nextVideoId of nextVideoIds) {
    const videoId = cleanYouTubeVideoId(nextVideoId)

    if (!videoId || seenVideoIds.has(videoId)) {
      continue
    }

    if (targetVideoIds.length >= limit) {
      break
    }

    seenVideoIds.add(videoId)
    targetVideoIds.push(videoId)
  }
}

// this builds the cache key for one youtube search.list request.
function buildSearchResultCacheKey(queryPlanItem) {
  return JSON.stringify({
    q: queryPlanItem.searchQuery,
    publishedAfter: queryPlanItem.uploadWindow?.after || '',
    publishedBefore: queryPlanItem.uploadWindow?.before || '',
    maxResults: YOUTUBE_RESULTS_PER_QUERY,
    videoCategoryId: '10',
    videoEmbeddable: true,
    videoSyndicated: true,
  })
}

// this builds a stable cache key for batched id requests.
function buildBatchCacheKey(values = []) {
  return uniqueDiscoveryValues(values)
    .sort()
    .join(',')
}

// this pulls video ids out of a youtube search response.
function extractSearchVideoIds(searchResult) {
  return (searchResult?.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean)
}

// this extracts the channel fields needed for cheap channel expansion.
function getSearchItemChannel(item) {
  const snippet = item?.snippet || {}

  return {
    id: String(snippet.channelId || '').trim(),
    title: String(snippet.channelTitle || '').trim(),
    videoTitle: String(snippet.title || '').trim(),
  }
}

// this checks whether a search result points to a channel worth expanding through uploads.
function isKnownMusicChannelCandidate(item, filters = {}) {
  const channel = getSearchItemChannel(item)

  if (!channel.id || !channel.title) {
    return false
  }

  const combinedText = `${channel.videoTitle} ${channel.title}`
  const normalizedChannelTitle = normalizeDiscoveryText(channel.title)
  const normalizedCombinedText = normalizeDiscoveryText(combinedText)

  if (filters.preferTopicChannels !== false && /\btopic\b/.test(normalizedChannelTitle)) {
    return true
  }

  // expansion is only useful when both the video title and channel look music-focused.
  const hasTrackIntent =
    /\bofficial audio\b|\bprovided to youtube\b|\boriginal mix\b|\bextended mix\b|\bpremiere\b|\bfull track\b|\bsingle\b|\brelease\b/.test(
      normalizedCombinedText,
    )
  const hasMusicChannelSignal =
    /\brecords?\b|\brecordings?\b|\blabel\b|\bmusic\b|\bofficial\b|\baudio\b|\bpremiere\b|\buploads?\b/.test(
      normalizedChannelTitle,
    )

  return hasTrackIntent && hasMusicChannelSignal
}

// this collects unique channel candidates from search results.
function collectKnownMusicChannelCandidates(items = [], candidates, filters = {}) {
  items.forEach((item) => {
    if (!isKnownMusicChannelCandidate(item, filters)) {
      return
    }

    const channel = getSearchItemChannel(item)

    if (!channel.id || candidates.has(channel.id)) {
      return
    }

    candidates.set(channel.id, {
      ...channel,
      isTopic: /\btopic\b/.test(normalizeDiscoveryText(channel.title)),
    })
  })
}

// this ranks topic channels first and keeps only a small expansion set.
function getKnownMusicChannelIds(candidates) {
  return Array.from(candidates.values())
    .sort((a, b) => Number(b.isTopic) - Number(a.isTopic))
    .slice(0, YOUTUBE_CHANNEL_EXPANSION_LIMIT)
    .map((channel) => channel.id)
}

// this logs how many expensive search calls the lazy queue is using.
function logDiscoveryQueueRequest({ reason = 'initial', queueIndex = 0, queryPlan = [], queryPlanItem = null }) {
  if (!QUOTA_DEBUG) {
    return
  }

  const loadedSearchCount = Math.min(queueIndex + 1, queryPlan.length || 1)
  const previousEagerUnits = PREVIOUS_EAGER_SEARCH_LIST_COUNT * YOUTUBE_QUOTA_COSTS.search
  const currentSearchUnits = loadedSearchCount * YOUTUBE_QUOTA_COSTS.search
  const estimatedSavedQuotaUnits = Math.max(previousEagerUnits - currentSearchUnits, 0)
  const payload = {
    reason,
    candidateIndex: queueIndex,
    candidateCount: queryPlan.length,
    query: queryPlanItem?.searchQuery || '',
    selectedStyle: queryPlanItem?.style || '',
    estimatedCurrentSearchUnits: currentSearchUnits,
    estimatedPreviousEagerSearchUnits: previousEagerUnits,
    estimatedSavedQuotaUnits,
  }

  if (reason === 'lazy') {
    console.info('[CrateDigger][youtube][quota] lazy discovery expansion triggered', payload)
    return
  }

  console.info('[CrateDigger][youtube][quota] initial discovery limited to one search.list request', payload)
}

// this fetches one youtube search result page for one planned query.
async function fetchYouTubeSearchResult(apiKey, queryPlanItem) {
  const cacheKey = buildSearchResultCacheKey(queryPlanItem)

  return getOrFetchCached(
    searchResultCache,
    cacheKey,
    SEARCH_RESULT_CACHE_TTL_MS,
    async (cacheEntry) => {
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')

      searchUrl.searchParams.set('part', 'snippet')
      searchUrl.searchParams.set('type', 'video')
      searchUrl.searchParams.set('maxResults', String(YOUTUBE_RESULTS_PER_QUERY))
      searchUrl.searchParams.set('videoCategoryId', '10')
      searchUrl.searchParams.set('videoEmbeddable', 'true')
      searchUrl.searchParams.set('videoSyndicated', 'true')
      searchUrl.searchParams.set('safeSearch', 'none')
      searchUrl.searchParams.set('q', queryPlanItem.searchQuery)
      searchUrl.searchParams.set('fields', YOUTUBE_SEARCH_FIELDS)
      searchUrl.searchParams.set('key', apiKey)

      // seeded upload windows keep repeated discovery passes varied.
      if (queryPlanItem.uploadWindow) {
        searchUrl.searchParams.set('publishedAfter', queryPlanItem.uploadWindow.after)
        searchUrl.searchParams.set('publishedBefore', queryPlanItem.uploadWindow.before)
      }

      const searchResult = await fetchYouTubeJson(searchUrl.toString(), {
        endpoint: 'search.list',
        quotaCost: YOUTUBE_QUOTA_COSTS.search,
        cacheEntry,
      })

      return {
        data: searchResult.data || { items: [] },
        etag: searchResult.etag,
      }
    },
    { label: 'search.list' },
  )
}

// this loads channel metadata, especially upload playlist ids, in cached batches.
async function fetchYouTubeChannelsByIds(apiKey, channelIds = []) {
  const channelsById = new Map()
  const uniqueChannelIds = uniqueDiscoveryValues(channelIds)
  const missingChannelIds = []

  uniqueChannelIds.forEach((channelId) => {
    const cachedChannel = getFreshCacheEntry(channelMetadataCache, channelId)

    if (cachedChannel) {
      logQuotaCacheHit('channels.list channel', channelId)
      channelsById.set(channelId, cachedChannel.data)
      return
    }

    missingChannelIds.push(channelId)
  })

  // only missing channels hit the network; cached channels are reused above.
  for (const channelIdChunk of chunkArray(missingChannelIds, YOUTUBE_CHANNEL_DETAILS_BATCH_SIZE)) {
    const batchKey = buildBatchCacheKey(channelIdChunk)
    const channelsResult = await getOrFetchCached(
      channelBatchCache,
      batchKey,
      CHANNEL_METADATA_CACHE_TTL_MS,
      async (cacheEntry) => {
        const channelsUrl = new URL('https://www.googleapis.com/youtube/v3/channels')

        channelsUrl.searchParams.set('part', 'snippet,contentDetails')
        channelsUrl.searchParams.set('id', channelIdChunk.join(','))
        channelsUrl.searchParams.set('fields', YOUTUBE_CHANNELS_FIELDS)
        channelsUrl.searchParams.set('key', apiKey)

        const channelResult = await fetchYouTubeJson(channelsUrl.toString(), {
          endpoint: 'channels.list',
          quotaCost: YOUTUBE_QUOTA_COSTS.channels,
          cacheEntry,
        })

        return {
          data: channelResult.data || { items: [] },
          etag: channelResult.etag,
        }
      },
      { label: 'channels.list' },
    )

    ;(channelsResult.items || []).forEach((item) => {
      setCacheEntry(
        channelMetadataCache,
        item.id,
        item,
        CHANNEL_METADATA_CACHE_TTL_MS,
        item.etag || '',
      )
      channelsById.set(item.id, item)
    })
  }

  return channelsById
}

// this loads recent upload video ids from one channel upload playlist.
async function fetchYouTubeUploadVideoIds(apiKey, playlistId) {
  const normalizedPlaylistId = String(playlistId || '').trim()

  if (!normalizedPlaylistId) {
    return []
  }

  const cacheKey = JSON.stringify({
    playlistId: normalizedPlaylistId,
    maxResults: YOUTUBE_UPLOADS_PER_CHANNEL,
  })

  return getOrFetchCached(
    playlistItemsCache,
    cacheKey,
    PLAYLIST_ITEMS_CACHE_TTL_MS,
    async (cacheEntry) => {
      const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')

      playlistUrl.searchParams.set('part', 'snippet')
      playlistUrl.searchParams.set('playlistId', normalizedPlaylistId)
      playlistUrl.searchParams.set('maxResults', String(YOUTUBE_UPLOADS_PER_CHANNEL))
      playlistUrl.searchParams.set('fields', YOUTUBE_PLAYLIST_ITEMS_FIELDS)
      playlistUrl.searchParams.set('key', apiKey)

      const playlistResult = await fetchYouTubeJson(playlistUrl.toString(), {
        endpoint: 'playlistItems.list',
        quotaCost: YOUTUBE_QUOTA_COSTS.playlistItems,
        cacheEntry,
      })
      const videoIds = (playlistResult.data?.items || [])
        .map((item) => item.snippet?.resourceId?.videoId)
        .filter(Boolean)

      return {
        data: videoIds,
        etag: playlistResult.etag,
      }
    },
    { label: 'playlistItems.list' },
  )
}

// this expands good music channels into extra candidate video ids at low quota cost.
async function fetchKnownChannelUploadVideoIds(apiKey, channelCandidates) {
  const channelIds = getKnownMusicChannelIds(channelCandidates)

  if (channelIds.length === 0) {
    return []
  }

  const channelsById = await fetchYouTubeChannelsByIds(apiKey, channelIds)
  const uploadPlaylistIds = channelIds
    .map((channelId) => channelsById.get(channelId)?.contentDetails?.relatedPlaylists?.uploads)
    .filter(Boolean)

  if (uploadPlaylistIds.length === 0) {
    return []
  }

  const uploadVideoIdLists = await Promise.all(
    uploadPlaylistIds.map((playlistId) => fetchYouTubeUploadVideoIds(apiKey, playlistId)),
  )
  const uploadVideoIds = uniqueDiscoveryValues(uploadVideoIdLists.flat())

  if (QUOTA_DEBUG && uploadVideoIds.length > 0) {
    console.info('[CrateDigger][youtube][quota] cheap channel upload expansion', {
      channels: channelIds.length,
      playlists: uploadPlaylistIds.length,
      videoIds: uploadVideoIds.length,
    })
  }

  return uploadVideoIds
}

// this fetches full video details for candidate ids in cached batches.
async function fetchYouTubeVideosByIds(apiKey, videoIds = []) {
  const videosById = new Map()
  const uniqueVideoIds = uniqueDiscoveryValues(videoIds.map(cleanYouTubeVideoId).filter(Boolean))
  const missingVideoIds = []

  uniqueVideoIds.forEach((videoId) => {
    const cachedVideo = getFreshCacheEntry(videoDetailsCache, videoId)

    if (cachedVideo) {
      logQuotaCacheHit('videos.list video', videoId)
      videosById.set(videoId, cachedVideo.data)
      return
    }

    missingVideoIds.push(videoId)
  })

  // youtube videos.list accepts batches, so missing ids are grouped before fetching.
  for (const videoIdChunk of chunkArray(missingVideoIds)) {
    const batchKey = buildBatchCacheKey(videoIdChunk)
    const videosResult = await getOrFetchCached(
      videoBatchCache,
      batchKey,
      VIDEO_DETAILS_CACHE_TTL_MS,
      async (cacheEntry) => {
        const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')

        videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
        videosUrl.searchParams.set('id', videoIdChunk.join(','))
        videosUrl.searchParams.set('fields', YOUTUBE_VIDEOS_FIELDS)
        videosUrl.searchParams.set('key', apiKey)

        const videoResult = await fetchYouTubeJson(videosUrl.toString(), {
          endpoint: 'videos.list',
          quotaCost: YOUTUBE_QUOTA_COSTS.videos,
          cacheEntry,
        })

        return {
          data: videoResult.data || { items: [] },
          etag: videoResult.etag,
        }
      },
      { label: 'videos.list' },
    )

    ;(videosResult.items || []).forEach((item) => {
      setCacheEntry(
        videoDetailsCache,
        item.id,
        item,
        VIDEO_DETAILS_CACHE_TTL_MS,
        item.etag || '',
      )
      videosById.set(item.id, item)
    })
  }

  return videosById
}

// this turns fetched youtube video details into normalized app candidates.
function normalizeYouTubeCandidates(videoIds = [], videosById, filters = {}, queryPlanItem = null) {
  return videoIds
    .map((videoId) => normalizeYouTubeVideo(videosById.get(videoId), {
      ...filters,
      discoveryQueryPlanItem: queryPlanItem,
    }))
    .filter(Boolean)
}

// this applies the youtube preflight quality gate and returns accepted candidates plus rejection counts.
function evaluateYouTubeCandidates(candidates = [], filters = {}) {
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

  return {
    accepted,
    rejectedCounts,
  }
}

// this runs the full youtube discovery pipeline and returns scored tracks.
async function fetchYouTubeTracks(query, filters = {}) {
  const apiKey = getApiKey()

  if (!apiKey) {
    return []
  }

  const seedProfile = buildSeedProfile(filters.discoverySeed, filters)
  const queryPlan = buildSeededSearchQueries(query, filters, seedProfile)
  const queueIndex = getDiscoveryQueueIndex(filters)
  const queryPlanItem = queryPlan[queueIndex]
  const seenVideoIds = new Set()
  const videoIds = []
  const channelCandidates = new Map()

  if (!queryPlanItem) {
    return []
  }

  // only one query plan item is loaded at a time so swipe mode can lazily extend the queue.
  logDiscoveryQueueRequest({
    reason: filters.discoveryLoadReason || 'initial',
    queueIndex,
    queryPlan,
    queryPlanItem,
  })

  const searchResult = await fetchYouTubeSearchResult(apiKey, queryPlanItem)
  const searchItems = searchResult.items || []

  // search results provide initial ids and channel candidates for cheap expansion.
  collectKnownMusicChannelCandidates(searchItems, channelCandidates, filters)
  const searchVideoIds = extractSearchVideoIds(searchResult)
  appendUniqueVideoIds(videoIds, seenVideoIds, searchVideoIds)

  let acceptedPreExpansionCount = 0
  let preExpansionVideosById = new Map()

  if (videoIds.length > 0) {
    preExpansionVideosById = await fetchYouTubeVideosByIds(apiKey, videoIds)

    const preExpansionCandidates = normalizeYouTubeCandidates(
      videoIds,
      preExpansionVideosById,
      filters,
      queryPlanItem,
    )

    acceptedPreExpansionCount = evaluateYouTubeCandidates(preExpansionCandidates, filters).accepted.length
  }

  // topic and label channels can help weak batches, but strong search batches should not fan out.
  const shouldExpandKnownMusicChannels =
    filters.preferTopicChannels !== false &&
    acceptedPreExpansionCount < CHANNEL_EXPANSION_ACCEPTED_RESULT_FLOOR

  let addedChannelExpansionIds = false

  if (shouldExpandKnownMusicChannels) {
    try {
      const preExpansionVideoIdCount = videoIds.length
      const uploadVideoIds = await fetchKnownChannelUploadVideoIds(apiKey, channelCandidates)

      appendUniqueVideoIds(videoIds, seenVideoIds, uploadVideoIds)
      addedChannelExpansionIds = videoIds.length > preExpansionVideoIdCount
    } catch (error) {
      if (QUOTA_DEBUG) {
        console.warn('[CrateDigger][youtube] cheap channel expansion skipped', error)
      }
    }
  } else if (QUOTA_DEBUG && filters.preferTopicChannels !== false && channelCandidates.size > 0) {
    console.info('[CrateDigger][youtube][quota] cheap channel expansion skipped; search batch strong', {
      acceptedPreExpansionCount,
      floor: CHANNEL_EXPANSION_ACCEPTED_RESULT_FLOOR,
      channels: channelCandidates.size,
    })
  }

  if (videoIds.length === 0) {
    return []
  }

  const videosById = addedChannelExpansionIds
    ? await fetchYouTubeVideosByIds(apiKey, videoIds)
    : preExpansionVideosById

  // full video details are normalized after search so stats, duration, and tags are available.
  const candidates = normalizeYouTubeCandidates(videoIds, videosById, filters, queryPlanItem)
  const { accepted, rejectedCounts } = evaluateYouTubeCandidates(candidates, filters)

  const scored = attachGemScoresWithReleaseBoost(accepted)
  debugReleaseSignals(scored)

  debugYouTubeResults({
    searchQuery: queryPlanItem.searchQuery,
    queryPlan: [queryPlanItem],
    candidates,
    accepted,
    rejectedCounts,
    scored,
  })

  return scored
}

// this is the main public search entry used by the app.
export async function searchTracks(query = '', filters = {}) {
  const effectiveFilters = {
    ...filters,
    refreshKey: filters.refreshKey ?? 0,
    discoverySeed: filters.discoverySeed ?? '',
  }
  const seedProfile = buildSeedProfile(effectiveFilters.discoverySeed, effectiveFilters)
  const queryPlan = buildSeededSearchQueries(query, effectiveFilters, seedProfile)

  const cacheKey = buildSearchKey(query, effectiveFilters)
  const cachedSearch = getFreshCacheEntry(searchCache, cacheKey)

  // fresh cached results avoid repeat quota use for the same seed and filters.
  if (cachedSearch) {
    logQuotaCacheHit('searchTracks', cacheKey)
    setSearchStatus(
      'youtube',
      false,
      cachedSearch.data.length === 0
        ? 'No clean music tracks found for this search.'
        : 'Live YouTube results loaded.',
      {
        discoverySeed: {
          ...seedProfile,
          queryPlan,
        },
      },
    )

    return cachedSearch.data
  }

  const inFlightKey = `searchTracks:${cacheKey}`

  // in-flight dedupe prevents duplicate network work when react asks twice.
  if (requestInFlightCache.has(inFlightKey)) {
    logQuotaCacheHit('searchTracks in-flight', cacheKey)
    return requestInFlightCache.get(inFlightKey)
  }

  const searchPromise = (async () => {
    const apiKey = getApiKey()

    // without an api key the app can still render, but live youtube results are disabled.
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
        // the seed controls visible ordering after the scoring pipeline finishes.
        const shuffledApiTracks = seededShuffle(
          apiTracks,
          createSeededRandom(`${seedProfile.numericSeed}:result-order`),
        )
        const tracks = filterTracks(shuffledApiTracks, { ...effectiveFilters, query: '' })

        setSearchStatus(
          'youtube',
          false,
          tracks.length === 0
            ? 'No clean music tracks found for this search.'
            : 'Live YouTube results loaded.',
          {
            discoverySeed: {
              ...seedProfile,
              queryPlan,
            },
          },
        )

        setCacheEntry(searchCache, cacheKey, tracks, TRACK_RESULT_CACHE_TTL_MS)
        return tracks
      }
    } catch (error) {
      console.error('[CrateDigger][youtube] request failed', error)

      // quota errors get a specific status so the overlay can explain what happened.
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

  requestInFlightCache.set(inFlightKey, searchPromise)

  try {
    return await searchPromise
  } finally {
    requestInFlightCache.delete(inFlightKey)
  }
}

function getSeedScanCount(options = {}) {
  const count = Number(options.count ?? options.seedCount ?? 12)

  if (!Number.isFinite(count) || count < 1) {
    return 12
  }

  return Math.min(Math.floor(count), 200)
}

function getSeedQueueDepth(options = {}) {
  const depth = Number(options.queueDepth ?? options.depth ?? 1)

  if (!Number.isFinite(depth) || depth < 1) {
    return 1
  }

  return Math.min(Math.floor(depth), SEED_QUERY_COUNT)
}

function incrementNumericSeed(seed, offset = 0) {
  const normalizedSeed = normalizeNumericSeed(seed)
  const width = Math.max(normalizedSeed.length, 8)
  const nextValue = BigInt(normalizedSeed) + BigInt(offset)

  return normalizeNumericSeed(nextValue.toString().padStart(width, '0'))
}

function getSeedScanList(options = {}) {
  if (Array.isArray(options.seeds) && options.seeds.length > 0) {
    return uniqueDiscoveryValues(options.seeds.map((seed) => normalizeNumericSeed(seed)))
  }

  const startSeed = normalizeNumericSeed(options.startSeed ?? options.seed ?? DEFAULT_NUMERIC_SEED)
  const count = getSeedScanCount(options)

  return Array.from({ length: count }, (_, index) => incrementNumericSeed(startSeed, index))
}

function summarizeSeedMatchTrack(track) {
  return {
    title: track?.title || '',
    channel: track?.sourceChannelTitle || track?.channelTitle || track?.artist || '',
    style: track?.style || track?.genre || '',
    format: track?.format || '',
    views: track?.views ?? 0,
    gemScore: track?.gemScore ?? 0,
    rankScore: track?.rankScore ?? track?.displayScore ?? 0,
  }
}

function logSeedScanResult(result) {
  if (typeof console === 'undefined') {
    return
  }

  const tableRows = result.matches.map((match) => ({
    seed: match.seed,
    queueIndex: match.queueIndex,
    searchQuery: match.searchQuery,
    title: match.track.title,
    channel: match.track.channel,
    gemScore: match.track.gemScore,
    rankScore: match.track.rankScore,
  }))

  console.info('[CrateDigger][youtube][seed-scan]', {
    target: result.target,
    testedSeeds: result.testedSeeds,
    queueDepth: result.queueDepth,
    matches: result.matches.length,
    errors: result.errors.length,
    estimatedSearchQuotaUnits: result.estimatedSearchQuotaUnits,
  })

  if (tableRows.length > 0) {
    console.table(tableRows)
    return
  }

  console.info('[CrateDigger][youtube][seed-scan] no matching seeds found in this scan window')
}

// this console/debug helper verifies which discovery seeds surface a specific youtube track.
export async function findYouTubeSeedsForTrack(link, options = {}) {
  const videoId = extractYouTubeVideoId(link)

  if (!videoId) {
    throw new Error('Pass a YouTube link, video id, or app track id.')
  }

  const apiKey = getApiKey()

  if (!apiKey) {
    throw new Error('No YouTube API key found. Add VITE_YOUTUBE_API_KEY before scanning seeds.')
  }

  const {
    filters: optionFilters = {},
    query = '',
    maxMatches = Infinity,
  } = options
  const scanFilters = {
    musicTracksOnly: true,
    preferTopicChannels: true,
    hideShorts: true,
    sortBy: 'gemScore',
    ...optionFilters,
  }
  const seeds = getSeedScanList(options)
  const queueDepth = getSeedQueueDepth(options)
  const targetTrack = await getVideoDetails(videoId, scanFilters)
  const targetSummary = targetTrack
    ? {
        videoId,
        ...summarizeSeedMatchTrack(targetTrack),
        styles: targetTrack.styles || [],
        formats: targetTrack.formats || [],
        publishedAt: targetTrack.publishedAt,
      }
    : { videoId }
  const result = {
    target: targetSummary,
    query,
    testedSeeds: seeds.length,
    queueDepth,
    estimatedSearchQuotaUnits: seeds.length * queueDepth * YOUTUBE_QUOTA_COSTS.search,
    matches: [],
    misses: [],
    errors: [],
  }
  const maxMatchCount = Number.isFinite(Number(maxMatches))
    ? Math.max(1, Math.floor(Number(maxMatches)))
    : Infinity

  for (const seed of seeds) {
    const discoverySeed = createDiscoverySeedForQuery(seed, query, scanFilters)
    let seedMatched = false

    for (const queryPlanItem of discoverySeed.queryPlan.slice(0, queueDepth)) {
      try {
        const searchFilters = {
          ...scanFilters,
          discoverySeed,
          discoveryQueueIndex: queryPlanItem.index,
          discoveryLoadReason: 'seed-scan',
        }
        const apiTracks = await fetchYouTubeTracks(query, searchFilters)
        const visibleTracks = filterTracks(
          seededShuffle(apiTracks, createSeededRandom(`${discoverySeed.numericSeed}:result-order`)),
          { ...searchFilters, query: '' },
        )
        const matchedTrack = visibleTracks.find((track) => getVideoId(track) === videoId)

        if (!matchedTrack) {
          continue
        }

        seedMatched = true
        result.matches.push({
          seed: discoverySeed.numericSeed,
          queueIndex: queryPlanItem.index,
          searchQuery: queryPlanItem.searchQuery,
          uploadWindow: queryPlanItem.uploadWindow,
          seedProfile: {
            style: discoverySeed.style,
            format: discoverySeed.format,
            context: discoverySeed.context,
            year: discoverySeed.year,
            windowSpanYears: discoverySeed.windowSpanYears,
          },
          track: summarizeSeedMatchTrack(matchedTrack),
        })

        if (result.matches.length >= maxMatchCount) {
          logSeedScanResult(result)
          return result
        }
      } catch (error) {
        result.errors.push({
          seed: discoverySeed.numericSeed,
          queueIndex: queryPlanItem.index,
          message: error?.message || String(error),
          reason: error?.quotaReason || error?.reason || '',
        })

        if (isYouTubeDailyQuotaError(error)) {
          logSeedScanResult(result)
          throw error
        }
      }
    }

    if (!seedMatched) {
      result.misses.push(seed)
    }
  }

  logSeedScanResult(result)
  return result
}

// this exposes raw youtube discovery for callers that do not need search status or app filtering.
export async function searchYouTubeVideos(query = '', filters = {}) {
  return fetchYouTubeTracks(query, {
    ...filters,
    refreshKey: filters.refreshKey ?? 0,
    discoverySeed: filters.discoverySeed ?? '',
  })
}

// this resolves any youtube link or app id into one normalized track.
export async function getTrackById(id) {
  const videoId = extractYouTubeVideoId(id)

  if (!videoId) {
    return null
  }

  return getVideoDetails(videoId)
}

// this builds a related search from a base track and returns nearby discoveries.
export async function getRelatedTracks(trackId) {
  const baseTrack = await getTrackById(trackId)

  if (!baseTrack) {
    return []
  }

  // the related query reuses the artist, title, and strongest style or format clue.
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

// this placeholder confirms a crate add action for youtube tracks.
export async function addTrackToCrate(trackId, crateId) {
  return {
    ok: true,
    trackId,
    crateId,
  }
}

// this fetches and normalizes one youtube video by id.
export async function getVideoDetails(videoId, filters = {}) {
  const apiKey = getApiKey()
  const normalizedVideoId = extractYouTubeVideoId(videoId)

  if (!apiKey || !normalizedVideoId) {
    return null
  }

  try {
    const videosById = await fetchYouTubeVideosByIds(apiKey, [normalizedVideoId])
    const video = videosById.get(normalizedVideoId)

    return normalizeYouTubeVideo(video, filters) || null
  } catch (error) {
    console.error('[CrateDigger][youtube] video details failed', error)
    return null
  }
}

// this scores one youtube link and returns the details used by debug tools.
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

  // the same scoring path is used here as in discovery results.
  const scoredTrack = attachGemScoresWithReleaseBoost([track])[0]
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

// this returns only the visible gem score for one youtube link.
export async function getYouTubeGemScore(link, filters = {}) {
  const details = await getYouTubeGemScoreDetails(link, filters)
  return details.gemScore
}

// this logs the full gem score details and returns the score.
export async function logYouTubeGemScore(link, filters = {}) {
  const details = await getYouTubeGemScoreDetails(link, filters)
  console.log('[CrateDigger][gem-score]', details)
  return details.gemScore
}

// this exposes video normalization to tests without exposing internal fetch helpers.
export function normalizeYouTubeVideoForTests(video, filters = {}) {
  return normalizeYouTubeVideo(video, filters)
}

// these helpers are exported for tests and small utility callers.
export { extractYouTubeVideoId, parseYouTubeDuration, normalizeYouTubeVideo }
