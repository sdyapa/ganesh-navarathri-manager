import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { YearSwitcher } from './YearSwitcher'
import { DriveBackupReminderBanner } from './DriveBackupReminderBanner'
import { ToastContainer } from '@/components/common/ToastContainer'
import { useAppSettings } from '@/hooks/useYearData'
import { DEFAULT_DISPLAY_NAME } from '@/db/defaults'

export function AppLayout() {
  const displayName = useAppSettings()?.displayName ?? DEFAULT_DISPLAY_NAME
  useEffect(() => {
    document.title = displayName
  }, [displayName])

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        {/* Mobile: the switcher lives inside this bar (hidden entirely on desktop). */}
        <TopBar />
        {/* Desktop: TopBar is hidden there, so this is the only visible switcher — without it,
            there was previously no way to change years at all on a desktop-width screen. */}
        <div className="desktop-year-switcher">
          <YearSwitcher />
        </div>
        <main className="app-shell__content" id="main-content">
          <DriveBackupReminderBanner />
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ToastContainer />
    </div>
  )
}
