function parseMaxViews(maxViews) {
  if (maxViews === 'any') {
    return Infinity
  }

  const value = Number(maxViews)
  return Number.isFinite(value) ? value : Infinity
}

function parseDurationSeconds(track) {
  if (Number.isFinite(Number(track.durationSeconds))) {
    return Number(track.durationSeconds)
  }

  const parts = String(track.duration || '').split(':').map(Number)
  if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
    return (parts[0] * 60) + parts[1]
  }

  if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  }

  return 0
}

function isLikelyMusicTrack(track) {
  const haystack = `${track.title || ''} ${track.artist || ''} ${track.channelTitle || ''} ${(track.tags || []).join(' ')}`.toLowerCase()
  const musicWords = ['official audio', 'topic', 'mix', 'track', 'dub', 'vinyl', 'ep', 'single', 'remix']
  return musicWords.some((word) => haystack.includes(word)) || Number(track.categoryId) === 10
}

function compareBySort(a, b, sortBy, preferTopicChannels) {
  if (preferTopicChannels) {
    const aTopic = String(a.channelTitle || a.artist || '').endsWith(' - Topic')
    const bTopic = String(b.channelTitle || b.artist || '').endsWith(' - Topic')
    if (aTopic !== bTopic) {
      return aTopic ? -1 : 1
    }
  }

  if (sortBy === 'views') {
    return b.views - a.views
  }

  if (sortBy === 'likes') {
    return b.likes - a.likes
  }

  if (sortBy === 'newest') {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  }

  return b.gemScore - a.gemScore
}

export function filterTracks(tracks, options = {}) {
  const {
    query = '',
    genre = 'all',
    vibe = 'all',
    maxViews = 'any',
    minGemScore = 'any',
    lowViewsOnly = false,
    strictGemsOnly = false,
    strictCrateDiggingMode = false,
    musicTracksOnly = false,
    preferTopicChannels = false,
    hideShorts = false,
    sortBy = 'gemScore',
    activeTags = [],
    digDeeperTags = [],
  } = options

  const normalizedQuery = query.trim().toLowerCase()
  const maxViewsValue = (strictGemsOnly || strictCrateDiggingMode)
    ? Math.min(parseMaxViews(maxViews), 50000)
    : parseMaxViews(maxViews)
  const minGemScoreValue =
    (strictGemsOnly || strictCrateDiggingMode)
      ? Math.max(7, minGemScore === 'any' ? -Infinity : Number.isFinite(Number(minGemScore)) ? Number(minGemScore) : -Infinity)
      : minGemScore === 'any'
        ? -Infinity
        : Number.isFinite(Number(minGemScore))
          ? Number(minGemScore)
          : -Infinity
  const minQualityScore = strictCrateDiggingMode ? 3 : -Infinity
  const sortByValue = (strictGemsOnly || strictCrateDiggingMode) ? 'gemScore' : sortBy

  return tracks
    .filter((track) => {
      if (!normalizedQuery) {
        return true
      }

      const searchableFields = [
        track.title,
        track.artist,
        track.genre,
        track.vibe,
        ...(track.tags || []),
      ]
        .join(' ')
        .toLowerCase()

      return searchableFields.includes(normalizedQuery)
    })
    .filter((track) => genre === 'all' || track.genre === genre)
    .filter((track) => vibe === 'all' || track.vibe === vibe)
    .filter((track) => !musicTracksOnly || isLikelyMusicTrack(track))
    .filter((track) => !hideShorts || parseDurationSeconds(track) >= 90)
    .filter((track) => track.views <= maxViewsValue)
    .filter((track) => !lowViewsOnly || track.views <= 20000)
    .filter((track) => track.gemScore >= minGemScoreValue)
    .filter((track) => Number(track.qualityScore ?? track.trackQualityScore ?? 0) >= minQualityScore)
    .filter((track) =>
      activeTags.every((tag) => track.tags.map((item) => item.toLowerCase()).includes(tag.toLowerCase())),
    )
    .filter((track) => {
      if (!digDeeperTags.length) {
        return true
      }

      const tagSet = new Set(track.tags.map((tag) => tag.toLowerCase()))
      return digDeeperTags.some((tag) => tagSet.has(tag.toLowerCase()))
    })
    .sort((a, b) => compareBySort(a, b, sortByValue, preferTopicChannels))
}
