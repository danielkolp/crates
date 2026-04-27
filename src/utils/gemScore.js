// Professional deterministic music discovery scorer
// Goal: rank underground / high-quality music tracks while filtering Shorts, spam, reactions, kids content,
// low-confidence noise, and fake engagement.
//
// This is NOT a machine-learning recommender. It is a production-style heuristic scorer designed to be:
// - explainable
// - robust against bad metadata
// - confidence-aware
// - compatible with YouTube API-style objects
// - easy to tune later using real user feedback

const DEFAULT_PROFILE = Object.freeze({
  weights: {
    engagement: 0.28,
    authenticity: 0.22,
    undergroundFit: 0.18,
    velocity: 0.12,
    stayingPower: 0.1,
    confidence: 0.1,
  },

  qualityWeights: {
    authenticity: 0.34,
    engagement: 0.24,
    confidence: 0.16,
    stayingPower: 0.14,
    undergroundFit: 0.12,
  },

  priors: {
    likeRate: 0.025,
    commentRate: 0.0012,
    viewSampleSize: 3000,
    commentSampleSize: 5000,
  },

  discovery: {
    idealUndergroundViewsLow: 1200,
    idealUndergroundViewsHigh: 75000,
    tooFewViews: 80,
    tooManyViews: 1500000,
    velocitySaturationViewsPerDay: 3500,
  },

  penalties: {
    spamMultiplier: 0.58,
    nonMusicCap: 4.2,
    likelyShortCap: 3.4,
    riskyMetadataCap: 5.2,
  },
})

const MUSIC_INTENT_TERMS = [
  'official audio',
  'provided to youtube',
  'original mix',
  'extended mix',
  'radio edit',
  'premiere',
  'single',
  'ep',
  'track',
  'remix',
  'dub',
  'vinyl',
  'club mix',
  'instrumental',
]

const NICHE_TERMS = [
  'underground',
  'white label',
  'dub',
  'ukg',
  'uk garage',
  '2-step',
  '2 step',
  'garage',
  'deep house',
  'minimal',
  'breaks',
  'bassline',
  'raw',
  'edit',
  'bootleg',
  'vinyl',
  'lofi house',
  'speed garage',
]

const MIX_TERMS = [
  'mix',
  'dj set',
  'live set',
  'boiler room',
  'session',
  'radio show',
  'guest mix',
]

const SHORTS_TERMS = ['#shorts', 'youtube shorts', 'shorts']
const REACTION_TERMS = ['reaction', 'reacts to', 'first time hearing']
const NEWS_TERMS = ['news', 'breaking', 'headline', 'press conference']
const KIDS_TERMS = ['kids', 'nursery rhyme', 'cocomelon', 'baby shark', 'children songs']
const LYRIC_TERMS = ['lyric video', 'lyrics video', 'lyrics']
const COVER_TERMS = ['cover', 'karaoke', 'singing cover']
const PLAYLIST_TERMS = ['playlist', 'compilation', 'best of', 'top 100']
const PROMO_TERMS = [
  'subscribe',
  'follow me',
  'link in bio',
  'all my songs in bio',
  'viral',
  'trending',
  'challenge',
  'tiktok',
]

function clamp(value, min, max) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) return min
  return Math.min(max, Math.max(min, normalized))
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function safeNumber(value, fallback = 0) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function roundScore(value) {
  return Number(clamp(value, 0, 10).toFixed(1))
}

function roundRate(value) {
  return Number(safeNumber(value, 0).toFixed(6))
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().trim()
}

function unique(array) {
  return [...new Set(array)]
}

function containsAny(text, terms) {
  const normalized = normalizeText(text)
  return terms.some((term) => normalized.includes(term))
}

function uniqueMatches(text, terms) {
  const normalized = normalizeText(text)
  return terms.filter((term) => normalized.includes(term))
}

