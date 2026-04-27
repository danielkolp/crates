import { openSocialShare, shareOrCopy } from '../utils/share'

function ShareModal({ open, payload, title = 'Share', onClose }) {
  if (!open || !payload) {
    return null
  }

  async function handleShare() {
    await shareOrCopy(payload)
    onClose()
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(payload.url)
    onClose()
  }

  function handleSocial(network) {
    openSocialShare(network, payload)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{payload.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            Share
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            Copy Link
          </button>
          <button
            type="button"
            onClick={() => handleSocial('x')}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            X
          </button>
          <button
            type="button"
            onClick={() => handleSocial('facebook')}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() => handleSocial('whatsapp')}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => handleSocial('telegram')}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            Telegram
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShareModal
