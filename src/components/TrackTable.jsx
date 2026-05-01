import TrackRow from './TrackRow'
import EmptyState from './EmptyState'

function TrackTable({
  tracks,
  isLoading,
  selectedTrackId,
  currentTrackId,
  isPlaying,
  playbackProgress,
  likedTrackIds = [],
  onLikeTrack,
  onSelectTrack,
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
    <section className="panel min-h-0 overflow-visible">
      <div className="overflow-visible">
        <div className="w-full">
          <div className="track-table-grid grid border-b border-zinc-200 px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            <span>#</span>
            <span>Track</span>
            <span>Artist</span>
            <span>Views</span>
            <span>Likes</span>
            <span>Comments</span>
            <span>Gem Score</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-zinc-200">
            {tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                rank={index + 1}
                track={track}
                isSelected={selectedTrackId === track.id}
                isPlaying={isPlaying && currentTrackId === track.id}
                playbackProgress={isPlaying && currentTrackId === track.id ? playbackProgress : 0}
                isLiked={likedTrackIdSet.has(track.id)}
                onLikeTrack={onLikeTrack}
                onSelect={() => onSelectTrack(track.id)}
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
