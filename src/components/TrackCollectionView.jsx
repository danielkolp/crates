import { useMemo, useState } from 'react'
import { BsPlayFill, BsShareFill, BsTrash3Fill } from 'react-icons/bs'
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
  const [pendingRemoveTrack, setPendingRemoveTrack] = useState(null)

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

  function requestRemove(track) {
    if (collectionId === 'liked-tracks') {
      setPendingRemoveTrack(track)
      return
    }

    onRemoveTrack(track.id)
  }

  function confirmRemove() {
    if (pendingRemoveTrack) {
      onRemoveTrack(pendingRemoveTrack.id)
    }

    setPendingRemoveTrack(null)
  }

  const collectionPayload = getPlaylistSharePayload(
    { id: collectionId, name: title },
    tracks,
    sharePath,
  )

  return (
    <section className="space-y-4 overflow-visible">
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
            <div
              key={track.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTrack(track.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectTrack(track.id)
                }
              }}
              className={[
                'tooltip-anchor panel flex w-full cursor-pointer flex-col gap-3 p-3 text-left transition sm:flex-row sm:items-center sm:justify-between',
                selectedTrackId === track.id
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'hover:border-zinc-400 hover:bg-white',
              ].join(' ')}
              data-tooltip="Select this track"
            >
              <div className="flex min-w-0 items-center gap-3 self-stretch sm:self-auto">
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

              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
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
                    'tooltip-anchor hover-swap inline-flex min-w-[3.25rem] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition',
                    selectedTrackId === track.id
                      ? 'border-white/60 text-white hover:bg-emerald-500 hover:text-white'
                      : 'border-zinc-300 text-zinc-700 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white',
                  ].join(' ')}
                  data-tooltip="Play this track"
                >
                  <span className="hover-swap-text">Play</span>
                  <BsPlayFill className="hover-swap-icon h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    openShare(getTrackSharePayload(track), `Share ${track.title}`)
                  }}
                  className={[
                    'tooltip-anchor hover-swap inline-flex min-w-[3.75rem] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition',
                    selectedTrackId === track.id
                      ? 'border-white/60 text-white hover:bg-sky-500 hover:text-white'
                      : 'border-zinc-300 text-zinc-700 hover:border-sky-500 hover:bg-sky-500 hover:text-white',
                  ].join(' ')}
                  data-tooltip="Share this track"
                >
                  <span className="hover-swap-text">Share</span>
                  <BsShareFill className="hover-swap-icon h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    requestRemove(track)
                  }}
                  className="tooltip-anchor tooltip-left hover-swap inline-flex min-w-[4.75rem] items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
                  data-tooltip="Remove from this collection"
                >
                  <span className="hover-swap-text">Remove</span>
                  <BsTrash3Fill className="hover-swap-icon h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ShareModal
        open={shareState.open}
        payload={shareState.payload}
        title={shareState.title}
        onClose={closeShare}
      />

      {pendingRemoveTrack && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold tracking-tight">Remove from Liked?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              This removes <span className="font-semibold">{pendingRemoveTrack.title}</span> from your Liked Tracks.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoveTrack(null)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="rounded-lg border border-red-500 bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default TrackCollectionView
