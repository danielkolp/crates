function YouTubePlayer({ youtubeVideoId, title = 'YouTube video', collapsed = true, autoPlay = false }) {
  if (!youtubeVideoId || collapsed) {
    return null
  }

  // TODO(IFrame API): Replace plain iframe with the YouTube IFrame Player API
  // when playback controls need tighter sync with app state.
  const embedUrl = new URL(`https://www.youtube.com/embed/${youtubeVideoId}`)
  embedUrl.searchParams.set('autoplay', autoPlay ? '1' : '0')
  embedUrl.searchParams.set('mute', '0')
  embedUrl.searchParams.set('playsinline', '1')
  embedUrl.searchParams.set('enablejsapi', '1')
  embedUrl.searchParams.set('rel', '0')

  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-2">
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <iframe
          src={embedUrl.toString()}
          title={title}
          loading={autoPlay ? 'eager' : 'lazy'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="aspect-video w-full"
        />
      </div>
    </div>
  )
}

export default YouTubePlayer
