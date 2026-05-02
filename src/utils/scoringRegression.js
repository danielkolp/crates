// scoringRegression.js - Regression test for music discovery scoring system
// This test validates that the GOLD_HIDDEN_GEM track scores highly on music likelihood, quality, and gem score, and ranks above control tracks. It also checks that safe release terms do not cause false negatives. Failures are collected and can be thrown as an error if desired.


import { GOLD_HIDDEN_GEM } from '../data/goldHiddenGem.js'
import { attachGemScores } from './gemScore.js'
import {
  filterTracks,
  getMusicLikelihoodDetails,
  isLikelyMusicTrack,
  parseDurationSeconds,
} from './filterTracks.js'

const NON_MUSIC_CONTROL = {
  id: 'control-tutorial',
  title: 'How to Make UK Garage in Ableton - Mixing Tutorial',
  artist: 'Production Lessons',
  channelTitle: 'Production Lessons',
  duration: 'PT11M12S',
  durationSeconds: 672,
  publishedAt: '2024-01-01T00:00:00Z',
  categoryId: '10',
  genre: 'UK Garage',
  tags: ['ableton', 'tutorial', 'mixing tutorial', 'uk garage'],
  views: '14.4K',
  likes: '1.2K',
  comments: 84,
}

const WEAK_MUSIC_CONTROL = {
  id: 'control-weak-track',
  title: 'New Song 2024 #viral #challenge',
  artist: 'Unknown Artist',
  channelTitle: 'Unknown Artist',
  duration: 'PT2M44S',
  durationSeconds: 164,
  publishedAt: '2024-01-01T00:00:00Z',
  categoryId: '10',
  genre: 'Pop',
  tags: ['viral', 'challenge', 'subscribe'],
  views: '1.2M',
  likes: 0,
  comments: 0,
}

const SAFE_RELEASE_TERMS = ['mix', 'dancefloor mix', 'single', 'EP', 'release', 'compilation']

function assertCheck(condition, message, failures) {
  if (!condition) {
    failures.push(message)
  }
}

export function runGoldHiddenGemRegression({ throwOnFail = false } = {}) {
  const failures = []
  const scored = attachGemScores([
    GOLD_HIDDEN_GEM,
    NON_MUSIC_CONTROL,
    WEAK_MUSIC_CONTROL,
  ])
  const gold = scored.find((track) => track.videoId === GOLD_HIDDEN_GEM.videoId)
  const musicLikelihood = getMusicLikelihoodDetails(GOLD_HIDDEN_GEM)
  const ranked = filterTracks(scored, {
    musicTracksOnly: true,
    hideShorts: true,
    preferTopicChannels: true,
    sortBy: 'gemScore',
  })

  assertCheck(Boolean(gold), 'gold fixture was not scored', failures)
  assertCheck(isLikelyMusicTrack(GOLD_HIDDEN_GEM), 'gold fixture should be likely music', failures)
  assertCheck(parseDurationSeconds(GOLD_HIDDEN_GEM) === 257, 'gold ISO duration should parse to 257 seconds', failures)
  assertCheck(musicLikelihood.score >= 8, `gold music likelihood too low: ${musicLikelihood.score}`, failures)
  assertCheck(Number(gold?.qualityScore || 0) >= 7, `gold qualityScore too low: ${gold?.qualityScore}`, failures)
  assertCheck(Number(gold?.gemScore || 0) >= 7.5, `gold gemScore too low: ${gold?.gemScore}`, failures)
  assertCheck(ranked[0]?.videoId === GOLD_HIDDEN_GEM.videoId, 'gold fixture should rank above control tracks', failures)

  SAFE_RELEASE_TERMS.forEach((term) => {
    const variant = {
      ...GOLD_HIDDEN_GEM,
      title: `Overnight (${term})`,
      tags: [...GOLD_HIDDEN_GEM.tags, term],
    }

    assertCheck(isLikelyMusicTrack(variant), `safe release term rejected: ${term}`, failures)
  })

  const result = {
    passed: failures.length === 0,
    failures,
    gold,
    musicLikelihood,
    ranked: ranked.map((track) => ({
      title: track.title,
      gemScore: track.gemScore,
      qualityScore: track.qualityScore,
    })),
  }

  if (throwOnFail && failures.length > 0) {
    throw new Error(failures.join('\n'))
  }

  return result
}
