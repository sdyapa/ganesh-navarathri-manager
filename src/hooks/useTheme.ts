import { useEffect, useState } from 'react'
import { useAppSettings } from '@/hooks/useYearData'

/** Resolves the *effective* light/dark theme: follows the OS/browser preference live when the
 *  user's setting is "System" (the default), or pins an explicit choice otherwise. See
 *  ThemeApplier (App.tsx) for where this gets applied to the document. */
export function useEffectiveTheme(): 'light' | 'dark' {
  const preference = useAppSettings()?.themePreference ?? 'system'
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}
