import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { ToastContainer } from '@/components/common/ToastContainer'

export function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar />
        <main className="app-shell__content" id="main-content">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ToastContainer />
    </div>
  )
}
