import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'

const CREATE_NEW_VALUE = '__create_new__'

// This renders twice in the DOM at once — once inside the mobile-only TopBar, once for
// desktop (TopBar is hidden there via CSS, so it needs its own visible instance) — both bound
// to the same YearContext, so picking a year in either updates both immediately. useId keeps
// their <select>/<label> pairs from colliding on a duplicate hardcoded id.
export function YearSwitcher() {
  const { years, currentYearId, setCurrentYearId } = useYearContext()
  const navigate = useNavigate()
  const selectId = useId()

  return (
    <div className="year-switcher">
      <label htmlFor={selectId} className="sr-only">
        Select year
      </label>
      <select
        id={selectId}
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
