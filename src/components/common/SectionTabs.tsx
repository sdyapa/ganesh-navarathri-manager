import { NavLink } from 'react-router-dom'

export interface SectionTab {
  to: string
  label: string
  /** Optional count badge (e.g. how many pending expected records) shown next to the label. */
  count?: number
  end?: boolean
}

/** A visually obvious tab strip for switching between related views on the same page area
 *  (Actual vs. Expected Donations/Expenses) — plain text links were easy to miss as being
 *  clickable, let alone as indicating which one is currently showing. */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          role="tab"
          className={({ isActive }) => `tabs__tab ${isActive ? 'tabs__tab--active' : ''}`}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="badge">{t.count}</span>}
        </NavLink>
      ))}
    </div>
  )
}