function countHashtags(text = '') {
  return (String(text).match(/#[\w-]+/g) || []).length
}

function countPromoWords(text = '') {
  const normalized = normalizeText(text)
  return PROMO_TERMS.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0)
}

function isEmojiHeavy(text = '') {
  const value = String(text || '')
  const emojiLike = (value.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu) || []).length
  const alnum = (value.match(/[a-z0-9]/gi) || []).length
  return emojiLike > 4 && emojiLike > alnum
}

function hasValidDate(value) {
  return Number.isFinite(new Date(value).getTime())
}

function getTrackAgeDays(publishedAt) {
  if (!hasValidDate(publishedAt)) return 0

  const publishedAtMs = new Date(publishedAt).getTime()
  const nowMs = Date.now()

  return Math.max(0, Math.floor((nowMs - publishedAtMs) / 86_400_000))
}

function parseIsoDuration(duration = '') {
  const value = String(duration || '').trim()

  const match = value.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!match) return null

  const hours = safeNumber(match[1], 0)
  const minutes = safeNumber(match[2], 0)
  const seconds = safeNumber(match[3], 0)

  return (hours * 3600) + (minutes * 60) + seconds
}

function parseDurationToSeconds(durationText = '', durationSeconds = null) {
  const explicitSeconds = safeNumber(durationSeconds, NaN)
  if (Number.isFinite(explicitSeconds) && explicitSeconds >= 0) {
    return explicitSeconds
  }

  const isoSeconds = parseIsoDuration(durationText)
  if (Number.isFinite(isoSeconds)) {
    return isoSeconds
  }

  const parts = String(durationText || '')
    .split(':')
    .map((part) => Number(part))

  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return (parts[0] * 60) + parts[1]
  }

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  }

  return 0
}

function logScaledScore(value, saturationValue) {
  const normalized = Math.max(safeNumber(value, 0), 0)
  const saturation = Math.max(safeNumber(saturationValue, 1), 1)

  if (normalized <= 0) return 0

  return clamp((Math.log10(normalized + 1) / Math.log10(saturation + 1)) * 10, 0, 10)
}

function logRangeScore(value, { tooLow, idealLow, idealHigh, tooHigh }) {
  const normalized = Math.max(safeNumber(value, 0), 0)

  if (normalized <= 0) return 0

  const x = Math.log10(normalized + 1)
  const a = Math.log10(tooLow + 1)
  const b = Math.log10(idealLow + 1)
  const c = Math.log10(idealHigh + 1)
  const d = Math.log10(tooHigh + 1)

  if (x <= a) {
    return clamp((x / Math.max(a, 0.0001)) * 3, 0, 3)
  }

  if (x < b) {
    return 3 + (((x - a) / Math.max(b - a, 0.0001)) * 5)
  }

  if (x <= c) {
    return 8 + (1 - Math.abs((x - ((b + c) / 2)) / Math.max((c - b) / 2, 0.0001))) * 2
  }

  if (x < d) {
    return 8 - (((x - c) / Math.max(d - c, 0.0001)) * 7.5)
  }

  return 0.5
}

function scoreRateAgainstBenchmarks(rate, benchmarks) {
  const value = Math.max(safeNumber(rate, 0), 0)

  const {
    weak,
    decent,
    strong,
    excellent,
  } = benchmarks

  if (value <= 0) return 0
  if (value < weak) return 1.5
  if (value < decent) return 1.5 + (((value - weak) / (decent - weak)) * 3)
  if (value < strong) return 4.5 + (((value - decent) / (strong - decent)) * 3)
  if (value < excellent) return 7.5 + (((value - strong) / (excellent - strong)) * 2)
  return 10
}

function bayesianRate(successes, trials, priorRate, priorSampleSize) {
  const safeSuccesses = Math.max(safeNumber(successes, 0), 0)
  const safeTrials = Math.max(safeNumber(trials, 0), 0)
  const safePriorRate = clamp(safeNumber(priorRate, 0), 0, 1)
  const safePriorSampleSize = Math.max(safeNumber(priorSampleSize, 1), 1)

  return (safeSuccesses + (safePriorRate * safePriorSampleSize)) / (safeTrials + safePriorSampleSize)
}

