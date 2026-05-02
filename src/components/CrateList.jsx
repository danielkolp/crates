import { useState } from 'react'
import { BsPlayFill, BsShareFill, BsTrash3Fill } from 'react-icons/bs'
import ConfirmModal from './ConfirmModal'
import EmptyState from './EmptyState'
import ShareModal from './ShareModal'
import TrackSearchLinks from './TrackSearchLinks'
import { getPlaylistSharePayload, getTrackSharePayload } from '../utils/share'

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function CrateList({
  crates,
  tracksById,
  selectedTrackId,
  onPlayTrack,
  onCreatePlaylist,
  onDeletePlaylist,
  onRemoveFromCrate,
}) {
  const totalTracks = crates.reduce((accumulator, crate) => accumulator + crate.trackIds.length, 0)
  const [shareState, setShareState] = useState({ open: false, payload: null, title: '' })
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false)
  const [playlistName, setPlaylistName] = useState('')
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState(null)
  const [removingPlaylistIds, setRemovingPlaylistIds] = useState([])

  function openShare(payload, title) {
    setShareState({
      open: true,
      payload,
      title,
    })
  }

  function closeShare() {
    setShareState({ open: false, payload: null, title: '' })
  }

  function handleSharePlaylist(crate) {
    const playlistTracks = crate.trackIds
      .map((trackId) => tracksById[trackId])
      .filter(Boolean)

    const payload = getPlaylistSharePayload(crate, playlistTracks)
    openShare(payload, `Share ${crate.name}`)
  }

  function handleShareTrack(track) {
    openShare(getTrackSharePayload(track), `Share ${track.title}`)
  }

  function handleCreatePlaylist(event) {
    event.preventDefault()

    const name = playlistName.trim()
    if (!name) {
      return
    }

    onCreatePlaylist?.({
      name,
      description: 'Custom playlist',
    })

    setPlaylistName('')
    setIsCreatingPlaylist(false)
  }

  function confirmDeletePlaylist() {
    if (!pendingDeletePlaylist) {
      return
    }

    const playlistId = pendingDeletePlaylist.id

    setRemovingPlaylistIds((prev) => (prev.includes(playlistId) ? prev : [...prev, playlistId]))
    setPendingDeletePlaylist(null)

    window.setTimeout(() => {
      onDeletePlaylist?.(playlistId)
      setRemovingPlaylistIds((prev) => prev.filter((id) => id !== playlistId))
    }, 180)
  }

  return (
    <section className="space-y-4 overflow-visible">
      <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Your Playlists</h2>
          <p className="text-sm text-zinc-600">Curated playlist buckets separate from Liked and Gems.</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mono rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">
            {totalTracks} saved tracks
          </span>
          <button
            type="button"
            onClick={() => setIsCreatingPlaylist((prev) => !prev)}
            className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
          >
            {isCreatingPlaylist ? 'Cancel' : 'New playlist'}
          </button>
        </div>
      </header>

      {isCreatingPlaylist && (
        <form onSubmit={handleCreatePlaylist} className="playlist-form panel grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="space-y-1">
            <span className="muted-label">Playlist Name</span>
            <input
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              placeholder="New playlist"
              className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900"
            />
          </label>

          <button
            type="submit"
            disabled={!playlistName.trim()}
            className="self-end rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {crates.length === 0 && (
          <section className="panel p-6">
            <EmptyState
              title="No playlists yet"
              description="Your playlist collection will appear here."
            />
          </section>
        )}

        {crates.map((crate) => (
          <article
            key={crate.id}
            className={[
              'playlist-card panel min-w-0 p-4',
              removingPlaylistIds.includes(crate.id) ? 'playlist-card-removing' : '',
            ].join(' ')}
          >
            <div className="mb-3 border-b border-zinc-200 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{crate.name}</h3>
                  <p className="text-sm text-zinc-600">{crate.description}</p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleSharePlaylist(crate)}
                    className="tooltip-anchor hover-swap inline-flex min-w-[3.5rem] items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] font-semibold transition hover:border-sky-500 hover:bg-sky-500 hover:text-white"
                    data-tooltip="Share this playlist"
                  >
                    <span className="hover-swap-text">Share</span>
                    <BsShareFill className="hover-swap-icon h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeletePlaylist(crate)}
                    className="tooltip-anchor tooltip-left hover-swap inline-flex min-w-[4rem] items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
                    data-tooltip="Delete playlist"
                  >
                    <span className="hover-swap-text">Delete</span>
                    <BsTrash3Fill className="hover-swap-icon h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {crate.trackIds.length === 0 && (
              <EmptyState
                title="No tracks in this playlist"
                description="Select a track in Search and add it to this playlist."
                compact
              />
            )}

            {crate.trackIds.length > 0 && (
              <div className="space-y-2">
                {crate.trackIds.map((trackId) => {
                  const track = tracksById[trackId]
                  if (!track) {
                    return null
                  }

                  return (
                    <div
                      key={track.id}
                      className={[
                        'flex w-full flex-col gap-3 rounded-xl border px-3 py-2 text-left transition sm:flex-row sm:items-center sm:justify-between',
                        selectedTrackId === track.id
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400 hover:bg-white',
                      ].join(' ')}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={track.artworkUrl}
                          alt={track.title}
                          className="h-10 w-10 rounded-lg border border-zinc-200 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{track.title}</p>
                          <p
                            className={[
                              'truncate text-xs',
                              selectedTrackId === track.id ? 'text-zinc-300' : 'text-zinc-500',
                            ].join(' ')}
                          >
                            {track.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                        <span className="mono text-xs">{compactNumber(track.views)} views</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemoveFromCrate(track.id, crate.id)
                          }}
                          className="tooltip-anchor tooltip-left hover-swap inline-flex min-w-[4.75rem] items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
                          aria-label={`Remove ${track.title} from ${crate.name}`}
                          data-tooltip="Remove from playlist"
                        >
                          <span className="hover-swap-text">Remove</span>
                          <BsTrash3Fill className="hover-swap-icon h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleShareTrack(track)
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
                        <TrackSearchLinks track={track} variant="menu" />
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
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        ))}
      </div>

      <ShareModal
        open={shareState.open}
        payload={shareState.payload}
        title={shareState.title}
        onClose={closeShare}
      />

      <ConfirmModal
        open={Boolean(pendingDeletePlaylist)}
        title="Delete playlist?"
        message={
          pendingDeletePlaylist
            ? `Delete "${pendingDeletePlaylist.name}" and remove its saved track list? The tracks stay available in Liked, Gems, History, and search results.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDeletePlaylist}
        onCancel={() => setPendingDeletePlaylist(null)}
      />
    </section>
  )
}

export default CrateList
