import { useSearchParams } from 'react-router-dom'
import { KeyEventsSection } from './KeyEventsSection'
import { PoojaRosterSection } from './PoojaRosterSection'

const SECTIONS = [
  { key: 'events', label: 'Key Events' },
  { key: 'roster', label: 'Pooja Roster' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = (searchParams.get('view') as SectionKey) || 'events'

  return (
    <div className="page">
      <div className="page__header">
        <h1>Calendar</h1>
      </div>

      <div className="tabs" role="tablist" aria-label="Calendar sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            className={`tabs__tab ${section === s.key ? 'tabs__tab--active' : ''}`}
            onClick={() => setSearchParams({ view: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="settings-panel">
        {section === 'events' && <KeyEventsSection />}
        {section === 'roster' && <PoojaRosterSection />}
      </div>
    </div>
  )
}