function wilsonLowerBound(successes, trials, z = 1.28155) {
  const n = Math.max(safeNumber(trials, 0), 0)
  const positive = Math.max(safeNumber(successes, 0), 0)

  if (n <= 0) return 0

  const p = clamp(positive / n, 0, 1)
  const z2 = z * z

  const denominator = 1 + (z2 / n)
  const centre = p + (z2 / (2 * n))
  const margin = z * Math.sqrt(((p * (1 - p)) + (z2 / (4 * n))) / n)

  return clamp((centre - margin) / denominator, 0, 1)
}

function getTrackStats(track) {
  const views = Math.max(safeNumber(track?.views ?? track?.viewCount, 0), 0)
  const likes = Math.max(safeNumber(track?.likes ?? track?.likeCount, 0), 0)
  const comments = Math.max(safeNumber(track?.comments ?? track?.commentCount, 0), 0)

  const ageDays = getTrackAgeDays(track?.publishedAt)
  const durationSeconds = parseDurationToSeconds(track?.duration, track?.durationSeconds)

  return {
    views,
    likes,
    comments,
    interactions: likes + comments,
    ageDays,
    durationSeconds,
    viewsPerDay: ageDays > 0 ? views / ageDays : views,
    likesPerDay: ageDays > 0 ? likes / ageDays : likes,
    commentsPerDay: ageDays > 0 ? comments / ageDays : comments,
  }
}

function getTextBundle(track) {
  const title = String(track?.title || '')
  const description = String(track?.description || '')
  const channelTitle = String(track?.channelTitle || track?.artist || '')
  const tags = Array.isArray(track?.tags) ? track.tags.map(String) : []

  const fullText = `${title} ${description} ${channelTitle} ${tags.join(' ')}`
  const musicText = `${title} ${description} ${tags.join(' ')}`

  return {
    title,
    description,
    channelTitle,
    tags,
    fullText,
    musicText,
    normalizedTitle: normalizeText(title),
    normalizedChannelTitle: normalizeText(channelTitle),
  }
}

function scoreMusicAuthenticity(track, stats) {
  const {
    title,
    description,
    channelTitle,
    musicText,
    fullText,
    normalizedChannelTitle,
  } = getTextBundle(track)

  const categoryId = String(track?.categoryId ?? '')
  const flags = []
  let score = 2.8

  const hasArtistTitlePattern =
    /\S+\s[-–—]\s\S+/.test(title) &&
    !containsAny(title, REACTION_TERMS) &&
    !containsAny(title, NEWS_TERMS)

  if (hasArtistTitlePattern) {
    score += 2.0
    flags.push('artist-title-pattern')
  }

  if (normalizedChannelTitle.endsWith(' - topic')) {
    score += 1.8
    flags.push('topic-channel')
  }

  if (categoryId === '10') {
    score += 1.3
    flags.push('youtube-music-category')
  }

  if (stats.durationSeconds >= 120 && stats.durationSeconds <= 540) {
    score += 1.5
    flags.push('track-length')
  } else if (stats.durationSeconds >= 90 && stats.durationSeconds <= 720) {
    score += 0.8
    flags.push('acceptable-audio-length')
  } else if (stats.durationSeconds > 720) {
    if (containsAny(fullText, MIX_TERMS)) {
      score += 0.6
      flags.push('long-mix-format')
    } else {
      score -= 1.3
      flags.push('long-non-track-format')
    }
  } else if (stats.durationSeconds > 0) {
    score -= 2.4
    flags.push('short-duration-risk')
  }

  const intentMatches = uniqueMatches(musicText, MUSIC_INTENT_TERMS)
  if (intentMatches.length > 0) {
    score += Math.min(1.8, intentMatches.length * 0.42)
    flags.push('music-intent-metadata')
  }

  const nicheMatches = uniqueMatches(musicText, NICHE_TERMS)
  if (nicheMatches.length > 0) {
    score += Math.min(2.2, nicheMatches.length * 0.5)
    flags.push('niche-genre-signals')
  }

  if (containsAny(fullText, LYRIC_TERMS)) {
    const acceptableLyricUpload = containsAny(fullText, ['official audio', 'provided to youtube'])
    score -= acceptableLyricUpload ? 0.4 : 1.0
    flags.push('lyric-format')
  }

  if (containsAny(fullText, COVER_TERMS)) {
    score -= 1.2
    flags.push('cover-format')
  }

  if (containsAny(fullText, PLAYLIST_TERMS)) {
    const acceptableMix = containsAny(fullText, MIX_TERMS)
    score -= acceptableMix ? 0.4 : 1.4
    flags.push('playlist-format')
  }

  const isLikelyMusic =
    score >= 5.5 ||
    normalizedChannelTitle.endsWith(' - topic') ||
    categoryId === '10' ||
    hasArtistTitlePattern

  return {
    score: roundScore(score),
    isLikelyMusic,
    flags,
  }
}

