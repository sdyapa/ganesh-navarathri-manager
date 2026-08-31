import { useEffect } from 'react'
import { useEffectiveTheme } from '@/hooks/useTheme'

/** Renders nothing — just keeps `<html data-theme="...">` in sync with the resolved theme, so
 *  every `[data-theme="dark"]` CSS rule in global.css applies app-wide. Mounted once near the
 *  root in App.tsx. */
export function ThemeApplier() {
  const theme = useEffectiveTheme()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return null
}
