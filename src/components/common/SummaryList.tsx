export interface SummaryRow {
  label: string
  value: string
}

/** Plain label/value summary — used in delete confirmations to show exactly what will be
 *  removed (spec explicitly forbids a bare "Are you sure?"). */
export function SummaryList({ rows }: { rows: SummaryRow[] }) {
  return (
    <dl className="field-diff-list">
      {rows.map((r) => (
        <div className="field-diff-list__row" key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