function scoreSpamRisk(track, stats) {
  const {
    title,
    description,
    fullText,
  } = getTextBundle(track)

  const flags = []
  let risk = 0

  if (stats.durationSeconds > 0 && stats.durationSeconds < 70) {
    risk += 4.2
    flags.push('short-form-duration')
  } else if (stats.durationSeconds > 0 && stats.durationSeconds < 90) {
    risk += 2.5
    flags.push('borderline-short-duration')
  }

  if (containsAny(fullText, SHORTS_TERMS)) {
    risk += 4.0
    flags.push('shorts-keyword')
  }

  if (containsAny(fullText, REACTION_TERMS)) {
    risk += 3.6
    flags.push('reaction-content')
  }

  if (containsAny(fullText, NEWS_TERMS)) {
    risk += 3.0
    flags.push('news-content')
  }

  if (containsAny(fullText, KIDS_TERMS)) {
    risk += 4.0
    flags.push('kids-content')
  }

  if (containsAny(fullText, COVER_TERMS)) {
    risk += 2.1
    flags.push('cover-content')
  }

  if (containsAny(fullText, PLAYLIST_TERMS) && !containsAny(fullText, MIX_TERMS)) {
    risk += 2.4
    flags.push('playlist-or-compilation')
  }

  const titleHashtags = countHashtags(title)
  if (titleHashtags > 2) {
    risk += Math.min((titleHashtags - 2) * 0.9, 3.2)
    flags.push('title-hashtag-spam')
  }

  const descriptionHashtags = countHashtags(description)
  if (descriptionHashtags > 10) {
    risk += Math.min((descriptionHashtags - 10) * 0.22, 2.4)
    flags.push('description-hashtag-spam')
  }

  const promoWords = countPromoWords(`${title} ${description}`)
  if (promoWords >= 3) {
    risk += 2.2
    flags.push('promo-heavy-copy')
  } else if (promoWords === 2) {
    risk += 1.1
    flags.push('light-promo-copy')
  }

  if (isEmojiHeavy(title)) {
    risk += 1.5
    flags.push('emoji-heavy-title')
  }

  if (stats.ageDays < 2) {
    risk += 1.7
    flags.push('very-new-upload')
  } else if (stats.ageDays < 10) {
    risk += 0.8
    flags.push('new-upload')
  }

  if (stats.views <= 0) {
    risk += 3.0
    flags.push('missing-view-count')
  }

  if (stats.views > 0 && stats.likes > stats.views) {
    risk += 3.0
    flags.push('impossible-like-count')
  }

  if (stats.views >= 50 && stats.comments > stats.views * 0.3) {
    risk += 2.3
    flags.push('suspicious-comment-rate')
  }

  if (stats.views > 500 && stats.likes === 0 && stats.comments === 0 && stats.ageDays > 30) {
    risk += 1.8
    flags.push('no-visible-engagement')
  }

  if (!hasValidDate(track?.publishedAt)) {
    risk += 1.5
    flags.push('missing-published-at')
  }

  if (stats.durationSeconds <= 0) {
    risk += 0.8
    flags.push('missing-duration')
  }

  return {
    score: roundScore(risk),
    flags,
  }
}

