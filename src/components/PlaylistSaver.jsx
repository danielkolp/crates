import { useMemo, useState } from 'react'
import { BsCheckLg, BsMusicNoteList } from 'react-icons/bs'

function PlaylistSaver({
  track,
  playlists = [],
  onAddToPlaylist,
  onCreatePlaylist,
  compact = false,
  surfaceStyle,
  labelStyle,
  controlStyle,
}) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('')
  const [isCreating, setIsCreating] = useState(playlists.length === 0)
  const [playlistName, setPlaylistName] = useState('')

  const selectedPlaylist = useMemo(() => {
    if (selectedPlaylistId) {
      return playlists.find((playlist) => playlist.id === selectedPlaylistId) || null
    }

    return playlists[0] || null
  }, [playlists, selectedPlaylistId])

  const resolvedPlaylistId = selectedPlaylist?.id || ''
  const isAlreadySaved = Boolean(track?.id && selectedPlaylist?.trackIds?.includes(track.id))
  const canAdd = Boolean(track?.id && resolvedPlaylistId && !isAlreadySaved)
  const canCreate = Boolean(track?.id && playlistName.trim())

  const themedButtonStyle = controlStyle
    ? {
        ...controlStyle,
        color: controlStyle.color,
        borderColor: controlStyle.borderColor,
        background: controlStyle.background,
      }
    : undefined

  const primaryButtonStyle = controlStyle
    ? {
        ...controlStyle,
        color: controlStyle.color,
        borderColor: controlStyle.borderColor,
        background: controlStyle.background,
      }
    : undefined

  const savedButtonStyle = controlStyle
    ? {
        ...controlStyle,
        color: controlStyle.color,
        borderColor: controlStyle.borderColor,
        background: controlStyle.background,
        opacity: 0.75,
      }
    : undefined

  function addToSelectedPlaylist() {
    if (!canAdd) return
    onAddToPlaylist?.(track.id, resolvedPlaylistId)
  }

  function createPlaylist(event) {
    event.preventDefault()

    if (!canCreate) return

    const playlistId = onCreatePlaylist?.({
      name: playlistName.trim(),
      description: `Saved from ${track.title}`,
      trackId: track.id,
    })

    if (playlistId) setSelectedPlaylistId(playlistId)

    setPlaylistName('')
    setIsCreating(false)
  }

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white ${compact ? 'p-2.5' : 'p-3'}`}
      style={surfaceStyle}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BsMusicNoteList className="h-4 w-4" style={labelStyle} />
          <p className="muted-label" style={labelStyle}>Playlist</p>
        </div>

        {playlists.length > 0 && (
          <button
            type="button"
            onClick={() => setIsCreating((prev) => !prev)}
            className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition hover:opacity-80"
            style={themedButtonStyle}
          >
            {isCreating ? 'Choose' : 'New'}
          </button>
        )}
      </div>

      {playlists.length > 0 && !isCreating && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={resolvedPlaylistId}
            onChange={(event) => setSelectedPlaylistId(event.target.value)}
            className="input-select h-9 text-sm"
            style={controlStyle}
          >
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name} ({playlist.trackIds.length})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addToSelectedPlaylist}
            disabled={!canAdd}
            className="inline-flex h-9 min-w-[5.75rem] items-center justify-center gap-1 rounded-lg border px-3 text-sm font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={isAlreadySaved ? savedButtonStyle : primaryButtonStyle}
          >
            {isAlreadySaved && <BsCheckLg className="h-3.5 w-3.5" />}
            {isAlreadySaved ? 'Added' : 'Add'}
          </button>
        </div>
      )}

      {isCreating && (
        <form onSubmit={createPlaylist} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            placeholder="Playlist name"
            className="h-9 rounded-lg border px-3 text-sm outline-none transition focus:opacity-90"
            style={controlStyle}
          />

          <button
            type="submit"
            disabled={!canCreate}
            className="h-9 min-w-[7.5rem] rounded-lg border px-3 text-sm font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={primaryButtonStyle}
          >
            Create & add
          </button>
        </form>
      )}
    </section>
  )
}

export default PlaylistSaver