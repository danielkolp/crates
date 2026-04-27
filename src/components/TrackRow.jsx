import { useState } from 'react'
import ShareModal from './ShareModal'
import { getTrackSharePayload } from '../utils/share'

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function parseDurationSeconds(track) {
  if (Number.isFinite(Number(track.durationSeconds))) {
    return Number(track.durationSeconds)
  }

  const parts = String(track.duration || '').split(':').map((part) => Number(part))
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return (parts[0] * 60) + parts[1]
  }

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  }

  return 0
}

function TrackRow({
  rank,
  track,
  isSelected,
  isPlaying,
  playbackProgress,
  onLikeTrack,
  onSelect,
  onPlay,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const durationSeconds = parseDurationSeconds(track)
  const barCount = Math.min(Math.max(Math.round(durationSeconds / 12), 12), 30)
  const playedBars = Math.round((Math.max(0, Math.min(playbackProgress, 100)) / 100) * barCount)
  const waveformPoints = Array.from({ length: barCount }).map((_, index) => {
    const sourceIndex = index % track.waveform.length
    return track.waveform[sourceIndex]
  })

  function handleShareTrack(event) {
    event.stopPropagation()
    setShareOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        className={[
          'tooltip-anchor grid w-full grid-cols-[40px_minmax(0,2.6fr)_minmax(0,1.1fr)_0.8fr_0.8fr_0.8fr_0.8fr_160px] gap-2 px-4 py-3 text-left transition',
          isSelected ? 'bg-zinc-100' : 'hover:bg-zinc-50',
        ].join(' ')}
      >
        <span className="mono pt-3 text-sm text-zinc-500">{rank}</span>

      <div className="flex min-w-0 items-center gap-3">
        <img
          src={track.artworkUrl}
          alt={track.title}
          className="h-12 w-12 rounded-lg border border-zinc-200 object-cover"
          loading="lazy"
        />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onPlay()
          }}
          className="tooltip-anchor grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-300 text-xs font-semibold transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          data-tooltip={isPlaying ? 'Pause track' : 'Play track'}
        >
          {isPlaying ? '||' : '>'}
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-6 items-end gap-[2px]">
              {waveformPoints.map((point, index) => (
                <span
                  key={`${track.id}-wave-${index}`}
                  className="wave-bar"
                  style={{
                    height: `${Math.max(point * 22, 3)}px`,
                    backgroundColor: isPlaying && index < playedBars ? '#18181b' : 'rgba(161, 161, 170, 0.8)',
                  }}
                />
              ))}
            </div>
            <span className="mono text-xs text-zinc-500">{track.duration}</span>
          </div>
          {Array.isArray(track.qualityBadges) && track.qualityBadges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {track.qualityBadges.slice(0, 3).map((badge) => (
                <span
                  key={`${track.id}-${badge}`}
                  className="rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <span className="truncate pt-3 text-sm text-zinc-700">{track.artist}</span>
      <span className="pt-3 text-sm text-zinc-700">{compactNumber(track.views)}</span>
      <span className="pt-3 text-sm text-zinc-700">{compactNumber(track.likes)}</span>
      <span className="pt-3 text-sm text-zinc-700">{compactNumber(track.comments)}</span>
      <span className="pt-2.5">
        <span className="inline-flex min-w-12 justify-center rounded-full border border-zinc-300 px-2 py-1 text-sm font-semibold">
          {track.gemScore.toFixed(1)}
        </span>
        {Number.isFinite(Number(track.qualityScore)) && (
          <span className="mt-1 block text-center text-[10px] font-medium text-zinc-500">
            q {Number(track.qualityScore).toFixed(1)}
          </span>
        )}
      </span>

        <div className="flex items-center justify-start gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onLikeTrack(track.id)
            }}
            className="tooltip-anchor rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
            data-tooltip="Save to liked tracks"
          >
            Like
          </button>

          <button
            type="button"
            onClick={handleShareTrack}
            className="tooltip-anchor grid h-7 w-7 place-items-center rounded-full border border-zinc-300 bg-white text-[11px] font-semibold transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
            aria-label={`Share ${track.title}`}
            data-tooltip="Share track"
          >
            S
          </button>
        </div>
      </button>

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
