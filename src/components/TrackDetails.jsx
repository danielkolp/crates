import { useState } from 'react'
import { BsCheckLg, BsHeartFill, BsShareFill } from 'react-icons/bs'
import EmptyState from './EmptyState'
import PlaylistSaver from './PlaylistSaver'
import ShareModal from './ShareModal'
import TrackSearchLinks from './TrackSearchLinks'
import { getTrackSharePayload } from '../utils/share'

function compactNumber(value) {
  if (value < 1000) return value.toString()

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getGemScoreTone(score) {
  const value = Number(score) || 0

  if (value >= 7.5) return 'track-details-gem-high'
  if (value >= 5) return 'track-details-gem-mid'
  return 'track-details-gem-low'
}

function getGemScoreFill(score) {
  const value = Number(score) || 0

  if (value >= 7.5) return '#059669'
  if (value >= 5) return '#d97706'
  return '#dc2626'
}

function getGemScoreLabel(score) {
  const value = Number(score) || 0

  if (value >= 8.6) return 'algorithmic anomaly'
  if (value >= 7.8) return 'hidden weapon'
  if (value >= 6.8) return 'cult classic'
  if (value >= 5.4) return 'slept on'
  return 'buried'
}

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
  isPlaybackLoading = false,
  isLiked = false,
  playlists = [],
  onToggleTrackPlayback,
  onLikeTrack,
  onAddToPlaylist,
  onCreatePlaylist,
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const gemScore = Number(track?.gemScore) || 0
  const gemScoreText = gemScore.toFixed(1)
  const [gemScoreWhole, gemScoreDecimal = '0'] = gemScoreText.split('.')
  const gemScoreLabel = getGemScoreLabel(gemScore)

  function handleShareTrack() {
    if (!track) {
      return
    }

    setShareOpen(true)
  }

  const gemScorePercent = Math.max(0, Math.min(gemScore * 10, 100))

  return (
    <aside className="track-details h-full min-h-0 overflow-y-auto border-t border-zinc-200 bg-zinc-50 xl:overflow-hidden xl:border-t-0">
      {!track && (
        <div className="m-3 border border-zinc-300 bg-white p-5 shadow-[0_1px_1px_rgba(0,0,0,0.03)]">
          <EmptyState
            title="No Track Selected"
            description="Choose a track from Discover to inspect details and save it."
          />
        </div>
      )}

      {track && (
        <div className="track-details-layout flex min-h-full flex-col p-2.5">
          <section className="track-details-hero overflow-hidden border border-zinc-200 bg-white">
            <div className="track-details-artwork-wrap">
              <img
                src={track.artworkUrl}
                alt={track.title}
                className="track-details-hero-image h-full w-full object-cover"
                loading="lazy"
              />
              <div className="track-details-hero-scrim" />
              <div className="track-details-hero-copy">
                <div className="space-y-1">
                  <p className="track-details-title">{track.title}</p>
                  <p className="track-details-artist">{track.artist}</p>
                  <p className="track-details-meta">
                    {track.publishedAt?.slice(0, 4) || '2000'} / {track.genre || 'Underground'}
                  </p>
                </div>

                <div className="track-details-play-row">
                  <button
                    type="button"
                    onClick={() => onToggleTrackPlayback(track.id)}
                    className="tooltip-anchor track-details-play-button group"
                    data-tooltip={isPlaybackLoading ? 'Loading this track' : isPlaying ? 'Pause this track' : 'Play this track'}
                  >
                    {isPlaybackLoading ? (
                      <span className="playback-loading-spinner playback-loading-spinner-sm" aria-hidden="true" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        {isPlaying ? <path d="M8 6v12M16 6v12" /> : <path d="m8 6 10 6-10 6V6Z" fill="currentColor" stroke="none" />}
                      </svg>
                    )}
                    {isPlaybackLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
                  </button>
                </div>
              </div>
            </div>

            <div className="track-details-stats">
              <p><span>{compactNumber(track.views)}</span> views</p>
              <p><span>{compactNumber(track.likes)}</span> likes</p>
              <p><span>{compactNumber(track.comments)}</span> comments</p>
            </div>
          </section>

          <section className={`track-details-gem ${getGemScoreTone(track.gemScore)}`}>
            <div className="track-details-gem-head">
              <div className="flex items-center gap-2">
                <StatIcon kind="gem" />
                <p>gem score</p>
              </div>
              <span>{gemScoreLabel}</span>
            </div>
            <div className="track-details-gem-score">
              <span className="track-details-gem-whole">{gemScoreWhole}</span>
              <span className="track-details-gem-dot">.</span>
              <span className="track-details-gem-decimal">{gemScoreDecimal}</span>
            </div>
            <div className="track-details-gem-meter">
              <span
                className="track-details-gem-fill"
                style={{ width: `${gemScorePercent}%`, backgroundColor: getGemScoreFill(track.gemScore) }}
              />
            </div>
          </section>

          <TrackSearchLinks track={track} compact />

          <section className="track-details-action-module">
            <PlaylistSaver
              track={track}
              playlists={playlists}
              onAddToPlaylist={onAddToPlaylist}
              onCreatePlaylist={onCreatePlaylist}
              compact
              variant="bare"
            />

            <div className="track-details-action-row">
              <button
                type="button"
                onClick={() => {
                  if (!isLiked) {
                    onLikeTrack(track.id)
                  }
                }}
                className={[
                  'tooltip-anchor track-details-save-btn group',
                  isLiked
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500',
                ].join(' ')}
                data-tooltip={isLiked ? 'Saved to liked' : 'Save this track to Liked'}
              >
                {isLiked ? <BsCheckLg className="h-4 w-4" /> : <BsHeartFill className="h-4 w-4" />}
                {isLiked ? 'Saved' : 'Save'}
              </button>

              <button
                type="button"
                onClick={handleShareTrack}
                className="tooltip-anchor track-details-share-btn hover-swap"
                data-tooltip="Open share options for this track"
              >
                <span className="hover-swap-text">Share</span>
                <BsShareFill className="hover-swap-icon h-4 w-4" />
              </button>
            </div>
          </section>
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
