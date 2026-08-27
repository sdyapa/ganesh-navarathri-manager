import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { generateId } from '@/lib/id'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastMessage {
  id: string
  kind: ToastKind
  text: string
  action?: ToastAction
}

interface ToastContextValue {
  toasts: ToastMessage[]
  showToast: (text: string, kind?: ToastKind, action?: ToastAction) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (text: string, kind: ToastKind = 'success', action?: ToastAction) => {
      const id = generateId()
      setToasts((prev) => [...prev, { id, kind, text, action }])
      const timer = setTimeout(() => dismissToast(id), action ? 6000 : 3500)
      timers.current.set(id, timer)
    },
    [dismissToast],
  )

  return <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
