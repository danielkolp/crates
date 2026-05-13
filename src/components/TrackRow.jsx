import { useState } from 'react'
import { BsCheckLg, BsHeartFill, BsPauseFill, BsPlayFill, BsShareFill } from 'react-icons/bs'
import ShareModal from './ShareModal'
import { toRgba, useArtworkTheme } from '../hooks/useArtworkTheme'
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

function toCssUrl(value) {
  const source = String(value || '').trim()
  if (!source) return 'none'

  return `url("${source.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

function TrackRow({
  track,
  isPlaying,
  isPlaybackLoading = false,
  isDarkMode = false,
  isLiked = false,
  onLikeTrack,
  onRemoveFromLiked,
  onPlay,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const titleParts = splitTrackTitle(track.title)
  const { artworkSrc, dynamicTheme, handleArtworkError } = useArtworkTheme(track.artworkUrl, { isDarkMode })
  const rowArtworkUrl = artworkSrc || track.artworkUrl
  const shouldThemeRow = Boolean(rowArtworkUrl || dynamicTheme)
  const rowTextColor = isDarkMode ? dynamicTheme?.textColor || 'rgb(244, 244, 245)' : 'rgb(24, 24, 27)'
  const rowMutedColor = isDarkMode && dynamicTheme ? toRgba(dynamicTheme.textColor, 0.68) : isDarkMode ? 'rgba(212, 212, 216, 0.74)' : 'rgba(63, 63, 70, 0.78)'
  const themedRowStyle = shouldThemeRow
    ? {
        '--track-row-artwork': toCssUrl(rowArtworkUrl),
        '--track-row-artwork-opacity': isDarkMode ? 0.18 : 0.15,
        '--track-row-artwork-hover-opacity': isDarkMode ? 0.24 : 0.26,
        '--track-row-bg': dynamicTheme
          ? isDarkMode
            ? `linear-gradient(90deg, ${toRgba(dynamicTheme.cardColor, 0.74)} 0%, ${toRgba(dynamicTheme.mainColor, 0.64)} 100%)`
            : `linear-gradient(90deg, ${toRgba(dynamicTheme.accentColor, 0.14)} 0%, ${toRgba(dynamicTheme.cardColor, 0.1)} 100%)`
          : isDarkMode
            ? 'linear-gradient(90deg, rgba(9, 9, 11, 0.76) 0%, rgba(24, 24, 27, 0.9) 100%)'
            : 'linear-gradient(90deg, rgba(255, 255, 255, 0.78) 0%, rgba(250, 250, 250, 0.92) 100%)',
        '--track-row-hover-bg': dynamicTheme
          ? isDarkMode
            ? `linear-gradient(90deg, ${toRgba(dynamicTheme.accentColor, 0.64)} 0%, ${toRgba(dynamicTheme.cardColor, 0.74)} 100%)`
            : `linear-gradient(90deg, ${toRgba(dynamicTheme.accentColor, 0.24)} 0%, ${toRgba(dynamicTheme.mainColor, 0.14)} 100%)`
          : isDarkMode
            ? 'linear-gradient(90deg, rgba(39, 39, 42, 0.84) 0%, rgba(24, 24, 27, 0.94) 100%)'
            : 'linear-gradient(90deg, rgba(255, 255, 255, 0.68) 0%, rgba(244, 244, 245, 0.88) 100%)',
        '--track-row-text': rowTextColor,
        '--track-row-muted': rowMutedColor,
        '--track-row-control-border': dynamicTheme && isDarkMode ? dynamicTheme.borderColor : dynamicTheme ? toRgba(dynamicTheme.accentColor, 0.34) : isDarkMode ? 'rgba(255, 255, 255, 0.34)' : 'rgba(212, 212, 216, 1)',
        '--track-row-control-bg': dynamicTheme && isDarkMode ? toRgba(dynamicTheme.cardColor, 0.86) : isDarkMode ? 'rgba(24, 24, 27, 0.86)' : 'rgba(255, 255, 255, 0.86)',
        '--track-row-control-text': dynamicTheme && isDarkMode ? dynamicTheme.textColor : isDarkMode ? 'rgb(244, 244, 245)' : 'rgb(63, 63, 70)',
        '--track-row-control-active-bg': dynamicTheme && isDarkMode ? dynamicTheme.textColor : 'rgb(24, 24, 27)',
        '--track-row-control-active-text': dynamicTheme && isDarkMode ? dynamicTheme.mainColor : 'rgb(255, 255, 255)',
      }
    : undefined

  function handleShareTrack(event) {
    event.stopPropagation()
    setShareOpen(true)
  }

  return (
    <>
      <div
        className={[
          'track-row track-table-grid grid w-full px-3 py-4 text-left transition',
          shouldThemeRow ? 'track-row-themed' : '',
          isPlaying ? 'track-row-playing' : '',
        ].join(' ')}
        style={themedRowStyle}
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
              'tooltip-anchor track-row-control track-row-artwork-control track-row-play-button group grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs transition',
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

          <div className="track-title-stack">
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
            <p className="track-row-artist mt-0.5 truncate text-xs text-zinc-400 md:hidden">{track.artist}</p>
          </div>
        </div>

        <span className="track-row-artist hidden self-center truncate text-sm text-zinc-400 md:block">{track.artist}</span>
        <span className="track-row-views self-center text-sm tabular-nums text-zinc-400">{compactNumber(track.views)}</span>

        <span className="self-center justify-self-end">
          <span className={`track-row-gem-score inline-flex min-w-10 justify-end text-sm font-medium tabular-nums ${getGemScoreClass(track.gemScore)}`}>
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
