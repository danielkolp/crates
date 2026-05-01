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

const SEARCH_DEFAULTS = [
  'underground uk garage full track',
  '2 step garage vinyl',
  'white label garage dub',
  'underground house official audio',
  'breaks dub track',
]

const MUSIC_INTENT_APPEND = [
  'full track',
  'music',
  'official audio',
  'premiere',
  'vinyl',
  'white label',
  'dub',
  'mix',
  'uk garage',
  '2-step',
  'house',
  'breaks',
]

const OPTIONAL_INTENT = [
  'official audio',
  'topic',
  'provided to youtube',
  'single',
  'ep',
  'original mix',
  'extended mix',
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

const EXCLUDE_TERMS = ['-shorts', '-reaction', '-kids', '-news', '-cover', '-tutorial']

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

function shuffleTracks(tracks = []) {
  const next = [...tracks]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
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

function setSearchStatus(source, usedFallback, message) {
  lastSearchStatus = {
    source,
    usedFallback,
    message,
  }
}

export function getLastSearchStatus() {
  return lastSearchStatus
}

function normalizeCacheList(values = []) {
  return [...values].map((value) => String(value).toLowerCase()).sort()
}

function buildSearchKey(query, filters = {}) {
  return JSON.stringify({
    query: query.trim().toLowerCase(),
    refreshKey: filters.refreshKey ?? 0,
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

function buildYouTubeQuery(query, filters = {}) {
  const parts = []
  const normalizedQuery = String(query || '').trim()
  const selectedStyle =
    filters.style && filters.style !== 'all'
      ? filters.style
      : filters.genre
  const hasSelectedStyle = selectedStyle && selectedStyle !== 'all'

  if (normalizedQuery) {
    parts.push(normalizedQuery)
  } else if (hasSelectedStyle) {
    parts.push(`underground ${selectedStyle} full track`)
  } else {
    const seed = SEARCH_DEFAULTS[Math.floor(Math.random() * SEARCH_DEFAULTS.length)]
    parts.push(seed)
  }

  if (hasSelectedStyle && normalizedQuery) {
    parts.push(selectedStyle)
  }

  if (filters.format && filters.format !== 'all') {
    parts.push(filters.format)
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
    parts.push(...MUSIC_INTENT_APPEND.slice(0, 4))
  }

  if (filters.preferTopicChannels !== false) {
    parts.push(...OPTIONAL_INTENT.slice(0, 3))
  }

  parts.push(...EXCLUDE_TERMS)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
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

  if (!response.ok) {
    throw new Error(`YouTube request failed: ${response.status}`)
  }

  return response.json()
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

function debugYouTubeResults({ searchQuery, candidates, accepted, rejectedCounts, scored }) {
  if (!DEV) {
    return
  }

  console.groupCollapsed(`[CrateDigger][youtube] accepted ${accepted.length}/${candidates.length}`)
  console.log('query:', searchQuery)

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

async function fetchYouTubeTracks(query, filters = {}) {
  const apiKey = getApiKey()

  if (!apiKey) {
    return []
  }

  const searchQuery = buildYouTubeQuery(query, filters)
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')

  searchUrl.searchParams.set('part', 'snippet')
  searchUrl.searchParams.set('type', 'video')
  searchUrl.searchParams.set('maxResults', '36')
  searchUrl.searchParams.set('videoCategoryId', '10')
  searchUrl.searchParams.set('videoEmbeddable', 'true')
  searchUrl.searchParams.set('videoSyndicated', 'true')
  searchUrl.searchParams.set('safeSearch', 'none')
  searchUrl.searchParams.set('q', searchQuery)
  searchUrl.searchParams.set('key', apiKey)

  const searchResult = await fetchYouTubeJson(searchUrl.toString())
  const videoIds = (searchResult.items || []).map((item) => item.id?.videoId).filter(Boolean)

  if (videoIds.length === 0) {
    return []
  }

  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')

  videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
  videosUrl.searchParams.set('id', videoIds.join(','))
  videosUrl.searchParams.set('key', apiKey)

  const videosResult = await fetchYouTubeJson(videosUrl.toString())
  const videosById = new Map((videosResult.items || []).map((item) => [item.id, item]))

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
    searchQuery,
    candidates,
    accepted,
    rejectedCounts,
    scored,
  })

  return scored
}

export async function searchTracks(query = '', filters = {}) {
  const cacheKey = buildSearchKey(query, filters)

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
      const apiTracks = await fetchYouTubeTracks(query, filters)

      if (Array.isArray(apiTracks)) {
        setSearchStatus(
          'youtube',
          false,
          apiTracks.length === 0
            ? 'No clean music tracks found for this search.'
            : 'Live YouTube results loaded.',
        )

        return shuffleTracks(filterTracks(apiTracks, { ...filters, query: '' }))
      }
    } catch (error) {
      console.error('[CrateDigger][youtube] request failed', error)

      setSearchStatus(
        'youtube',
        false,
        'YouTube request failed. Try again or check your API key/quota.',
      )

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
  return fetchYouTubeTracks(query, filters)
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
