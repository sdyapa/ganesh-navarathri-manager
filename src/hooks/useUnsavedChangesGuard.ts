import { useEffect } from 'react'

/** Warns before an actual browser tab close/refresh while a form has unsaved edits. Pairs
 *  with a form's own "confirm before closing the modal" prompt for in-app navigation — the
 *  two together cover both ways a half-filled Add/Edit form can otherwise vanish silently. */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}
