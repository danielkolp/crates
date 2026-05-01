import { runGoldHiddenGemRegression } from '../src/utils/scoringRegression.js'

const result = runGoldHiddenGemRegression({ throwOnFail: true })

console.log(JSON.stringify({
  passed: result.passed,
  gold: {
    gemScore: result.gold.gemScore,
    qualityScore: result.gold.qualityScore,
    musicLikelihood: result.musicLikelihood.score,
  },
  ranked: result.ranked,
}, null, 2))
