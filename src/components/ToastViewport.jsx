import { BsCheckCircleFill, BsExclamationTriangleFill, BsInfoCircleFill, BsX } from 'react-icons/bs'

function getToastClasses(tone) {
  if (tone === 'error') {
    return {
      shell: 'border-red-300 bg-red-50 text-red-950',
      icon: 'text-red-600',
      Icon: BsExclamationTriangleFill,
    }
  }

  if (tone === 'info') {
    return {
      shell: 'border-sky-300 bg-sky-50 text-sky-950',
      icon: 'text-sky-600',
      Icon: BsInfoCircleFill,
    }
  }

  return {
    shell: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    icon: 'text-emerald-600',
    Icon: BsCheckCircleFill,
  }
}

function ToastViewport({ toasts = [], onDismiss }) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[10000] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const { shell, icon, Icon } = getToastClasses(toast.tone)

        return (
          <div
            key={toast.id}
            className={`toast-item pointer-events-auto flex items-start gap-3 rounded-2xl border px-3 py-3 shadow-xl ${toast.exiting ? 'toast-item-exiting' : ''} ${shell}`}
            role="status"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="mt-0.5 text-xs opacity-80">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              className="rounded-full p-1 opacity-70 transition hover:bg-black/10 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <BsX className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default ToastViewport
