import { attachGemScores } from '../utils/gemScore'
import { GOLD_HIDDEN_GEM } from './goldHiddenGem'

function buildWaveformSeed(youtubeVideoId) {
  const length = 24
  const seed = String(youtubeVideoId || 'demo')
  const values = []

  for (let index = 0; index < length; index += 1) {
    const charCode = seed.charCodeAt(index % seed.length) || 48
    const value = ((charCode + index * 17) % 70) / 100 + 0.25
    values.push(Number(Math.min(value, 0.92).toFixed(2)))
  }

  return values
}

function getArtworkUrl(youtubeVideoId) {
  return `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`
}

function normalizeDemoTrack(track) {
  const youtubeVideoId = track.youtubeVideoId || track.videoId || ''
  const channelTitle = track.sourceChannelTitle || track.channelTitle || track.artist
  const artworkUrl = getArtworkUrl(youtubeVideoId)
  const styles = track.styles?.length ? track.styles : [track.genre].filter(Boolean)
  const formats = track.formats?.length ? track.formats : [track.format || 'Track']

  return {
    ...track,
    id: track.id || `yt-${youtubeVideoId}`,
    videoId: youtubeVideoId,
    youtubeVideoId,
    channelTitle,
    sourceChannelTitle: channelTitle,
    categoryId: Number(track.categoryId || 10),
    platform: 'YouTube',
    style: styles[0] || track.genre || '',
    styles,
    format: formats[0] || 'Track',
    formats,
    artworkUrl,
    thumbnailUrl: artworkUrl,
    embedUrl: `https://www.youtube.com/embed/${youtubeVideoId}`,
    waveform: buildWaveformSeed(youtubeVideoId),
    tags: [...new Set([...(track.tags || []), ...styles, ...formats].map((tag) => String(tag).toLowerCase()))],
  }
}

const RAW_DEMO_TRACKS = [
  {
    ...GOLD_HIDDEN_GEM,
    duration: '4:17',
    views: 123,
    likes: 321,
    comments: 123,
  },
  {
  youtubeVideoId: 'uxVJfO6OD-I',
  title: 'All Cats Are Beautiful',
  artist: 'Alyhas',
  channelTitle: 'Alyhas',
  sourceChannelTitle: 'Alyhas - Topic',
  duration:'6:04',
  durationSeconds: 364,
  publishedAt: '2025-10-14T18:34:33Z',
  genre: 'House',
  vibe: 'Underground',
  format: 'Release',
  tags: [
    'alyhas',
    'liam fattori',
    'funk dat',
    'all cats are beautiful',
    'house',
    'underground',
    'club track',
    'release',
    'topic'
  ],
  views: 123456,
  likes: 124,
  comments: 12,
},
  {
    youtubeVideoId: 'TW9d8vYrVFQ',
    title: 'Sky High',
    artist: 'Elektronomia',
    channelTitle: 'NoCopyrightSounds',
    sourceChannelTitle: 'NoCopyrightSounds',
    duration: '3:58',
    durationSeconds: 238,
    publishedAt: '2016-12-11T00:00:00Z',
    genre: 'Progressive House',
    vibe: 'Peak Time',
    format: 'Release',
    tags: ['progressive house', 'electronic', 'melodic', 'club track', 'release'],
    views: 31500,
    likes: 1800,
    comments: 96,
  },
  {
    youtubeVideoId: 'jK2aIUmmdP4',
    title: 'My Heart',
    artist: 'Different Heaven & EH!DE',
    channelTitle: 'NoCopyrightSounds',
    sourceChannelTitle: 'NoCopyrightSounds',
    duration: '4:27',
    durationSeconds: 267,
    publishedAt: '2013-11-13T00:00:00Z',
    genre: 'Dubstep',
    vibe: 'Heavy',
    format: 'Release',
    tags: ['dubstep', 'bass', 'electronic', 'release', 'club track'],
    views: 46200,
    likes: 2100,
    comments: 130,
  },
  {
    youtubeVideoId: 'J2X5mJ3HDYE',
    title: 'Invincible',
    artist: 'DEAF KEV',
    channelTitle: 'NoCopyrightSounds',
    sourceChannelTitle: 'NoCopyrightSounds',
    duration: '4:33',
    durationSeconds: 273,
    publishedAt: '2015-05-14T00:00:00Z',
    genre: 'Glitch Hop',
    vibe: 'Euphoric',
    format: 'Release',
    tags: ['glitch hop', 'electronic', 'bass', 'release', 'instrumental'],
    views: 19800,
    likes: 1240,
    comments: 81,
  },
]

export const DEMO_TRACKS = attachGemScores(RAW_DEMO_TRACKS.map(normalizeDemoTrack))

export function getDemoTracks() {
  return DEMO_TRACKS.map((track) => ({
    ...track,
    tags: [...track.tags],
    styles: [...track.styles],
    formats: [...track.formats],
    waveform: [...track.waveform],
    scoreBreakdown: { ...track.scoreBreakdown },
    flags: [...(track.flags || [])],
    qualityBadges: [...(track.qualityBadges || [])],
  }))
}

export default DEMO_TRACKS