function scoreEngagement(track, stats, profile) {
  const rawLikeRate = stats.views > 0 ? stats.likes / stats.views : 0
  const rawCommentRate = stats.views > 0 ? stats.comments / stats.views : 0

  const smoothedLikeRate = bayesianRate(
    stats.likes,
    stats.views,
    profile.priors.likeRate,
    profile.priors.viewSampleSize,
  )

  const smoothedCommentRate = bayesianRate(
    stats.comments,
    stats.views,
    profile.priors.commentRate,
    profile.priors.commentSampleSize,
  )

  const conservativeLikeRate = wilsonLowerBound(stats.likes, stats.views)
  const conservativeCommentRate = wilsonLowerBound(stats.comments, stats.views)

  const likeRateForScoring = Math.max(smoothedLikeRate * 0.72, conservativeLikeRate)
  const commentRateForScoring = Math.max(smoothedCommentRate * 0.72, conservativeCommentRate)

  const likeRateScore = roundScore(scoreRateAgainstBenchmarks(likeRateForScoring, {
    weak: 0.005,
    decent: 0.015,
    strong: 0.035,
    excellent: 0.07,
  }))

  const commentRateScore = roundScore(scoreRateAgainstBenchmarks(commentRateForScoring, {
    weak: 0.00025,
    decent: 0.0009,
    strong: 0.0028,
    excellent: 0.007,
  }))

  const interactionDepthScore = roundScore(logScaledScore(stats.interactions, 3500))

  const score = roundScore(
    (likeRateScore * 0.56) +
    (commentRateScore * 0.28) +
    (interactionDepthScore * 0.16),
  )

  return {
    score,
    likeRateScore,
    commentRateScore,
    interactionDepthScore,
    rawLikeRate: roundRate(rawLikeRate),
    rawCommentRate: roundRate(rawCommentRate),
    smoothedLikeRate: roundRate(smoothedLikeRate),
    smoothedCommentRate: roundRate(smoothedCommentRate),
  }
}

function scoreUndergroundFit(track, stats, profile) {
  const baseFit = logRangeScore(stats.views, {
    tooLow: profile.discovery.tooFewViews,
    idealLow: profile.discovery.idealUndergroundViewsLow,
    idealHigh: profile.discovery.idealUndergroundViewsHigh,
    tooHigh: profile.discovery.tooManyViews,
  })

  const subscriberCount = Math.max(
    safeNumber(track?.channelSubscriberCount ?? track?.subscriberCount, 0),
    0,
  )

  let channelAdjustedFit = baseFit
  const flags = []

  if (subscriberCount > 0 && stats.views > 0) {
    const viewToSubscriberRatio = stats.views / subscriberCount

    if (subscriberCount < 5000 && stats.views >= 1000) {
      channelAdjustedFit += 0.8
      flags.push('small-channel-breakout')
    }

    if (viewToSubscriberRatio >= 0.4 && subscriberCount < 50000) {
      channelAdjustedFit += 0.8
      flags.push('strong-relative-channel-performance')
    }

    if (subscriberCount > 500000 && stats.views < subscriberCount * 0.01) {
      channelAdjustedFit -= 1.0
      flags.push('large-channel-underperformer')
    }
  }

  return {
    score: roundScore(channelAdjustedFit),
    flags,
  }
}

