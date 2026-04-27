function encoded(value) {
  return encodeURIComponent(String(value || ''))
}

export function getTrackSharePayload(track) {
  const title = `${track.title} - ${track.artist}`
  const youtubeUrl = track.youtubeVideoId
    ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}`
    : `${window.location.origin}/search?track=${encoded(track.id)}`

  return {
    title,
    text: `Check out this track: ${title}`,
    url: youtubeUrl,
  }
}

export function getPlaylistSharePayload(playlist, tracks = [], path = '/crates') {
  const trackNames = tracks.slice(0, 3).map((track) => track.title).join(', ')
  const preview = trackNames ? ` Top picks: ${trackNames}.` : ''

  return {
    title: `${playlist.name} playlist`,
    text: `Listen to my ${playlist.name} playlist.${preview}`,
    url: `${window.location.origin}${path}?playlist=${encoded(playlist.id)}`,
  }
}

export function buildSocialShareUrl(network, payload) {
  const title = encoded(payload.title)
  const text = encoded(payload.text)
  const url = encoded(payload.url)

  if (network === 'x') {
    return `https://twitter.com/intent/tweet?text=${text}&url=${url}`
  }

  if (network === 'facebook') {
    return `https://www.facebook.com/sharer/sharer.php?u=${url}`
  }

  if (network === 'whatsapp') {
    return `https://wa.me/?text=${text}%20${url}`
  }

  if (network === 'telegram') {
    return `https://t.me/share/url?url=${url}&text=${text}`
  }

  return `https://www.reddit.com/submit?url=${url}&title=${title}`
}

export function openSocialShare(network, payload) {
  const link = buildSocialShareUrl(network, payload)
  window.open(link, '_blank', 'noopener,noreferrer,width=900,height=700')
}

export async function shareOrCopy(payload) {
  if (navigator.share) {
    try {
      await navigator.share(payload)
      return true
    } catch {
      // Fall through to clipboard copy.
    }
  }

  const copyText = `${payload.text} ${payload.url}`
  await navigator.clipboard.writeText(copyText)
  return false
}
