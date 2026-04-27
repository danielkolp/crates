import { useMemo, useState } from 'react'
import EmptyState from './EmptyState'
import ShareModal from './ShareModal'
import { getPlaylistSharePayload, getTrackSharePayload } from '../utils/share'

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function TrackCollectionView({
  collectionId,
  title,
  description,
  trackIds,
  tracksById,
  selectedTrackId,
  onSelectTrack,
  onPlayTrack,
  onRemoveTrack,
  sharePath,
}) {
  const [shareState, setShareState] = useState({ open: false, payload: null, title: '' })

  const tracks = useMemo(
    () => trackIds.map((trackId) => tracksById[trackId]).filter(Boolean),
    [trackIds, tracksById],
  )

  function openShare(payload, modalTitle) {
    setShareState({
      open: true,
      payload,
      title: modalTitle,
    })
  }

  function closeShare() {
    setShareState({ open: false, payload: null, title: '' })
  }

  const collectionPayload = getPlaylistSharePayload(
    { id: collectionId, name: title },
    tracks,
    sharePath,
  )

  return (
    <section className="space-y-4">
      <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-zinc-600">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="mono rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
            {tracks.length} tracks
          </span>
          <button
            type="button"
            onClick={() => openShare(collectionPayload, `Share ${title}`)}
            className="tooltip-anchor rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
            data-tooltip={`Share your ${title} collection`}
          >
            Share
          </button>
        </div>
      </header>

      {tracks.length === 0 && (
        <section className="panel p-8">
          <EmptyState
            title={`No tracks in ${title}`}
            description="Save tracks from Search or Swipe mode and they will show up here."
          />
        </section>
      )}

      {tracks.length > 0 && (
        <div className="space-y-2">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => onSelectTrack(track.id)}
              className={[
                'tooltip-anchor panel flex w-full items-center justify-between gap-3 p-3 text-left transition',
                selectedTrackId === track.id
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'hover:border-zinc-400 hover:bg-white',
              ].join(' ')}
              data-tooltip="Select this track"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={track.artworkUrl}
                  alt={track.title}
                  className="h-12 w-12 rounded-lg border border-zinc-200 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{track.title}</p>
                  <p className={['truncate text-xs', selectedTrackId === track.id ? 'text-zinc-300' : 'text-zinc-500'].join(' ')}>
                    {track.artist}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={['mono text-xs', selectedTrackId === track.id ? 'text-zinc-300' : 'text-zinc-500'].join(' ')}>
                  {compactNumber(track.views)} views
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlayTrack(track.id)
                  }}
                  className={[
                    'tooltip-anchor rounded-lg border px-2 py-1 text-xs font-semibold transition',
                    selectedTrackId === track.id
                      ? 'border-white/70 text-white hover:bg-white hover:text-zinc-900'
                      : 'border-zinc-300 text-zinc-700 hover:border-zinc-900 hover:bg-zinc-900 hover:text-white',
                  ].join(' ')}
                  data-tooltip="Play this track"
                >
                  Play
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    openShare(getTrackSharePayload(track), `Share ${track.title}`)
                  }}
                  className={[
                    'tooltip-anchor rounded-lg border px-2 py-1 text-xs font-semibold transition',
                    selectedTrackId === track.id
                      ? 'border-white/70 text-white hover:bg-white hover:text-zinc-900'
                      : 'border-zinc-300 text-zinc-700 hover:border-zinc-900 hover:bg-zinc-900 hover:text-white',
                  ].join(' ')}
                  data-tooltip="Share this track"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveTrack(track.id)
                  }}
                  className="tooltip-anchor rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
                  data-tooltip="Remove from this collection"
                >
                  Remove
                </button>
              </div>
            </button>
          ))}
        </div>
      )}

      <ShareModal
        open={shareState.open}
        payload={shareState.payload}
        title={shareState.title}
        onClose={closeShare}
      />
    </section>
  )
}

export default TrackCollectionView
