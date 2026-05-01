// filterTracks.js - Core filtering and scoring logic for music discovery
// This module provides functions to filter and score music tracks based on various criteria such as genre, vibe, views, gem score, and music likelihood. It includes a sophisticated music likelihood scoring system that analyzes track metadata to determine if it's likely to be music. The main function, filterTracks, applies all filters and returns a sorted list of tracks that match the criteria.

const DEV = Boolean(import.meta.env?.DEV)
const GOLD_VIDEO_ID = 'AE_fJPFMC1M'

const DEFAULT_OPTIONS = {
  query: '',
  genre: 'all',
  style: 'all',
  format: 'all',
  vibe: 'all',
  maxViews: 'any',
  minGemScore: 'any',
  lowViewsOnly: false,
  strictGemsOnly: false,
  strictCrateDiggingMode: false,
  musicTracksOnly: false,
  preferTopicChannels: false,
  hideShorts: false,
  sortBy: 'gemScore',
  activeTags: [],
  digDeeperTags: [],
  tagMatchMode: 'all',
  digDeeperMatchMode: 'any',
}

function clamp(value, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

function roundScore(value) {
  return Number(clamp(value, 0, 10).toFixed(1))
}

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return toText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s#&/.'+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getTags(track) {
  return Array.isArray(track?.tags)
    ? track.tags.map((tag) => normalizeText(tag)).filter(Boolean)
    : []
}

function getHaystack(track) {
  return normalizeText([
    track?.title,
    track?.artist,
    track?.channelTitle,
    track?.sourceChannelTitle,
    track?.description,
    track?.genre,
    track?.style,
    track?.format,
    track?.vibe,
    track?.album,
    track?.release,
    ...(Array.isArray(track?.styles) ? track.styles : []),
    ...(Array.isArray(track?.formats) ? track.formats : []),
    ...getTags(track),
  ].join(' '))
}

function parseCount(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const raw = toText(value).toLowerCase().replace(/,/g, '')

  if (!raw) {
    return fallback
  }

  const match = raw.match(/(-?\d+(?:\.\d+)?)\s*([kmb])?/)
  if (!match) {
    return fallback
  }

  const number = Number(match[1])
  if (!Number.isFinite(number)) {
    return fallback
  }

  const suffix = match[2]
  const multiplier =
    suffix === 'k' ? 1_000 :
    suffix === 'm' ? 1_000_000 :
    suffix === 'b' ? 1_000_000_000 :
    1

  return number * multiplier
}

function parseMaxViews(maxViews) {
  if (maxViews === 'any') {
    return Infinity
  }

  return parseCount(maxViews, Infinity)
}

function parseMinNumber(value, fallback = -Infinity) {
  if (value === 'any') {
    return fallback
  }

  const parsed = parseCount(value, fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseDurationSeconds(track) {
  const direct = Number(track?.durationSeconds)

  if (Number.isFinite(direct) && direct >= 0) {
    return direct
  }

  const raw = toText(track?.duration || track?.contentDetails?.duration)

  if (!raw) {
    return Infinity
  }

  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric
  }

  const isoMatch = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (isoMatch) {
    const hours = Number(isoMatch[1] || 0)
    const minutes = Number(isoMatch[2] || 0)
    const seconds = Number(isoMatch[3] || 0)
    return hours * 3600 + minutes * 60 + seconds
  }

  const parts = raw.split(':').map(Number)

  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1]
  }

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  return Infinity
}

