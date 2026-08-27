import type { ReactNode } from 'react'

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="filter-field filter-field--search">
      <label className="sr-only" htmlFor="search-input">
        {placeholder}
      </label>
      <input
        id="search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="filter-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  return (
    <div className="filter-field filter-field--date-range">
      <label htmlFor="filter-date-from">From</label>
      <input id="filter-date-from" type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
      <label htmlFor="filter-date-to">To</label>
      <input id="filter-date-to" type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
    </div>
  )
}
