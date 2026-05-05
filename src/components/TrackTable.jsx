import TrackRow from './TrackRow'
import EmptyState from './EmptyState'

function TrackTable({
  tracks,
  isLoading,
  currentTrackId,
  isPlaying,
  likedTrackIds = [],
  onLikeTrack,
  onRemoveFromLiked,
  onToggleTrackPlayback,
}) {
  const likedTrackIdSet = new Set(likedTrackIds)

  if (isLoading) {
    return (
      <section className="panel p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`skeleton-row-${index}`}
              className="h-14 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"
            />
          ))}
        </div>
      </section>
    )
  }

  if (tracks.length === 0) {
    return (
      <section className="panel p-8">
        <EmptyState
          title="No Tracks Match Your Filters"
          description="Try a wider view threshold, remove some tags, or change vibe/genre filters."
        />
      </section>
    )
  }

  return (
    <section className="panel min-h-0 overflow-visible rounded-xl shadow-sm">
      <div className="overflow-visible">
        <div className="w-full">
          <div className="track-table-grid grid border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            <span>Track</span>
            <span className="hidden text-zinc-400 md:block">Artist</span>
            <span className="text-zinc-400">Views</span>
            <span className="justify-self-end">Gem</span>
            <span className="justify-self-end">Actions</span>
          </div>
          <div className="divide-y divide-zinc-200">
            {tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                isPlaying={isPlaying && currentTrackId === track.id}
                isLiked={likedTrackIdSet.has(track.id)}
                onLikeTrack={onLikeTrack}
                onRemoveFromLiked={onRemoveFromLiked}
                onPlay={() => onToggleTrackPlayback(track.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default TrackTable
