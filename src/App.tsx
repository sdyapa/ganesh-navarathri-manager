import { Suspense, lazy } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { YearProvider } from '@/context/YearContext'
import { ToastProvider } from '@/context/ToastContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { DonationsPage } from '@/pages/donations/DonationsPage'
import { ExpectedDonationsPage } from '@/pages/donations/ExpectedDonationsPage'
import { ExpensesPage } from '@/pages/expenses/ExpensesPage'
import { ExpectedExpensesPage } from '@/pages/expenses/ExpectedExpensesPage'
import { AuctionsPage } from '@/pages/auctions/AuctionsPage'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { CalendarPage } from '@/pages/calendar/CalendarPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

// Reports is the only screen that needs Chart.js, which is large — loading it lazily keeps
// it out of every other page's initial bundle (spec "Performance": lazy-load charts/reports).
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

// HashRouter is used deliberately: GitHub Pages serves static files with no server-side
// rewrite, so a browser-router path like /donations 404s on refresh unless a 404.html trick
// is added. Hash-based routes (/#/donations) always resolve to index.html regardless of host
// configuration, which matters a lot for a project meant to be forked and deployed by
// non-technical users.
export function App() {
  return (
    <ToastProvider>
      <YearProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/donations" element={<DonationsPage />} />
              <Route path="/donations/expected" element={<ExpectedDonationsPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/expenses/expected" element={<ExpectedExpensesPage />} />
              <Route path="/auctions" element={<AuctionsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route
                path="/reports"
                element={
                  <Suspense fallback={<p className="page-loading">Loading reports…</p>}>
                    <ReportsPage />
                  </Suspense>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </HashRouter>
      </YearProvider>
    </ToastProvider>
  )
}
