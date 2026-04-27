import { useEffect, useState } from 'react'
import EmptyState from './EmptyState'
import ShareModal from './ShareModal'
import YouTubePlayer from './YouTubePlayer'
import { getTrackSharePayload } from '../utils/share'

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getRelativeDateLabel(isoDate) {
  const now = new Date()
  const publishedDate = new Date(isoDate)
  const diffMs = Math.max(now.getTime() - publishedDate.getTime(), 0)
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 1) {
    return 'Today'
  }

  if (diffDays === 1) {
    return '1 day ago'
  }

  if (diffDays < 30) {
    return `${diffDays} days ago`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`
  }

  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`
}

const DETAIL_CARD_CLASS = 'track-details-card rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_1px_1px_rgba(0,0,0,0.02)]'

function StatIcon({ kind }) {
  if (kind === 'views') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    )
  }

  if (kind === 'likes') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" />
      </svg>
    )
  }

  if (kind === 'comments') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-5 3 1.6-4.3A8.5 8.5 0 1 1 21 11.5Z" />
      </svg>
    )
  }

  if (kind === 'gem') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3.5 10.5 7 4h10l3.5 6.5L12 20 3.5 10.5Z" />
        <path d="M7 4l5 16 5-16" />
      </svg>
    )
  }

  if (kind === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6.5" width="18" height="11" rx="3" />
        <path d="m10 10 5 2-5 2v-4Z" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  if (kind === 'tags') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m20 10-8.8 8.8a2 2 0 0 1-2.8 0L3 13.5V4h9.5l5.5 5.5a2 2 0 0 1 0 2.8Z" />
        <circle cx="8.5" cy="8.5" r="1.2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

function TrackDetails({
  track,
  isPlaying,
  onToggleTrackPlayback,
  onLikeTrack,
}) {
  const [showInlinePlayer, setShowInlinePlayer] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  function handleShareTrack() {
    if (!track) {
      return
    }

    setShareOpen(true)
  }

  useEffect(() => {
    setShowInlinePlayer(false)
  }, [track?.id])

  const gemScorePercent = Math.max(0, Math.min((Number(track?.gemScore) || 0) * 10, 100))

  return (
    <aside className="track-details h-full min-h-0 overflow-hidden border-t border-zinc-300/90 bg-zinc-50 xl:border-t-0">
      {!track && (
        <div className="m-3 border border-zinc-300 bg-white p-5 shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
          <EmptyState
            title="No Track Selected"
            description="Choose a track from the digger list to inspect details and save to liked tracks."
          />
        </div>
      )}

      {track && (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
          <section className="track-details-hero relative overflow-hidden rounded-3xl border border-zinc-300 bg-zinc-900">
            <img
              src={track.artworkUrl}
              alt={track.title}
              className="track-details-hero-image h-72 w-full object-cover opacity-95"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/35 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <p className="text-2xl font-semibold leading-[1.05] tracking-tight">{track.title}</p>
              <p className="mt-1 text-lg text-zinc-200">{track.artist}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="mono text-xs uppercase tracking-[0.12em] text-zinc-300">
                  {track.publishedAt?.slice(0, 4) || '2000'} - {track.genre || 'Underground'}
                </p>
                <button
                  type="button"
                  onClick={() => onToggleTrackPlayback(track.id)}
                  className="tooltip-anchor track-details-play-button inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
                  data-tooltip={isPlaying ? 'Pause this track' : 'Play this track'}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    {isPlaying ? <path d="M8 6v12M16 6v12" /> : <path d="m8 6 10 6-10 6V6Z" fill="currentColor" stroke="none" />}
                  </svg>
                  {isPlaying ? 'Pause Track' : 'Play Track'}
                </button>
              </div>
            </div>
          </section>

          <section className={`${DETAIL_CARD_CLASS} track-details-stats grid grid-cols-3 divide-x divide-zinc-200`}>
            <div className="px-2">
              <div className="flex items-center gap-2">
                <StatIcon kind="views" />
                <p className="muted-label">Views</p>
              </div>
              <p className="mt-2 text-3xl font-semibold leading-none md:text-4xl">{compactNumber(track.views)}</p>
            </div>
            <div className="px-3">
              <div className="flex items-center gap-2">
                <StatIcon kind="likes" />
                <p className="muted-label">Likes</p>
              </div>
              <p className="mt-2 text-3xl font-semibold leading-none md:text-4xl">{compactNumber(track.likes)}</p>
            </div>
            <div className="px-3">
              <div className="flex items-center gap-2">
                <StatIcon kind="comments" />
                <p className="muted-label">Comments</p>
              </div>
              <p className="mt-2 text-3xl font-semibold leading-none md:text-4xl">{compactNumber(track.comments)}</p>
            </div>
          </section>

          <section className={`${DETAIL_CARD_CLASS} track-details-gem`}>
            <div className="flex items-center gap-2">
              <StatIcon kind="gem" />
              <p className="muted-label">Gem Score</p>
            </div>
            <p className="mt-2 text-6xl font-semibold leading-none">{track.gemScore.toFixed(1)}</p>
            <div className="track-details-gem-meter mt-4 h-2 overflow-hidden rounded-full bg-zinc-200">
              <span className="track-details-gem-fill block h-full rounded-full bg-zinc-900" style={{ width: `${gemScorePercent}%` }} />
            </div>
            {track.gemReason && <p className="track-details-gem-reason mt-3 text-sm text-zinc-600">{track.gemReason}</p>}
          </section>

        

        
        

          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={() => onLikeTrack(track.id)}
              className="tooltip-anchor track-details-save-btn w-full rounded-2xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 px-4 py-3 text-lg font-semibold text-white transition hover:from-zinc-800 hover:to-zinc-700"
              data-tooltip="Save this track to Liked"
            >
              Save to Liked
            </button>

            <button
              type="button"
              onClick={handleShareTrack}
              className="tooltip-anchor track-details-share-btn w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-lg font-semibold text-zinc-900 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
              data-tooltip="Open share options for this track"
            >
              Share
            </button>
          </div>
        </div>
      )}

      <ShareModal
        open={shareOpen}
        payload={track ? getTrackSharePayload(track) : null}
        title={track ? `Share ${track.title}` : 'Share'}
        onClose={() => setShareOpen(false)}
      />
    </aside>
  )
}

export default TrackDetails