function scoreVelocity(stats, profile) {
  let score = logScaledScore(
    stats.viewsPerDay,
    profile.discovery.velocitySaturationViewsPerDay,
  )

  const flags = []

  if (stats.ageDays < 2) {
    score = Math.min(score, 5.5)
    flags.push('velocity-too-early')
  }

  if (stats.ageDays > 365 && stats.viewsPerDay < 5) {
    score *= 0.7
    flags.push('slow-current-velocity')
  }

  if (stats.viewsPerDay >= 100 && stats.views <= 100000) {
    flags.push('healthy-organic-velocity')
  }

  return {
    score: roundScore(score),
    viewsPerDay: Number(stats.viewsPerDay.toFixed(2)),
    flags,
  }
}

function scoreStayingPower(stats, engagementScore) {
  let ageFoundation = logRangeScore(stats.ageDays, {
    tooLow: 2,
    idealLow: 90,
    idealHigh: 1095,
    tooHigh: 3650,
  })

  if (stats.ageDays < 30) {
    ageFoundation = Math.min(ageFoundation, 5)
  }

  const score = roundScore((ageFoundation * 0.68) + (engagementScore * 0.32))

  const flags = []

  if (stats.ageDays >= 180 && engagementScore >= 6.5) {
    flags.push('proven-staying-power')
  }

  if (stats.ageDays < 14) {
    flags.push('too-new-for-staying-power')
  }

  return {
    score,
    flags,
  }
}

function scoreConfidence(track, stats) {
  const flags = []

  const viewConfidence = logScaledScore(stats.views, 150000)
  const interactionConfidence = logScaledScore(stats.interactions, 4000)
  const ageConfidence = hasValidDate(track?.publishedAt)
    ? clamp((stats.ageDays / 120) * 10, 0, 10)
    : 0

  let completeness = 10

  if (stats.views <= 0) completeness -= 4
  if (stats.likes <= 0) completeness -= 1.3
  if (stats.comments <= 0) completeness -= 0.8
  if (!hasValidDate(track?.publishedAt)) completeness -= 2
  if (stats.durationSeconds <= 0) completeness -= 1.2
  if (!track?.title) completeness -= 1.5

  let score =
    (viewConfidence * 0.42) +
    (interactionConfidence * 0.25) +
    (ageConfidence * 0.21) +
    (clamp(completeness, 0, 10) * 0.12)

  if (stats.views < 250 && stats.interactions < 30) {
    score = Math.min(score, 3.1)
    flags.push('tiny-sample-size')
  }

  if (stats.views < 1000 && stats.ageDays < 14) {
    score = Math.min(score, 3.7)
    flags.push('early-low-volume-signal')
  }

  if (stats.views < 100 && stats.ageDays > 180) {
    score = Math.min(score, 3.4)
    flags.push('old-low-volume-track')
  }

  if (score < 4) {
    flags.push('low-confidence')
  }

  return {
    score: roundScore(score),
    flags,
  }
}

function weightedScore(parts, weights) {
  return Object.entries(weights).reduce((total, [key, weight]) => {
    return total + (safeNumber(parts[key], 0) * weight)
  }, 0)
}

function buildGemReason(components, flags) {
  const reasons = []

  if (components.spamRisk >= 7) {
    reasons.push('heavy spam/non-track risk')
  }

  if (flags.includes('short-form-duration') || flags.includes('shorts-keyword')) {
    reasons.push('likely short-form upload')
  }

  if (components.engagement >= 7) {
    reasons.push('strong engagement quality')
  }

  if (components.authenticity >= 7) {
    reasons.push('clear music-track metadata')
  }

  if (components.undergroundFit >= 7) {
    reasons.push('strong underground discovery fit')
  }

  if (components.velocity >= 7) {
    reasons.push('healthy view velocity')
  }

  if (components.stayingPower >= 7) {
    reasons.push('proven staying power')
  }

  if (components.confidence < 4) {
    reasons.push('limited statistical confidence')
  }

  return reasons.length > 0
    ? reasons.slice(0, 2).join('; ')
    : 'Balanced music, engagement, and discovery signals'
}

