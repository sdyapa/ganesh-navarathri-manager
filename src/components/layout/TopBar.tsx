import { YearSwitcher } from './YearSwitcher'

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span aria-hidden="true">🕉️</span> Ganesh Navarathri Manager
      </div>
      <YearSwitcher />
    </header>
  )
}
