import { useNavigate } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'

const CREATE_NEW_VALUE = '__create_new__'

export function YearSwitcher() {
  const { years, currentYearId, setCurrentYearId } = useYearContext()
  const navigate = useNavigate()

  return (
    <div className="year-switcher">
      <label htmlFor="year-switcher-select" className="sr-only">
        Select year
      </label>
      <select
        id="year-switcher-select"
        value={currentYearId ?? ''}
        onChange={(e) => {
          if (e.target.value === CREATE_NEW_VALUE) {
            navigate('/settings?section=years&action=create')
            return
          }
          setCurrentYearId(e.target.value)
        }}
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name} {y.status === 'archived' ? '(Archived)' : ''}
          </option>
        ))}
        <option value={CREATE_NEW_VALUE}>+ Create new year…</option>
      </select>
    </div>
  )
}
