import { useState } from 'react'
import { BsCheckLg, BsHeartFill, BsPauseFill, BsPlayFill, BsShareFill } from 'react-icons/bs'
import ShareModal from './ShareModal'
import { getTrackSharePayload } from '../utils/share'

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
    return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }

  if (value >= 5) {
    return 'border-amber-300 bg-amber-50 text-amber-700'
  }

  return 'border-red-300 bg-red-50 text-red-700'
}

function TrackRow({
  track,
  isPlaying,
  isLiked = false,
  onLikeTrack,
  onRemoveFromLiked,
  onPlay,
}) {
  const [shareOpen, setShareOpen] = useState(false)

  function handleShareTrack(event) {
    event.stopPropagation()
    setShareOpen(true)
  }

  return (
    <>
      <div
        className={[
          'track-table-grid grid w-full border-l-2 border-l-transparent px-3 py-3.5 text-left transition',
          isPlaying ? 'bg-zinc-50' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={track.artworkUrl}
            alt={track.title}
            className="h-10 w-10 rounded-lg border border-zinc-200 object-cover opacity-85"
            loading="lazy"
          />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onPlay()
            }}
            className="tooltip-anchor group grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
            aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
            data-tooltip={isPlaying ? 'Pause track' : 'Play track'}
          >
            {isPlaying ? <BsPauseFill className="h-4 w-4" /> : <BsPlayFill className="h-4 w-4 transition-transform group-hover:scale-110" />}
          </button>

          <div className="min-w-0">
            <p className="truncate text-[1.08rem] font-bold leading-tight text-zinc-900">{track.title}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-400 md:hidden">{track.artist}</p>
          </div>
        </div>

        <span className="hidden self-center truncate text-sm text-zinc-400 md:block">{track.artist}</span>
        <span className="self-center text-sm font-medium text-zinc-400">{compactNumber(track.views)}</span>

        <span className="self-center justify-self-end">
          <span className={`inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-sm font-semibold ${getGemScoreClass(track.gemScore)}`}>
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
              'tooltip-anchor grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition',
              isLiked
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-zinc-200 bg-white text-zinc-400 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white',
            ].join(' ')}
            aria-label={isLiked ? `Remove ${track.title} from liked` : `Save ${track.title} to liked`}
            data-tooltip={isLiked ? 'Remove from liked' : 'Save to liked tracks'}
          >
            {isLiked ? <BsCheckLg className="h-3.5 w-3.5" /> : <BsHeartFill className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleShareTrack}
            className="tooltip-anchor grid h-8 w-8 place-items-center rounded-full border border-zinc-300 bg-white text-zinc-600 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
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
