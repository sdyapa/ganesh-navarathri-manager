import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  description?: ReactNode
  /** Rich summary of exactly what will be affected — never a bare "Are you sure?" */
  summary?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** When set, the Confirm button stays disabled until the user types this exact word. */
  requireTypedConfirmation?: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

export function ConfirmDialog({
  title,
  description,
  summary,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requireTypedConfirmation,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('')
  const canConfirm = !requireTypedConfirmation || typedValue.trim() === requireTypedConfirmation

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${danger ? 'button--danger' : 'button--primary'}`}
            onClick={onConfirm}
            disabled={!canConfirm || busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      {description && <p className="confirm-dialog__description">{description}</p>}
      {summary && <div className="confirm-dialog__summary">{summary}</div>}
      {requireTypedConfirmation && (
        <div className="form-field">
          <label htmlFor="confirm-typed-input">
            Type <strong>{requireTypedConfirmation}</strong> to confirm
          </label>
          <input
            id="confirm-typed-input"
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}
    </Modal>
  )
}
