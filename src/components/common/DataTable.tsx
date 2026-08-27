import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>
  data: T[]
  rowKey: (row: T) => string
  /** Mobile card rendering — every list in the app is designed card-first on narrow screens
   *  rather than forcing a cramped table (spec "Mobile-Friendly UX"). */
  renderCard: (row: T) => ReactNode
}

export function DataTable<T>({ columns, data, rowKey, renderCard }: DataTableProps<T>) {
  return (
    <>
      <div className="table-responsive table-responsive--desktop">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="record-cards record-cards--mobile">
        {data.map((row) => (
          <div className="record-card" key={rowKey(row)}>
            {renderCard(row)}
          </div>
        ))}
      </div>
    </>
  )
}
