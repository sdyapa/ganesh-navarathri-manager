import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems'
import { useAppSettings } from '@/hooks/useYearData'
import { DEFAULT_DISPLAY_NAME } from '@/db/defaults'

export function Sidebar() {
  const displayName = useAppSettings()?.displayName ?? DEFAULT_DISPLAY_NAME

  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <span aria-hidden="true">🕉️</span>
        <span className="sidebar__brand-text">{displayName}</span>
      </div>
      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            >
              <span className="sidebar__icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