function getQualityBadges({ components, flags, gemScore }) {
  const badges = []

  if (components.authenticity >= 7) badges.push('Music Metadata')
  if (components.engagement >= 7.5) badges.push('Strong Engagement')
  if (components.undergroundFit >= 7 && gemScore >= 7) badges.push('Underground Pick')
  if (components.velocity >= 7) badges.push('Growing Fast')
  if (components.stayingPower >= 7) badges.push('Staying Power')
  if (components.confidence >= 7) badges.push('Reliable Stats')
  if (components.spamRisk >= 5) badges.push('Risky Metadata')
  if (flags.includes('short-form-duration') || flags.includes('shorts-keyword')) badges.push('Likely Short')

  return badges.slice(0, 4)
}

function applyCaps(score, { authenticity, spamRisk, flags }, profile) {
  let cappedScore = score

  if (flags.includes('short-form-duration') || flags.includes('shorts-keyword')) {
    cappedScore = Math.min(cappedScore, profile.penalties.likelyShortCap)
  }

  if (authenticity < 4.5) {
    cappedScore = Math.min(cappedScore, profile.penalties.nonMusicCap)
  }

  if (spamRisk >= 7 && authenticity < 6) {
    cappedScore = Math.min(cappedScore, profile.penalties.riskyMetadataCap)
  }

  return cappedScore
}

function mergeProfile(overrides = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...overrides,
    weights: {
      ...DEFAULT_PROFILE.weights,
      ...(overrides.weights || {}),
    },
    qualityWeights: {
      ...DEFAULT_PROFILE.qualityWeights,
      ...(overrides.qualityWeights || {}),
    },
    priors: {
      ...DEFAULT_PROFILE.priors,
      ...(overrides.priors || {}),
    },
    discovery: {
      ...DEFAULT_PROFILE.discovery,
      ...(overrides.discovery || {}),
    },
    penalties: {
      ...DEFAULT_PROFILE.penalties,
      ...(overrides.penalties || {}),
    },
  }
}

function evaluateGemScore(track, profileOverrides = {}) {
  const profile = mergeProfile(profileOverrides)

  const stats = getTrackStats(track)

  const engagement = scoreEngagement(track, stats, profile)
  const authenticity = scoreMusicAuthenticity(track, stats)
  const spamRisk = scoreSpamRisk(track, stats)
  const undergroundFit = scoreUndergroundFit(track, stats, profile)
  const velocity = scoreVelocity(stats, profile)
  const stayingPower = scoreStayingPower(stats, engagement.score)
  const confidence = scoreConfidence(track, stats)

  const flags = unique([
    ...authenticity.flags,
    ...spamRisk.flags,
    ...undergroundFit.flags,
    ...velocity.flags,
    ...stayingPower.flags,
    ...confidence.flags,
  ])

  const components = {
    engagement: engagement.score,
    authenticity: authenticity.score,
    undergroundFit: undergroundFit.score,
    velocity: velocity.score,
    stayingPower: stayingPower.score,
    confidence: confidence.score,
    spamRisk: spamRisk.score,
  }

  const baseDiscoveryScore = weightedScore(components, profile.weights)
  const penaltyApplied = spamRisk.score * profile.penalties.spamMultiplier

  let gemScore = baseDiscoveryScore - penaltyApplied
  gemScore = applyCaps(gemScore, {
    authenticity: authenticity.score,
    spamRisk: spamRisk.score,
    flags,
  }, profile)

  const qualityBase = weightedScore({
    authenticity: authenticity.score,
    engagement: engagement.score,
    confidence: confidence.score,
    stayingPower: stayingPower.score,
    undergroundFit: undergroundFit.score,
  }, profile.qualityWeights)

  let qualityScore = qualityBase - (spamRisk.score * 0.38)
  qualityScore = applyCaps(qualityScore, {
    authenticity: authenticity.score,
    spamRisk: spamRisk.score,
    flags,
  }, profile)

  const roundedGemScore = roundScore(gemScore)
  const roundedQualityScore = roundScore(qualityScore)

  const scoreBreakdown = {
    engagementScore: engagement.score,
    likeRateScore: engagement.likeRateScore,
    commentRateScore: engagement.commentRateScore,
    interactionDepthScore: engagement.interactionDepthScore,

    musicAuthenticityScore: authenticity.score,
    undergroundFitScore: undergroundFit.score,
    velocityScore: velocity.score,
    stayingPowerScore: stayingPower.score,
    confidenceScore: confidence.score,
    spamRiskScore: spamRisk.score,

    rawLikeRate: engagement.rawLikeRate,
    rawCommentRate: engagement.rawCommentRate,
    smoothedLikeRate: engagement.smoothedLikeRate,
    smoothedCommentRate: engagement.smoothedCommentRate,

    viewsPerDay: velocity.viewsPerDay,

    weightedBaseScore: Number(baseDiscoveryScore.toFixed(2)),
    penaltyApplied: Number(penaltyApplied.toFixed(2)),
    finalScore: roundedGemScore,
  }

  return {
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,

    likeRate: engagement.rawLikeRate,
    commentRate: engagement.rawCommentRate,
    smoothedLikeRate: engagement.smoothedLikeRate,
    smoothedCommentRate: engagement.smoothedCommentRate,

    ageDays: stats.ageDays,
    durationSeconds: stats.durationSeconds,
    viewsPerDay: velocity.viewsPerDay,

    qualityScore: roundedQualityScore,
    gemScore: roundedGemScore,
    trackQualityScore: roundedQualityScore,

    isLikelyMusic: authenticity.isLikelyMusic,
    gemReason: buildGemReason(components, flags),
    scoreBreakdown,
    flags,
    qualityBadges: getQualityBadges({
      components,
      flags,
      gemScore: roundedGemScore,
    }),
  }
}

