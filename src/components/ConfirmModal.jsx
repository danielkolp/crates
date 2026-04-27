function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', onConfirm, onCancel }) {
  if (!open) {
    return null
  }

  const confirmClasses =
    tone === 'danger'
      ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
      : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium transition hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal