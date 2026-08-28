import { useState } from 'react'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

/**
 * Guards a form modal against losing unsaved input: warns on an actual tab close/refresh, and
 * intercepts an in-app close (Cancel, backdrop click, Escape, the × button — anything that
 * calls the returned `requestClose`) with a discard-confirmation instead of closing silently.
 * `values`/`initialValues` are compared structurally (JSON.stringify) — fine here since every
 * form's values object is a flat record of strings.
 */
export function useCloseGuard<T>(values: T, initialValues: T, onClose: () => void) {
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues)
  useUnsavedChangesGuard(isDirty)
  const [confirming, setConfirming] = useState(false)

  function requestClose() {
    if (isDirty) setConfirming(true)
    else onClose()
  }

  const confirmDialog = confirming ? (
    <ConfirmDialog
      title="Discard Unsaved Changes?"
      description="You have unsaved changes on this form. Closing now will lose them."
      confirmLabel="Discard Changes"
      danger
      onConfirm={() => {
        setConfirming(false)
        onClose()
      }}
      onCancel={() => setConfirming(false)}
    />
  ) : null

  return { requestClose, confirmDialog, isDirty }
}
