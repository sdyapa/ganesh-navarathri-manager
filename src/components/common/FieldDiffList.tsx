import type { FieldChange } from '@/lib/diff'

export function FieldDiffList({ changes }: { changes: FieldChange[] }) {
  return (
    <dl className="field-diff-list">
      {changes.map((c) => (
        <div className="field-diff-list__row" key={c.label}>
          <dt>{c.label}</dt>
          <dd>
            <span className="field-diff-list__from">{c.from || '—'}</span>
            <span aria-hidden="true"> → </span>
            <span className="field-diff-list__to">{c.to || '—'}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
