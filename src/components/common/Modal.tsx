import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

// Tracks how many Modals are currently mounted at once, app-wide — a form's own Modal plus a
// "Discard Unsaved Changes?"/"Confirm Changes" Modal opened on top of it (via useCloseGuard or
// the edit-confirm flow) are common, and each Modal used to independently save/restore
// document.body.style.overflow on its own mount/unmount. When two stacked modals unmounted
// together, whichever cleanup ran last would restore the OUTER modal's saved value — 'hidden',
// captured while the first modal was already open — permanently freezing page scroll/
// interaction after closing both (see the "discard freezes the app" bug this fixed). A shared
// counter fixes it: overflow is set to 'hidden' only when the count goes 0 -> 1, and only
// restored to its true original value when the count goes back to 0.
let openModalCount = 0
let overflowBeforeAnyModal = ''

export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Read via a ref inside the effect below rather than listing onClose as a dependency —
  // callers typically pass a fresh inline function (or, as with useCloseGuard's requestClose,
  // a non-memoized closure) on every render, which previously re-ran the mount effect on every
  // keystroke inside the form and called dialogRef.current?.focus(), yanking focus away from
  // whatever input the user was typing into. The ref keeps Escape always calling the latest
  // onClose without that effect re-running on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    dialogRef.current?.focus()
    if (openModalCount === 0) overflowBeforeAnyModal = document.body.style.overflow
    openModalCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openModalCount -= 1
      if (openModalCount === 0) document.body.style.overflow = overflowBeforeAnyModal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount/unmount only, see comment above
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal__header">
          <h2 id="modal-title" className="modal__title">
            {title}
          </h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
