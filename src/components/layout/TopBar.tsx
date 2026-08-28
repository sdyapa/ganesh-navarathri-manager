import { useAppSettings } from '@/hooks/useYearData'
import { DEFAULT_DISPLAY_NAME } from '@/db/defaults'
import { YearSwitcher } from './YearSwitcher'

export function TopBar() {
  const displayName = useAppSettings()?.displayName ?? DEFAULT_DISPLAY_NAME

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span aria-hidden="true">🕉️</span>
        {/* Truncates with an ellipsis if there's no room — the year switcher (the more
            functionally important control) is given priority width in the CSS, and the name
            is user-customizable (Settings › General) so its length can't be assumed. */}
        <span className="top-bar__brand-text" title={displayName}>
          {displayName}
        </span>
      </div>
      <YearSwitcher />
    </header>
  )
}
