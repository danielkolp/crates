import { useMemo, useState } from 'react'
import { BsCheckLg, BsHeartFill, BsPauseFill, BsPlayFill, BsShareFill } from 'react-icons/bs'
import ShareModal from './ShareModal'
import { getArtworkCandidates } from '../hooks/useArtworkTheme'
import { getTrackSharePayload } from '../utils/share'

const TRAILING_WRAPPED_META_PATTERN =
  /\s*(?:\[([^()[\]{}]{2,96})\]|\(([^()[\]{}]{2,96})\)|\{([^()[\]{}]{2,96})\})\s*$/
const META_KEYWORD_PATTERN =
  /\b(?:official|audio|video|visuali[sz]er|lyrics?|premiere|hd|hq|4k|records?|recordings?|label|topic|provided to youtube|released?|full track|mix(?:es)?|version|extended|club|dub|radio edit|vinyl rip|remix|remaster(?:ed)?|rework|refix|bootleg|catalogue?|cat\.?\s*no)\b/i
const CATALOG_CODE_PATTERN = /\b(?:[A-Z]{2,5}|[A-Z]{2,}[-\s]?\d{2,}[A-Z0-9-]*)\b/
const TRAILING_CATALOG_CODE_PATTERN = /\s+([A-Z]{2,5}|[A-Z]{2,}[-\s]?\d{2,}[A-Z0-9-]*)$/
const FEATURE_PATTERN = /\b(?:feat\.?|ft\.?|featuring|with)\b/i
const META_SEPARATOR_PATTERN = /\s+(?:\||\/\/|::|--|\u2013|\u2014)\s+/
const PRESERVED_META_WORDS = new Set(['DJ', 'EP', 'LP', 'UK', 'US', 'HD', 'HQ', 'ID', 'R&B'])

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getGemScoreClass(score) {
  const value = Number(score) || 0

  if (value >= 7.5) {
    return 'text-zinc-800'
  }

  if (value >= 5) {
    return 'text-zinc-600'
  }

  return 'text-zinc-500'
}

function isMetadataSegment(segment, { wrapped = false } = {}) {
  const value = String(segment || '').trim()

  if (!value || FEATURE_PATTERN.test(value)) {
    return false
  }

  if (META_KEYWORD_PATTERN.test(value) || CATALOG_CODE_PATTERN.test(value)) {
    return true
  }

  return Boolean(wrapped && CATALOG_CODE_PATTERN.test(value))
}

