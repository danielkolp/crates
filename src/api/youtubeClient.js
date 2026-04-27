import mockTracks from '../data/mockTracks'
import mockCrates from '../data/mockCrates'
import { attachGemScores, getTrackQualityScore } from '../utils/gemScore'
import { filterTracks } from '../utils/filterTracks'

const mockFallbackTracks = attachGemScores(mockTracks)
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

const OPTIONAL_INTENT = ['official audio', 'topic', 'provided to youtube', 'single', 'ep', 'original mix', 'extended mix']

const BAD_KEYWORDS = [
  '#shorts',
  'shorts',
  'reaction',
  'newsong',
  'singer',
  'all my songs in bio',
  'link in bio',
  'kids',
  'cover',
  'karaoke',
  'tutorial',
  'lyrics',
  'playlist',
  'compilation',
  'tiktok',
  'viral',
  'challenge',
  'subscribe',
  'minecraft',
  'roblox',
  'fortnite',
  'vlog',
  'prank',
  'news',
  'live reaction',
  'sped up',
  'slowed reverb',
]

const EXCLUDE_TERMS = ['-shorts', '-reaction', '-kids', '-news', '-cover', '-tutorial']

let lastSearchStatus = {
  source: 'mock',
  usedFallback: true,
  message: 'Mock tracks loaded.',
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

function buildSearchKey(query, filters = {}) {
  return JSON.stringify({
    query: query.trim().toLowerCase(),
    refreshKey: filters.refreshKey ?? 0,
    genre: filters.genre ?? 'all',
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
    activeTags: [...(filters.activeTags || [])].map((tag) => String(tag).toLowerCase()).sort(),
    digDeeperTags: [...(filters.digDeeperTags || [])].map((tag) => String(tag).toLowerCase()).sort(),
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
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds
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

  if (normalizedQuery) {
    parts.push(normalizedQuery)
  } else {
    const seed = SEARCH_DEFAULTS[Math.floor(Math.random() * SEARCH_DEFAULTS.length)]
    parts.push(seed)
  }

  if (filters.genre && filters.genre !== 'all') {
    parts.push(filters.genre)
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

function hasBadKeyword(title = '', description = '', channel = '') {
  const haystack = `${title} ${description} ${channel}`.toLowerCase()
  return BAD_KEYWORDS.find((keyword) => haystack.includes(keyword)) || null
}

function debugReject(video, reason) {
  if (!DEV) {
    return
  }

  console.log('[CrateDigger][reject]', {
    title: video.snippet?.title,
    channel: video.snippet?.channelTitle,
    reason,
  })
}

function stripTopicSuffix(name = '') {
  const normalized = String(name || '').trim()
  if (!normalized) {
    return ''
  }

  const withoutTopicSuffix = normalized.replace(/\s*[-–—]\s*topic\s*$/i, '').trim()
  return withoutTopicSuffix || normalized
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
  const genre = filters.genre && filters.genre !== 'all' ? filters.genre : 'YouTube'
  const vibe = filters.vibe && filters.vibe !== 'all' ? filters.vibe : 'Discovery'
  const tags = Array.isArray(snippet.tags) && snippet.tags.length > 0 ? snippet.tags : [...(filters.activeTags || [])]
  const sourceChannelTitle = snippet.channelTitle || 'Unknown Channel'
  const displayArtist = stripTopicSuffix(sourceChannelTitle) || sourceChannelTitle

  return {
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
}

function evaluateVideoQuality(track, filters = {}) {
  const title = String(track.title || '')
  const description = String(track.description || '')
  const channel = String(track.sourceChannelTitle || track.channelTitle || '')
  const normalizedTitle = title.toLowerCase()
  const hashtagCountTitle = countHashtags(title)
  const hashtagCountDescription = countHashtags(description)
  const qualityScore = getTrackQualityScore(track)

  if (filters.hideShorts !== false && Number(track.durationSeconds || 0) < 90) {
    return { keep: false, reason: 'rejected: shorts duration', qualityScore }
  }

  if (Number(track.durationSeconds || 0) > 720 && !/mix|extended/.test(normalizedTitle)) {
    return { keep: false, reason: 'rejected: duration too long', qualityScore }
  }

  const badKeyword = hasBadKeyword(title, description, channel)
  if (badKeyword) {
    return { keep: false, reason: `rejected: bad keyword (${badKeyword})`, qualityScore }
  }

  if (hashtagCountTitle > 3) {
    return { keep: false, reason: 'rejected: title hashtag spam', qualityScore }
  }

  if (hashtagCountDescription > 14) {
    return { keep: false, reason: 'rejected: description hashtag spam', qualityScore }
  }

  if (emojiHeavyTitle(title)) {
    return { keep: false, reason: 'rejected: emoji-heavy title', qualityScore }
  }

  if (promoWordCount(title) >= 2) {
    return { keep: false, reason: 'rejected: promo-heavy title', qualityScore }
  }

  if (filters.preferTopicChannels !== false && !channel.endsWith(' - Topic') && qualityScore < 4) {
    return { keep: false, reason: 'rejected: weak topic/track structure', qualityScore }
  }

  if (qualityScore < 3) {
    return { keep: false, reason: 'rejected: low track quality score', qualityScore }
  }

  return { keep: true, qualityScore }
}

async function fetchYouTubeJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`YouTube request failed: ${response.status}`)
  }

  return response.json()
}

async function fetchYouTubeTracks(query, filters = {}) {
  const apiKey = getApiKey()
  if (!apiKey) {
    return null
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

  for (const candidate of candidates) {
    const qualityCheck = evaluateVideoQuality(candidate, filters)

    if (!qualityCheck.keep) {
      debugReject({ snippet: { title: candidate.title, channelTitle: candidate.channelTitle } }, qualityCheck.reason)
      continue
    }

    accepted.push(candidate)
  }

  const scored = attachGemScores(accepted)

  if (DEV) {
    scored.forEach((track) => {
      console.log('[CrateDigger][score]', {
        title: track.title,
        qualityScore: track.qualityScore,
        gemScore: track.gemScore,
      })
    })
  }

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
      setSearchStatus('mock', true, 'Mock fallback active. Add VITE_YOUTUBE_API_KEY to enable live YouTube search.')
      await wait(180)
      return shuffleTracks(filterTracks(mockFallbackTracks, { ...filters, query }))
    }

    try {
      const apiTracks = await fetchYouTubeTracks(query, filters)
      if (Array.isArray(apiTracks)) {
        setSearchStatus('youtube', false, apiTracks.length === 0 ? 'No clean music tracks found for this search.' : 'Live YouTube results loaded.')
        return shuffleTracks(filterTracks(apiTracks, { ...filters, query: '' }))
      }
    } catch {
      setSearchStatus('mock', true, 'YouTube request failed. Showing mock fallback for this session.')
      await wait(180)
      return shuffleTracks(filterTracks(mockFallbackTracks, { ...filters, query }))
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
  return mockFallbackTracks.find((track) => track.id === id) || null
}

export async function getRelatedTracks(trackId) {
  const baseTrack = mockFallbackTracks.find((track) => track.id === trackId)
  if (!baseTrack) {
    return []
  }

  const relatedQuery = `${baseTrack.artist} ${baseTrack.genre} official audio`
  const related = await searchTracks(relatedQuery, {
    genre: baseTrack.genre || 'all',
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

  return related.filter((track) => track.id !== trackId).slice(0, 12)
}

export async function getUserPlaylists() {
  return mockCrates.map((crate) => ({
    ...crate,
    trackIds: [],
  }))
}

export async function addTrackToCrate(trackId, crateId) {
  return {
    ok: true,
    trackId,
    crateId,
  }
}

export async function getVideoDetails(videoId) {
  const apiKey = getApiKey()
  if (!apiKey || !videoId) {
    return mockFallbackTracks.find((track) => track.youtubeVideoId === videoId) || null
  }

  try {
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
    videosUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
    videosUrl.searchParams.set('id', videoId)
    videosUrl.searchParams.set('key', apiKey)

    const videosResult = await fetchYouTubeJson(videosUrl.toString())
    const video = videosResult.items?.[0]
    return normalizeYouTubeVideo(video) || null
  } catch {
    return mockFallbackTracks.find((track) => track.youtubeVideoId === videoId) || null
  }
}

export function normalizeYouTubeVideoForTests(video, filters = {}) {
  return normalizeYouTubeVideo(video, filters)
}

export { parseYouTubeDuration, normalizeYouTubeVideo }
