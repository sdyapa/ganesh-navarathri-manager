import { useToast } from '@/context/ToastContext'

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action?.onClick()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