function softenMetaWord(word) {
  const letters = word.replace(/[^a-z]/gi, '')

  if (
    !letters ||
    /\d/.test(word) ||
    /[&+]/.test(word) ||
    PRESERVED_META_WORDS.has(word.toUpperCase()) ||
    letters.length <= 3 ||
    word !== word.toUpperCase()
  ) {
    return word
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function formatTitleMeta(segment) {
  return String(segment || '')
    .replace(/^[\s([{|]+|[\s)\]}|]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(softenMetaWord)
    .join(' ')
}

function getVisibleTitleMeta(metaParts) {
  const uniqueParts = []
  const seen = new Set()

  metaParts.forEach((part) => {
    const value = formatTitleMeta(part)
    const key = value.toLowerCase()

    if (!value || seen.has(key)) {
      return
    }

    seen.add(key)
    uniqueParts.push(value)
  })

  return uniqueParts.find((part) => META_KEYWORD_PATTERN.test(part)) || uniqueParts[0] || ''
}

function splitTrackTitle(title) {
  let main = String(title || '').replace(/\s+/g, ' ').trim()
  const metaParts = []

  while (main) {
    const match = main.match(TRAILING_CATALOG_CODE_PATTERN)
    const segment = match?.[1]?.trim()

    if (!match || !isMetadataSegment(segment)) {
      break
    }

    metaParts.unshift(formatTitleMeta(segment))
    main = main.slice(0, match.index).trim()
  }

  while (main) {
    const match = main.match(TRAILING_WRAPPED_META_PATTERN)
    const segment = (match?.[1] || match?.[2] || match?.[3] || '').trim()

    if (!match || !isMetadataSegment(segment, { wrapped: true })) {
      break
    }

    metaParts.unshift(formatTitleMeta(segment))
    main = main.slice(0, match.index).trim()
  }

  let segments = main.split(META_SEPARATOR_PATTERN)

  while (segments.length > 1 && isMetadataSegment(segments[segments.length - 1])) {
    metaParts.unshift(formatTitleMeta(segments.pop()))
  }

  segments = segments.join(' ').split(/\s+-\s+/)

  while (segments.length > 1 && isMetadataSegment(segments[segments.length - 1])) {
    metaParts.unshift(formatTitleMeta(segments.pop()))
  }

  main = segments.join(' - ').trim() || String(title || '').trim()

  return {
    main,
    meta: getVisibleTitleMeta(metaParts),
  }
}

function TrackRow({
  track,
  isPlaying,
  isPlaybackLoading = false,
  isLiked = false,
  onLikeTrack,
  onRemoveFromLiked,
  onPlay,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const titleParts = splitTrackTitle(track.title)
  const [artworkFallback, setArtworkFallback] = useState({ key: '', index: 0 })
  const artworkCandidates = useMemo(() => getArtworkCandidates(track.artworkUrl), [track.artworkUrl])
  const artworkKey = track.artworkUrl || ''
  const artworkCandidateIndex = artworkFallback.key === artworkKey ? artworkFallback.index : 0
  const artworkSrc = artworkCandidates[artworkCandidateIndex] || track.artworkUrl

  function handleArtworkError() {
    if (!artworkKey || artworkCandidateIndex >= artworkCandidates.length - 1) {
      return
    }

    setArtworkFallback({
      key: artworkKey,
      index: artworkCandidateIndex + 1,
    })
  }

  function handleShareTrack(event) {
    event.stopPropagation()
    setShareOpen(true)
  }

  return (
    <>
      <div
        className={[
          'track-row track-table-grid grid w-full px-3 py-4 text-left transition',
          isPlaying ? 'track-row-playing' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={artworkSrc || track.artworkUrl}
            alt={track.title}
            className="aspect-square h-10 w-10 rounded-lg border border-zinc-200 object-cover opacity-85"
            loading="lazy"
            onError={handleArtworkError}
          />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
            className={[
              'tooltip-anchor track-row-control track-row-play-button group grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs transition',
              isPlaying || isPlaybackLoading
                ? 'track-row-control-active border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900',
            ].join(' ')}
            aria-label={isPlaybackLoading ? `Loading ${track.title}` : isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
            data-tooltip={isPlaybackLoading ? 'Loading track' : isPlaying ? 'Pause track' : 'Play track'}
          >
            {isPlaybackLoading ? (
              <span className="playback-loading-spinner playback-loading-spinner-sm" aria-hidden="true" />
            ) : isPlaying ? (
              <BsPauseFill className="h-4 w-4" />
            ) : (
              <BsPlayFill className="h-4 w-4 transition-transform group-hover:scale-110" />
            )}
          </button>

          <div className="track-title-stack" title={track.title}>
            <p className="track-title-line">
              <span className={['track-title-main', isPlaying ? 'track-title-main-playing' : ''].join(' ')}>
                {titleParts.main}
              </span>
            </p>
            {titleParts.meta && (
              <p className="track-title-meta" aria-label={`Track metadata: ${titleParts.meta}`}>
                {titleParts.meta}
              </p>
            )}
            <p className="mt-0.5 truncate text-xs text-zinc-400 md:hidden">{track.artist}</p>
          </div>
        </div>

        <span className="hidden self-center truncate text-sm text-zinc-400 md:block">{track.artist}</span>
        <span className="self-center text-sm tabular-nums text-zinc-400">{compactNumber(track.views)}</span>

        <span className="self-center justify-self-end">
          <span className={`inline-flex min-w-10 justify-end text-sm font-medium tabular-nums ${getGemScoreClass(track.gemScore)}`}>
            {track.gemScore.toFixed(1)}
          </span>
        </span>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (isLiked) {
                onRemoveFromLiked?.(track.id)
                return
              }
              onLikeTrack(track.id)
            }}
            className={[
              'tooltip-anchor track-row-control track-row-like-button grid h-8 w-8 place-items-center rounded-full border text-xs transition',
              isLiked
                ? 'track-row-control-active border-zinc-300 bg-zinc-100 text-zinc-900'
                : 'border-zinc-200 bg-white text-zinc-400 hover:border-zinc-400 hover:text-zinc-900',
            ].join(' ')}
            aria-label={isLiked ? `Remove ${track.title} from liked` : `Save ${track.title} to liked`}
            data-tooltip={isLiked ? 'Remove from liked' : 'Save to liked tracks'}
          >
            {isLiked ? <BsCheckLg className="h-3.5 w-3.5" /> : <BsHeartFill className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleShareTrack}
            className="tooltip-anchor track-row-control track-row-share-button grid h-8 w-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-900"
            aria-label={`Share ${track.title}`}
            data-tooltip="Share track"
          >
            <BsShareFill className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        payload={getTrackSharePayload(track)}
        title={`Share ${track.title}`}
        onClose={() => setShareOpen(false)}
      />
    </>
  )
}

export default TrackRow