function parsePublishedAt(track) {
  const timestamp = new Date(track?.publishedAt || track?.published || track?.date || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isTopicChannel(track) {
  return [
    track?.sourceChannelTitle,
    track?.channelTitle,
    track?.artist,
  ].some((value) => /\s-\sTopic$/i.test(toText(value)))
}

function patternMatches(text, patterns) {
  return patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label)
}

const STRONG_MUSIC_PATTERNS = [
  { label: 'official-audio', pattern: /\bofficial audio\b/ },
  { label: 'official-music-video', pattern: /\bofficial music video\b/ },
  { label: 'provided-to-youtube', pattern: /\bprovided to youtube\b/ },
  { label: 'lyric-video', pattern: /\blyric video\b/ },
  { label: 'visualizer', pattern: /\bvisuali[sz]er\b/ },
  { label: 'original-mix', pattern: /\boriginal mix\b/ },
  { label: 'dancefloor-mix', pattern: /\bdancefloor mix\b/ },
  { label: 'extended-mix', pattern: /\bextended mix\b/ },
  { label: 'club-mix', pattern: /\bclub mix\b/ },
  { label: 'radio-edit', pattern: /\bradio edit\b/ },
  { label: 'dub-mix', pattern: /\bdub mix\b/ },
  { label: 'vocal-mix', pattern: /\bvocal mix\b/ },
  { label: 'remix', pattern: /\bremix\b/ },
  { label: 'bootleg', pattern: /\bbootleg\b/ },
  { label: 'vip', pattern: /\bvip\b/ },
  { label: 'dub', pattern: /\bdub\b/ },
  { label: 'edit', pattern: /\bedit\b/ },
  { label: 'instrumental', pattern: /\binstrumental\b/ },
]

const MEDIUM_MUSIC_PATTERNS = [
  { label: 'feat', pattern: /\bfeat\.?\b/ },
  { label: 'ft', pattern: /\bft\.?\b/ },
  { label: 'prod', pattern: /\bprod\.?\b/ },
  { label: 'single', pattern: /\bsingle\b/ },
  { label: 'ep', pattern: /\bep\b/ },
  { label: 'lp', pattern: /\blp\b/ },
  { label: 'vinyl', pattern: /\bvinyl\b/ },
  { label: 'record-size-12', pattern: /\b12["']?\b/ },
  { label: 'record-size-7', pattern: /\b7["']?\b/ },
  { label: 'white-label', pattern: /\bwhite label\b/ },
  { label: 'side-a', pattern: /\bside a\b/ },
  { label: 'side-b', pattern: /\bside b\b/ },
  { label: 'records', pattern: /\brecords?\b/ },
  { label: 'recordings', pattern: /\brecordings\b/ },
  { label: 'release', pattern: /\brelease\b/ },
  { label: 'premiere', pattern: /\bpremiere\b/ },
]

const CONTEXTUAL_FORMAT_PATTERNS = [
  { label: 'album', pattern: /\balbum\b/ },
  { label: 'full-album', pattern: /\bfull album\b/ },
  { label: 'full-ep', pattern: /\bfull ep\b/ },
  { label: 'compilation', pattern: /\bcompilation\b/ },
  { label: 'playlist', pattern: /\bplaylist\b/ },
  { label: 'dj-set', pattern: /\bdj set\b/ },
  { label: 'live-set', pattern: /\blive set\b/ },
  { label: 'mixed', pattern: /\bmixed\b/ },
]

const GENRE_PATTERNS = [
  { label: 'uk-garage', pattern: /\buk garage\b/ },
  { label: 'ukg', pattern: /\bukg\b/ },
  { label: 'two-step', pattern: /\b(?:2|two)[ -]?step\b/ },
  { label: 'uk-funky', pattern: /\buk funky\b/ },
  { label: 'garage', pattern: /\bgarage\b/ },
  { label: 'soulful-house', pattern: /\bsoulful house\b/ },
  { label: 'deep-house', pattern: /\bdeep house\b/ },
  { label: 'tech-house', pattern: /\btech house\b/ },
  { label: 'house', pattern: /\bhouse\b/ },
  { label: 'techno', pattern: /\btechno\b/ },
  { label: 'minimal', pattern: /\bminimal\b/ },
  { label: 'dub-techno', pattern: /\bdub techno\b/ },
  { label: 'trance', pattern: /\btrance\b/ },
  { label: 'ambient', pattern: /\bambient\b/ },
  { label: 'electro', pattern: /\belectro\b/ },
  { label: 'breakbeat', pattern: /\bbreaks?\b|\bbreakbeat\b/ },
  { label: 'jungle', pattern: /\bjungle\b/ },
  { label: 'dnb', pattern: /\bdnb\b|\bdrum and bass\b|\bdrum & bass\b/ },
  { label: 'dubstep', pattern: /\bdubstep\b/ },
  { label: 'bassline', pattern: /\bbassline\b/ },
  { label: 'grime', pattern: /\bgrime\b/ },
  { label: 'neo-soul', pattern: /\bneo[ -]?soul\b/ },
  { label: 'r-and-b', pattern: /\br\s*&\s*b\b|\brnb\b/ },
  { label: 'hip-hop', pattern: /\bhip hop\b|\bhip-hop\b/ },
  { label: 'rap', pattern: /\brap\b/ },
  { label: 'soul', pattern: /\bsoul\b/ },
  { label: 'funk', pattern: /\bfunk\b/ },
  { label: 'disco', pattern: /\bdisco\b/ },
  { label: 'jazz', pattern: /\bjazz\b/ },
  { label: 'pop', pattern: /\bpop\b/ },
  { label: 'rock', pattern: /\brock\b/ },
  { label: 'afrobeats', pattern: /\bafrobeats?\b/ },
  { label: 'amapiano', pattern: /\bamapiano\b/ },
  { label: 'baile-funk', pattern: /\bbaile funk\b/ },
  { label: 'balearic', pattern: /\bbalearic\b/ },
  { label: 'breakcore', pattern: /\bbreakcore\b/ },
  { label: 'chicago-house', pattern: /\bchicago house\b/ },
  { label: 'detroit-techno', pattern: /\bdetroit techno\b/ },
  { label: 'downtempo', pattern: /\bdowntempo\b/ },
  { label: 'drill', pattern: /\bdrill\b/ },
  { label: 'dub-reggae', pattern: /\bdub reggae\b/ },
  { label: 'electronica', pattern: /\belectronica\b|\bidm\b/ },
  { label: 'footwork', pattern: /\bfootwork\b|\bjuke\b/ },
  { label: 'gqom', pattern: /\bgqom\b/ },
  { label: 'hardgroove', pattern: /\bhardgroove\b/ },
  { label: 'italo-disco', pattern: /\bitalo disco\b/ },
  { label: 'jersey-club', pattern: /\bjersey club\b/ },
  { label: 'latin-house', pattern: /\blatin house\b/ },
  { label: 'lo-fi-house', pattern: /\blo[ -]?fi house\b/ },
  { label: 'phonk', pattern: /\bphonk\b/ },
  { label: 'progressive-house', pattern: /\bprogressive house\b/ },
  { label: 'speed-garage', pattern: /\bspeed garage\b/ },
  { label: 'synth-pop', pattern: /\bsynth[ -]?pop\b/ },
  { label: 'trap', pattern: /\btrap\b/ },
  { label: 'trip-hop', pattern: /\btrip[ -]?hop\b/ },
  { label: 'wave', pattern: /\bwave\b/ },
]

const NON_MUSIC_PATTERNS = [
  { label: 'how-to', pattern: /\bhow to\b/ },
  { label: 'tutorial', pattern: /\btutorial\b/ },
  { label: 'ableton-tutorial', pattern: /\bableton\b.*\btutorial\b|\btutorial\b.*\bableton\b/ },
  { label: 'fl-studio-tutorial', pattern: /\bfl studio\b.*\btutorial\b|\btutorial\b.*\bfl studio\b/ },
  { label: 'mixing-tutorial', pattern: /\bmixing tutorial\b/ },
  { label: 'mastering-tutorial', pattern: /\bmastering tutorial\b/ },
  { label: 'explained', pattern: /\bexplained\b|\bexplanation\b/ },
  { label: 'reaction', pattern: /\breaction\b|\breacts?\b|\bfirst time hearing\b/ },
  { label: 'review', pattern: /\breview\b|\bgear review\b/ },
  { label: 'unboxing', pattern: /\bunboxing\b/ },
  { label: 'walkthrough', pattern: /\bwalkthrough\b/ },
  { label: 'interview', pattern: /\binterview\b/ },
  { label: 'podcast', pattern: /\bpodcast\b/ },
  { label: 'video-essay', pattern: /\bvideo essay\b/ },
  { label: 'behind-the-scenes', pattern: /\bbehind the scenes\b/ },
  { label: 'vlog', pattern: /\bvlog\b/ },
  { label: 'lesson', pattern: /\blesson\b/ },
]

const BAD_FILTER_VALUES = new Set([
  '',
  'youtube',
  'music',
  'video',
  'videos',
  'discovery',
  'entertainment',
  'people & blogs',
  'film & animation',
  'news & politics',
  'sports',
  'gaming',
  'education',
  'howto & style',
])

const GENRE_LABELS = {
  'uk-garage': 'UK Garage',
  ukg: 'UKG',
  'two-step': '2-Step',
  'uk-funky': 'UK Funky',
  garage: 'Garage',
  'soulful-house': 'Soulful House',
  'deep-house': 'Deep House',
  'tech-house': 'Tech House',
  house: 'House',
  techno: 'Techno',
  minimal: 'Minimal',
  'dub-techno': 'Dub Techno',
  trance: 'Trance',
  ambient: 'Ambient',
  electro: 'Electro',
  breakbeat: 'Breakbeat',
  jungle: 'Jungle',
  dnb: 'Drum & Bass',
  dubstep: 'Dubstep',
  bassline: 'Bassline',
  grime: 'Grime',
  'neo-soul': 'Neo-Soul',
  'r-and-b': 'R&B',
  'hip-hop': 'Hip-Hop',
  rap: 'Rap',
  soul: 'Soul',
  funk: 'Funk',
  disco: 'Disco',
  jazz: 'Jazz',
  pop: 'Pop',
  rock: 'Rock',
  afrobeats: 'Afrobeats',
  amapiano: 'Amapiano',
  'baile-funk': 'Baile Funk',
  balearic: 'Balearic',
  breakcore: 'Breakcore',
  'chicago-house': 'Chicago House',
  'detroit-techno': 'Detroit Techno',
  downtempo: 'Downtempo',
  drill: 'Drill',
  'dub-reggae': 'Dub Reggae',
  electronica: 'Electronica',
  footwork: 'Footwork',
  gqom: 'Gqom',
  hardgroove: 'Hardgroove',
  'italo-disco': 'Italo Disco',
  'jersey-club': 'Jersey Club',
  'latin-house': 'Latin House',
  'lo-fi-house': 'Lo-Fi House',
  phonk: 'Phonk',
  'progressive-house': 'Progressive House',
  'speed-garage': 'Speed Garage',
  'synth-pop': 'Synth Pop',
  trap: 'Trap',
  'trip-hop': 'Trip-Hop',
  wave: 'Wave',
}

const DISCOVERY_GENRE_OPTIONS = [
  { label: 'Afrobeats', aliases: ['afrobeat', 'afrobeats'] },
  { label: 'Amapiano', aliases: ['amapiano'] },
  { label: 'Ambient', aliases: ['ambient'] },
  { label: 'Baile Funk', aliases: ['baile funk'] },
  { label: 'Balearic', aliases: ['balearic'] },
  { label: 'Bassline', aliases: ['bassline'] },
  { label: 'Breakbeat', aliases: ['breakbeat', 'breaks'] },
  { label: 'Breakcore', aliases: ['breakcore'] },
  { label: 'Chicago House', aliases: ['chicago house'] },
  { label: 'Deep House', aliases: ['deep house'] },
  { label: 'Detroit Techno', aliases: ['detroit techno'] },
  { label: 'Disco', aliases: ['disco'] },
  { label: 'Downtempo', aliases: ['downtempo'] },
  { label: 'Drill', aliases: ['drill'] },
  { label: 'Drum & Bass', aliases: ['drum and bass', 'drum & bass', 'dnb'] },
  { label: 'Dub Reggae', aliases: ['dub reggae'] },
  { label: 'Dub Techno', aliases: ['dub techno'] },
  { label: 'Dubstep', aliases: ['dubstep'] },
  { label: 'Electro', aliases: ['electro'] },
  { label: 'Electronica', aliases: ['electronica', 'idm'] },
  { label: 'Footwork', aliases: ['footwork', 'juke'] },
  { label: 'Funk', aliases: ['funk'] },
  { label: 'Garage', aliases: ['garage'] },
  { label: 'Gqom', aliases: ['gqom'] },
  { label: 'Grime', aliases: ['grime'] },
  { label: 'Hardgroove', aliases: ['hardgroove'] },
  { label: 'Hip-Hop', aliases: ['hip hop', 'hip-hop'] },
  { label: 'House', aliases: ['house'] },
  { label: 'Italo Disco', aliases: ['italo disco'] },
  { label: 'Jazz', aliases: ['jazz'] },
  { label: 'Jersey Club', aliases: ['jersey club'] },
  { label: 'Jungle', aliases: ['jungle'] },
  { label: 'Latin House', aliases: ['latin house'] },
  { label: 'Lo-Fi House', aliases: ['lo-fi house', 'lofi house'] },
  { label: 'Minimal', aliases: ['minimal'] },
  { label: 'Neo-Soul', aliases: ['neo soul', 'neo-soul'] },
  { label: 'Phonk', aliases: ['phonk'] },
  { label: 'Pop', aliases: ['pop'] },
  { label: 'Progressive House', aliases: ['progressive house'] },
  { label: 'R&B', aliases: ['r&b', 'rnb'] },
  { label: 'Rap', aliases: ['rap'] },
  { label: 'Rock', aliases: ['rock'] },
  { label: 'Soul', aliases: ['soul'] },
  { label: 'Soulful House', aliases: ['soulful house'] },
  { label: 'Speed Garage', aliases: ['speed garage'] },
  { label: 'Synth Pop', aliases: ['synth pop', 'synth-pop'] },
  { label: 'Tech House', aliases: ['tech house'] },
  { label: 'Techno', aliases: ['techno'] },
  { label: 'Trance', aliases: ['trance'] },
  { label: 'Trap', aliases: ['trap'] },
  { label: 'Trip-Hop', aliases: ['trip hop', 'trip-hop'] },
  { label: 'UK Funky', aliases: ['uk funky'] },
  { label: 'UK Garage', aliases: ['uk garage', 'ukg'] },
  { label: 'Wave', aliases: ['wave'] },
]

const FORMAT_LABELS = {
  album: 'Album',
  'full-album': 'Album',
  'full-ep': 'EP',
  compilation: 'Compilation',
  playlist: 'Playlist',
  'dj-set': 'DJ Set',
  'live-set': 'Live Set',
  mixed: 'Mix',
  'official-audio': 'Official Audio',
  'provided-to-youtube': 'Official Audio',
  'original-mix': 'Original Mix',
  'dancefloor-mix': 'Dancefloor Mix',
  'extended-mix': 'Extended Mix',
  'club-mix': 'Club Mix',
  'radio-edit': 'Radio Edit',
  'dub-mix': 'Dub Mix',
  'vocal-mix': 'Vocal Mix',
  remix: 'Remix',
  bootleg: 'Bootleg',
  vip: 'VIP',
  dub: 'Dub',
  edit: 'Edit',
  instrumental: 'Instrumental',
  'lyric-video': 'Lyric Video',
  visualizer: 'Visualizer',
}

function uniqueValues(values) {
  return [...new Set(values.map(toText).filter(Boolean))]
}

function isUsefulFilterValue(value) {
  const normalized = normalizeText(value)
  return normalized && !BAD_FILTER_VALUES.has(normalized)
}

function getDirectValues(track, keys) {
  return keys.flatMap((key) => {
    const value = track?.[key]
    if (Array.isArray(value)) return value
    return value ? [value] : []
  })
}

function getTrackStyleLabels(track) {
  const haystack = getHaystack(track)

  const directStyles = getDirectValues(track, ['style', 'styles', 'genre'])
    .filter(isUsefulFilterValue)

  const detectedStyles = patternMatches(haystack, GENRE_PATTERNS)
    .map((label) => GENRE_LABELS[label] || label)
    .filter(isUsefulFilterValue)

  return uniqueValues([...directStyles, ...detectedStyles])
}

function getTrackFormatLabels(track) {
  const haystack = getHaystack(track)
  const duration = parseDurationSeconds(track)

  const directFormats = getDirectValues(track, ['format', 'formats'])
    .filter(isUsefulFilterValue)

  const contextualFormats = patternMatches(haystack, CONTEXTUAL_FORMAT_PATTERNS)
    .map((label) => FORMAT_LABELS[label] || label)
    .filter(isUsefulFilterValue)

  const musicFormats = patternMatches(haystack, STRONG_MUSIC_PATTERNS)
    .map((label) => FORMAT_LABELS[label])
    .filter(Boolean)

  const inferredFormats = []

  if (duration >= 900 && /\bmix\b|\bdj set\b|\blive set\b/.test(haystack)) {
    inferredFormats.push('DJ Set')
  }

  if (duration > 0 && duration < 90) {
    inferredFormats.push('Short Form')
  }

  const formats = uniqueValues([
    ...directFormats,
    ...contextualFormats,
    ...musicFormats,
    ...inferredFormats,
  ])

  return formats.length > 0 ? formats : ['Track']
}

function getGenreAliasValues(value) {
  const normalized = normalizeText(value)
  const match = DISCOVERY_GENRE_OPTIONS.find((option) => {
    const optionValues = [option.label, ...option.aliases].map(normalizeText)
    return optionValues.includes(normalized)
  })

  return new Set(
    [value, match?.label, ...(match?.aliases || [])]
      .map(normalizeText)
      .filter(Boolean),
  )
}

function matchesStyle(track, selectedStyle) {
  if (!selectedStyle || selectedStyle === 'all') return true

  const selectedValues = getGenreAliasValues(selectedStyle)
  const trackStyles = getTrackStyleLabels(track).map(normalizeText)

  if (trackStyles.some((style) => selectedValues.has(style))) {
    return true
  }

  const haystack = getHaystack(track)

  return [...selectedValues].some((selected) => haystack.includes(selected))
}

function matchesFormat(track, selectedFormat) {
  if (!selectedFormat || selectedFormat === 'all') return true

  const selected = normalizeText(selectedFormat)

  return getTrackFormatLabels(track).some((format) => normalizeText(format) === selected)
}

function buildFilterOptions(tracks, getLabels) {
  const counts = new Map()

  tracks.forEach((track) => {
    getLabels(track).forEach((label) => {
      if (!isUsefulFilterValue(label)) return
      counts.set(label, (counts.get(label) || 0) + 1)
    })
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({
      label: `${label} (${count})`,
      value: label,
      count,
    }))
}

function getAvailableStyleOptions(tracks = []) {
  return buildFilterOptions(tracks, getTrackStyleLabels)
}

function getGenreFilterOptions(tracks = []) {
  const detectedOptions = getAvailableStyleOptions(tracks)
  const countsByNormalizedLabel = new Map(
    detectedOptions.map((option) => [normalizeText(option.value), option.count]),
  )
  const catalogNormalizedValues = new Set(
    DISCOVERY_GENRE_OPTIONS.flatMap((option) => [option.label, ...option.aliases].map(normalizeText)),
  )
  const optionsByNormalizedLabel = new Map()

  DISCOVERY_GENRE_OPTIONS.forEach((option) => {
    const normalized = normalizeText(option.label)
    const aliasCount = [option.label, ...option.aliases]
      .map(normalizeText)
      .reduce((highest, alias) => Math.max(highest, countsByNormalizedLabel.get(alias) || 0), 0)

    optionsByNormalizedLabel.set(normalized, {
      label: option.label,
      value: option.label,
      count: aliasCount,
    })
  })

  detectedOptions.forEach((option) => {
    const normalized = normalizeText(option.value)

    if (!catalogNormalizedValues.has(normalized) && !optionsByNormalizedLabel.has(normalized)) {
      optionsByNormalizedLabel.set(normalized, {
        ...option,
        label: option.value,
      })
    }
  })

  return [...optionsByNormalizedLabel.values()]
    .sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1
      if (a.count === 0 && b.count > 0) return 1
      return a.value.localeCompare(b.value)
    })
}

function getAvailableFormatOptions(tracks = []) {
  return buildFilterOptions(tracks, getTrackFormatLabels)
}

function looksLikeTrackTitle(track) {
  const title = toText(track?.title)

  return (
    /\S+\s[-\u2013\u2014]\s\S+/.test(title) ||
    /\bfeat\.?\b/i.test(title) ||
    /\bft\.?\b/i.test(title) ||
    /\bprod\.?\b/i.test(title) ||
    /\(.+(?:mix|edit|dub|remix|vip).*\)/i.test(title) ||
    /\[.+(?:mix|edit|dub|remix|vip).*\]/i.test(title)
  )
}

function getMusicLikelihoodDetails(track) {
  const haystack = getHaystack(track)
  const duration = parseDurationSeconds(track)
  const title = toText(track?.title)
  const strongMatches = patternMatches(haystack, STRONG_MUSIC_PATTERNS)
  const mediumMatches = patternMatches(haystack, MEDIUM_MUSIC_PATTERNS)
  const genreMatches = patternMatches(haystack, GENRE_PATTERNS)
  const formatMatches = patternMatches(haystack, CONTEXTUAL_FORMAT_PATTERNS)
  const nonMusicMatches = patternMatches(haystack, NON_MUSIC_PATTERNS)
  const topicChannel = isTopicChannel(track)
  const categoryId = String(track?.categoryId ?? '')
  const hasCategoryMusic = categoryId === '10'
  const trackTitle = looksLikeTrackTitle(track)
  const penalties = []

  let score = title ? 0.4 : -0.6

  if (hasCategoryMusic) score += 2.1
  if (topicChannel) score += 1.25
  if (strongMatches.length > 0) score += Math.min(2.4, 1.1 + (strongMatches.length * 0.35))
  if (mediumMatches.length > 0) score += Math.min(1.4, mediumMatches.length * 0.35)
  if (genreMatches.length > 0) score += Math.min(1.9, genreMatches.length * 0.5)
  if (trackTitle) score += 1.1

  if (duration >= 90 && duration <= 540) {
    score += 1.3
  } else if (duration >= 75 && duration <= 900) {
    score += 1.0
  } else if (duration > 900 && duration <= 7200 && /\bmix\b|\bdj set\b|\blive set\b/.test(haystack)) {
    score += 0.7
  } else if (duration > 0 && duration < 60) {
    score -= 2.2
    penalties.push({ label: 'short-duration', value: 2.2 })
  } else if (Number.isFinite(duration) && duration > 1200) {
    score -= 0.8
    penalties.push({ label: 'very-long-duration', value: 0.8 })
  }

  if (toText(track?.artist) || toText(track?.channelTitle) || toText(track?.sourceChannelTitle)) {
    score += 0.45
  }

  const hasLongSingleTrackRisk =
    formatMatches.some((match) => ['album', 'full-album', 'full-ep', 'compilation', 'playlist'].includes(match)) &&
    Number.isFinite(duration) &&
    duration > 1200

  if (hasLongSingleTrackRisk) {
    const penalty = duration > 3600 ? 2.2 : 1.3
    score -= penalty
    penalties.push({ label: 'long-album-playlist-format', value: penalty })
  }

  if (nonMusicMatches.length > 0) {
    const hasStrongMusicIdentity = hasCategoryMusic || topicChannel || strongMatches.length > 0 || genreMatches.length >= 2
    const penalty = Math.min(5.2, 3.2 + ((nonMusicMatches.length - 1) * 0.7)) * (hasStrongMusicIdentity ? 0.65 : 1)
    score -= penalty
    penalties.push({ label: 'non-music-intent', value: Number(penalty.toFixed(2)) })
  }

  const finalScore = roundScore(score)
  const isLikelyMusic =
    finalScore >= 4.8 &&
    !(nonMusicMatches.length > 0 && finalScore < 7.1)

  return {
    score: finalScore,
    isLikelyMusic,
    durationSeconds: duration,
    topicChannel,
    categoryMusic: hasCategoryMusic,
    trackTitle,
    strongMatches,
    mediumMatches,
    genreMatches,
    formatMatches,
    nonMusicMatches,
    penalties,
  }
}

function getMusicLikelihoodScore(track) {
  return getMusicLikelihoodDetails(track).score
}

function isLikelyMusicTrack(track) {
  return getMusicLikelihoodDetails(track).isLikelyMusic
}

function isLikelyShort(track) {
  if (track?.isShort === true) {
    return true
  }

  const haystack = getHaystack(track)
  const duration = parseDurationSeconds(track)

  const explicitShortSignal =
    haystack.includes('#shorts') ||
    haystack.includes('youtube.com/shorts') ||
    haystack.includes('/shorts/') ||
    getTags(track).includes('shorts')

  if (explicitShortSignal) {
    return true
  }

  return duration < 60 && !isLikelyMusicTrack(track)
}

function matchesQuery(track, query) {
  const normalizedQuery = normalizeText(query)

  if (!normalizedQuery) {
    return true
  }

  const haystack = getHaystack(track)
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  return tokens.every((token) => haystack.includes(token))
}

function matchesSelectValue(trackValue, selectedValue) {
  if (!selectedValue || selectedValue === 'all') {
    return true
  }

  return normalizeText(trackValue) === normalizeText(selectedValue)
}

function matchesTags(track, activeTags = [], mode = 'all') {
  if (!activeTags.length) {
    return true
  }

  const trackTags = getTags(track)
  const selectedTags = activeTags.map(normalizeText).filter(Boolean)

  if (!selectedTags.length) {
    return true
  }

  if (mode === 'any') {
    return selectedTags.some((tag) => trackTags.includes(tag))
  }

  return selectedTags.every((tag) => trackTags.includes(tag))
}

function matchesDigDeeperTags(track, digDeeperTags = [], mode = 'any') {
  if (!digDeeperTags.length) {
    return true
  }

  const trackTags = getTags(track)
  const selectedTags = digDeeperTags.map(normalizeText).filter(Boolean)

  if (!selectedTags.length) {
    return true
  }

  if (mode === 'all') {
    return selectedTags.every((tag) => trackTags.includes(tag))
  }

  return selectedTags.some((tag) => trackTags.includes(tag))
}

function getEngagementBoost({ views, likes, comments }) {
  if (views < 100) {
    return 0
  }

  const likeRate = likes / views
  const commentRate = comments / views

  let boost = 0

  if (likeRate >= 0.08) boost += 0.7
  else if (likeRate >= 0.05) boost += 0.45
  else if (likeRate >= 0.03) boost += 0.25

  if (commentRate >= 0.01) boost += 0.35
  else if (commentRate >= 0.004) boost += 0.2

  return boost
}

function getLowViewDiscoveryBoost(views) {
  if (views <= 0) return 0
  if (views <= 1_000) return 0.55
  if (views <= 5_000) return 0.65
  if (views <= 10_000) return 0.55
  if (views <= 25_000) return 0.4
  if (views <= 50_000) return 0.18
  return 0
}

function getRecencyBoost(publishedAt) {
  if (!publishedAt) {
    return 0
  }

  const ageDays = (Date.now() - publishedAt) / 86_400_000

  if (ageDays <= 7) return 0.3
  if (ageDays <= 30) return 0.2
  if (ageDays <= 90) return 0.1

  return 0
}

function buildTrackMeta(track, index, options) {
  const views = parseCount(track?.views ?? track?.viewCount, 0)
  const likes = parseCount(track?.likes ?? track?.likeCount, 0)
  const comments = parseCount(track?.comments ?? track?.commentCount, 0)
  const gemScore = parseCount(track?.gemScore, 0)
  const qualityScore = parseCount(track?.qualityScore ?? track?.trackQualityScore, 0)
  const durationSeconds = parseDurationSeconds(track)
  const publishedAt = parsePublishedAt(track)
  const musicLikelihood = getMusicLikelihoodDetails(track)
  const topicChannel = musicLikelihood.topicChannel

  let rankingScore = gemScore
  rankingScore += Math.min(Math.max(qualityScore, 0), 10) * 0.16
  rankingScore += getEngagementBoost({ views, likes, comments })
  rankingScore += getLowViewDiscoveryBoost(views)
  rankingScore += getRecencyBoost(publishedAt)
  rankingScore += musicLikelihood.score * 0.07

  if (options.preferTopicChannels && topicChannel) {
    rankingScore += 0.35
  }

  return {
    track,
    index,
    views,
    likes,
    comments,
    gemScore,
    qualityScore,
    durationSeconds,
    publishedAt,
    musicLikelihood,
    musicLikelihoodScore: musicLikelihood.score,
    topicChannel,
    rankingScore,
  }
}

function compareBySort(a, b, sortBy) {
  if (sortBy === 'views') {
    return (
      b.views - a.views ||
      b.rankingScore - a.rankingScore ||
      a.index - b.index
    )
  }

  if (sortBy === 'likes') {
    return (
      b.likes - a.likes ||
      b.rankingScore - a.rankingScore ||
      a.index - b.index
    )
  }

  if (sortBy === 'newest') {
    return (
      b.publishedAt - a.publishedAt ||
      b.rankingScore - a.rankingScore ||
      a.index - b.index
    )
  }

  return (
    b.rankingScore - a.rankingScore ||
    b.gemScore - a.gemScore ||
    a.index - b.index
  )
}

function incrementReason(map, reason) {
  map.set(reason, (map.get(reason) || 0) + 1)
}

function getVideoId(track) {
  return toText(track?.videoId || track?.youtubeVideoId || track?.id).replace(/^yt-/, '')
}

function getRejectReason(meta, config, thresholds) {
  const { track } = meta
  const selectedStyle =
    config.style && config.style !== 'all'
      ? config.style
      : config.genre

  if (!matchesQuery(track, config.query)) return 'query mismatch'
  if (!matchesStyle(track, selectedStyle)) return 'style mismatch'
  if (!matchesFormat(track, config.format)) return 'format mismatch'
  if (!matchesSelectValue(track?.vibe, config.vibe)) return 'vibe mismatch'
  if (config.musicTracksOnly && !meta.musicLikelihood.isLikelyMusic) return 'music likelihood below threshold'
  if (config.hideShorts && isLikelyShort(track)) return 'shorts guard'
  if (meta.views > thresholds.maxViewsValue) return 'max views'
  if (config.lowViewsOnly && meta.views > 20_000) return 'low views only'
  if (meta.gemScore < thresholds.minGemScoreValue) return 'gem floor'
  if (meta.qualityScore < thresholds.minQualityScore) return 'quality floor'
  if (!matchesTags(track, config.activeTags, config.tagMatchMode)) return 'tag mismatch'
  if (!matchesDigDeeperTags(track, config.digDeeperTags, config.digDeeperMatchMode)) return 'dig deeper tag mismatch'

  return null
}

function summarizeScoreBreakdown(track) {
  const breakdown = track?.scoreBreakdown || {}

  return {
    title: track?.title,
    channel: track?.sourceChannelTitle || track?.channelTitle || track?.artist,
    views: track?.views,
    gemScore: track?.gemScore,
    qualityScore: track?.qualityScore ?? track?.trackQualityScore,
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

function debugFilterSummary({ config, initialCount, accepted, rejectedCounts }) {
  if (!DEV || initialCount === 0) {
    return
  }

  const strictMode = config.strictGemsOnly || config.strictCrateDiggingMode
  const removedRatio = (initialCount - accepted.length) / initialCount

  console.groupCollapsed(`[CrateDigger][filter] accepted ${accepted.length}/${initialCount}`)
  console.table(
    Array.from(rejectedCounts.entries()).map(([reason, count]) => ({ reason, count })),
  )
  console.table(accepted.slice(0, 10).map(({ track }) => summarizeScoreBreakdown(track)))

  const gold = accepted.find(({ track }) => getVideoId(track) === GOLD_VIDEO_ID)
  if (gold) {
    console.log('[CrateDigger][gold-hidden-gem]', {
      accepted: true,
      musicLikelihood: gold.musicLikelihood,
      scoreBreakdown: gold.track.scoreBreakdown,
      track: gold.track,
    })
  }

  if (strictMode && removedRatio >= 0.7) {
    console.warn('[CrateDigger][filter] strict filters removed most results', {
      initialCount,
      acceptedCount: accepted.length,
      removedRatio: Number(removedRatio.toFixed(2)),
    })
  }

  console.groupEnd()
}

export function filterTracks(tracks = [], options = {}) {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  const strictMode = config.strictGemsOnly || config.strictCrateDiggingMode

  const thresholds = {
    maxViewsValue: strictMode
      ? Math.min(parseMaxViews(config.maxViews), 50_000)
      : parseMaxViews(config.maxViews),
    minGemScoreValue: strictMode
      ? Math.max(7, parseMinNumber(config.minGemScore, -Infinity))
      : parseMinNumber(config.minGemScore, -Infinity),
    minQualityScore: config.strictCrateDiggingMode ? 3 : -Infinity,
  }

  const sortByValue = strictMode ? 'gemScore' : config.sortBy
  const rejectedCounts = new Map()
  const accepted = []

  tracks
    .map((track, index) => buildTrackMeta(track, index, config))
    .forEach((meta) => {
      const reason = getRejectReason(meta, config, thresholds)

      if (reason) {
        incrementReason(rejectedCounts, reason)
        return
      }

      accepted.push(meta)
    })

  accepted.sort((a, b) => compareBySort(a, b, sortByValue))
  debugFilterSummary({
    config,
    initialCount: tracks.length,
    accepted,
    rejectedCounts,
  })

  return accepted.map(({ track }) => track)
}

export {
  parseCount,
  parseDurationSeconds,
  isLikelyMusicTrack,
  isLikelyShort,
  isTopicChannel,
  getMusicLikelihoodScore,
  getMusicLikelihoodDetails,
  getTrackStyleLabels,
  getTrackFormatLabels,
  getAvailableStyleOptions,
  getGenreFilterOptions,
  getAvailableFormatOptions,
}