export function getTrackQualityScore(track, profileOverrides = {}) {
  return evaluateGemScore(track, profileOverrides).qualityScore
}

export function getTrackGemScore(track, profileOverrides = {}) {
  return evaluateGemScore(track, profileOverrides).gemScore
}

export function normalizeGemScore(rawScore, minScore = 0, maxScore = 10) {
  const rawValue = safeNumber(rawScore, 0)
  const minValue = safeNumber(minScore, 0)
  const maxValue = safeNumber(maxScore, 10)

  if (maxValue <= minValue) {
    return roundScore(rawValue)
  }

  const normalized = ((rawValue - minValue) / (maxValue - minValue)) * 10
  return roundScore(normalized)
}

export function attachGemScores(tracks, profileOverrides = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return []
  }

  return tracks.map((track) => {
    const scored = evaluateGemScore(track, profileOverrides)

    return {
      ...track,

      views: scored.views,
      likes: scored.likes,
      comments: scored.comments,

      likeRate: scored.likeRate,
      commentRate: scored.commentRate,
      smoothedLikeRate: scored.smoothedLikeRate,
      smoothedCommentRate: scored.smoothedCommentRate,

      ageDays: scored.ageDays,
      durationSeconds: scored.durationSeconds,
      viewsPerDay: scored.viewsPerDay,

      qualityScore: scored.qualityScore,
      trackQualityScore: scored.trackQualityScore,
      gemScore: scored.gemScore,
      gemReason: scored.gemReason,

      isLikelyMusic: scored.isLikelyMusic,
      scoreBreakdown: scored.scoreBreakdown,
      flags: scored.flags,
      qualityBadges: scored.qualityBadges,
    }
  })
}

export {
  evaluateGemScore,
  scoreEngagement,
  scoreMusicAuthenticity,
  scoreSpamRisk,
  scoreUndergroundFit,
  scoreVelocity,
  scoreStayingPower,
  scoreConfidence,
  clamp,
  safeNumber,
  roundScore,
  parseDurationToSeconds,
  getTrackAgeDays,
}