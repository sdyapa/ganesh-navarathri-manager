import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

export interface DataTableSelection {
  selectedIds: Set<string>
  onToggle: (id: string) => void
  /** Selects/deselects every row currently passed in `data` (typically just the current page). */
  onToggleAll: () => void
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>
  data: T[]
  rowKey: (row: T) => string
  /** Mobile card rendering — every list in the app is designed card-first on narrow screens
   *  rather than forcing a cramped table (spec "Mobile-Friendly UX"). */
  renderCard: (row: T) => ReactNode
  /** Opt-in row-selection checkboxes (desktop table + mobile cards) — omitted by every page
   *  that doesn't need bulk actions, so this changes nothing for them. */
  selection?: DataTableSelection
}

export function DataTable<T>({ columns, data, rowKey, renderCard, selection }: DataTableProps<T>) {
  const allSelected = selection ? data.length > 0 && data.every((row) => selection.selectedIds.has(rowKey(row))) : false

  return (
    <>
      <div className="table-responsive table-responsive--desktop">
        <table className="data-table">
          <thead>
            <tr>
              {selection && (
                <th className="data-table__select-col">
                  <input type="checkbox" aria-label="Select all rows on this page" checked={allSelected} onChange={selection.onToggleAll} />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const id = rowKey(row)
              return (
                <tr key={id}>
                  {selection && (
                    <td className="data-table__select-col">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selection.selectedIds.has(id)}
                        onChange={() => selection.onToggle(id)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="record-cards record-cards--mobile">
        {data.map((row) => {
          const id = rowKey(row)
          return (
            <div className="record-card" key={id}>
              {selection && (
                <label className="record-card__select">
                  <input type="checkbox" checked={selection.selectedIds.has(id)} onChange={() => selection.onToggle(id)} />
                  Select
                </label>
              )}
              {renderCard(row)}
            </div>
          )
        })}
      </div>
    </>
  )
}
