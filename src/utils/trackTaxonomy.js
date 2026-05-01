// trackTaxonomy.js

const BAD_GENRE_VALUES = new Set([
  '',
  'youtube',
  'music',
  'video',
  'videos',
  'entertainment',
  'people & blogs',
  'film & animation',
  'news & politics',
  'sports',
  'gaming',
  'education',
  'howto & style',
])

const STYLE_KEYWORDS = [
  { label: 'UKG', terms: ['ukg', 'uk garage', '2-step', '2 step', 'two step', 'garage'] },
  { label: 'Dubstep', terms: ['dubstep', '140', 'deep dubstep'] },
  { label: 'Garage', terms: ['garage', 'speed garage'] },
  { label: 'Deep House', terms: ['deep house', 'house'] },
  { label: 'Breaks', terms: ['breaks', 'breakbeat'] },
  { label: 'Drum & Bass', terms: ['drum and bass', 'dnb', 'jungle'] },
  { label: 'Techno', terms: ['techno', 'minimal techno'] },
  { label: 'Ambient', terms: ['ambient', 'downtempo'] },
  { label: 'R&B', terms: ['r&b', 'rnb', 'neo-soul', 'soulful'] },
  { label: 'Hip-Hop', terms: ['hip hop', 'hip-hop', 'rap', 'boom bap'] },
  { label: 'Electronic', terms: ['electronic', 'electronica', 'idm'] },
]

const FORMAT_KEYWORDS = [
  { label: 'Track', terms: ['official audio', 'original mix', 'extended mix', 'single', 'track'] },
  { label: 'Mix', terms: ['dj set', 'guest mix', 'boiler room', 'radio show', 'mix'] },
  { label: 'Live Set', terms: ['live set', 'live session'] },
  { label: 'Remix', terms: ['remix', 'edit', 'bootleg'] },
]

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function getText(track) {
  return [
    track?.title,
    track?.artist,
    track?.channelTitle,
    track?.sourceChannelTitle,
    track?.description,
    track?.genre,
    track?.vibe,
    ...(Array.isArray(track?.tags) ? track.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function isUsefulGenre(value) {
  const normalized = normalize(value)
  return normalized && !BAD_GENRE_VALUES.has(normalized)
}

export function getTrackStyles(track) {
  const text = getText(track)
  const rawGenre = String(track?.genre ?? '').trim()

  const styles = new Set()

  if (isUsefulGenre(rawGenre)) {
    styles.add(rawGenre)
  }

  STYLE_KEYWORDS.forEach(({ label, terms }) => {
    if (terms.some((term) => text.includes(term))) {
      styles.add(label)
    }
  })

  return [...styles].sort((a, b) => a.localeCompare(b))
}

export function getTrackFormats(track) {
  const text = getText(track)
  const formats = new Set()

  FORMAT_KEYWORDS.forEach(({ label, terms }) => {
    if (terms.some((term) => text.includes(term))) {
      formats.add(label)
    }
  })

  const duration = Number(track?.durationSeconds ?? 0)

  if (duration > 720 && !formats.has('Mix')) {
    formats.add('Long Form')
  }

  if (formats.size === 0) {
    formats.add('Track')
  }

  return [...formats]
}

export function getUsefulStyleOptions(tracks) {
  const counts = new Map()

  tracks.forEach((track) => {
    getTrackStyles(track).forEach((style) => {
      counts.set(style, (counts.get(style) || 0) + 1)
    })
  })

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([style, count]) => ({
      label: `${style} (${count})`,
      value: style,
      count,
    }))
}

export function getUsefulFormatOptions(tracks) {
  const counts = new Map()

  tracks.forEach((track) => {
    getTrackFormats(track).forEach((format) => {
      counts.set(format, (counts.get(format) || 0) + 1)
    })
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([format, count]) => ({
      label: `${format} (${count})`,
      value: format,
      count,
    }))
}