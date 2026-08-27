import { useSearchParams } from 'react-router-dom'
import { YearSettings } from './YearSettings'
import { CategorySettings } from './CategorySettings'
import { UnitSettings } from './UnitSettings'
import { WhatsAppSettings } from './WhatsAppSettings'
import { DataManagement } from './DataManagement'
import { GoogleDriveSettings } from './GoogleDriveSettings'

const SECTIONS = [
  { key: 'years', label: 'Years & Profiles' },
  { key: 'categories', label: 'Categories' },
  { key: 'units', label: 'Units' },
  { key: 'whatsapp', label: 'WhatsApp Templates' },
  { key: 'data', label: 'Data Management' },
  { key: 'google', label: 'Google Drive' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = (searchParams.get('section') as SectionKey) || 'years'

  const setSection = (key: SectionKey) => {
    setSearchParams({ section: key })
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            className={`settings-tabs__tab ${section === s.key ? 'settings-tabs__tab--active' : ''}`}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="settings-panel">
        {section === 'years' && <YearSettings />}
        {section === 'categories' && <CategorySettings />}
        {section === 'units' && <UnitSettings />}
        {section === 'whatsapp' && <WhatsAppSettings />}
        {section === 'data' && <DataManagement />}
        {section === 'google' && <GoogleDriveSettings />}
      </div>
    </div>
  )
}
