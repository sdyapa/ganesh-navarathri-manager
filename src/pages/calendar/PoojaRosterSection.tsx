import { useMemo, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { usePoojaAssignments } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { insertPoojaAssignment, updatePoojaAssignment, deletePoojaAssignment } from '@/db/repositories/poojaAssignments'
import { poojaAssignmentInputSchema } from '@/lib/validation'
import { compareDateOnly, formatDisplayDate, todayDateOnly } from '@/lib/date'
import type { PoojaAssignment } from '@/types'

interface DraftFields {
  date: string
  familyNames: string
  notes: string
}

function emptyDraft(): DraftFields {
  return { date: todayDateOnly(), familyNames: '', notes: '' }
}

export function PoojaRosterSection() {
  const { currentYearId } = useYearContext()
  const assignments = usePoojaAssignments(currentYearId)
  const { showToast } = useToast()
  const [draft, setDraft] = useState<DraftFields>(emptyDraft())
  const [editing, setEditing] = useState<{ id: string; fields: DraftFields } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PoojaAssignment | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => [...(assignments ?? [])].sort((a, b) => compareDateOnly(a.date, b.date)), [assignments])

  if (!currentYearId || assignments === undefined) {
    return <p className="page-loading">Loading pooja roster…</p>
  }

  async function handleAdd() {
    const parsed = poojaAssignmentInputSchema.safeParse({
      date: draft.date,
      familyNames: draft.familyNames,
      notes: draft.notes || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    await insertPoojaAssignment(currentYearId!, parsed.data)
    setDraft(emptyDraft())
    showToast('Pooja roster entry added')
  }

  async function handleSaveEdit() {
    if (!editing) return
    const parsed = poojaAssignmentInputSchema.safeParse({
      date: editing.fields.date,
      familyNames: editing.fields.familyNames,
      notes: editing.fields.notes || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    await updatePoojaAssignment(editing.id, parsed.data)
    setEditing(null)
    showToast('Pooja roster entry updated')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deletePoojaAssignment(deleteTarget.id)
    setDeleteTarget(null)
    showToast('Pooja roster entry deleted', 'info')
  }

  return (
    <div className="settings-section">
      <p className="page__note">
        Which family/families performed pooja on a given day, up to immersion day. One entry per day — add as many
        family names as needed, comma-separated.
      </p>

      {sorted.length === 0 ? (
        <EmptyState title="No pooja roster entries yet" description="Track which family performed pooja each day." />
      ) : (
        <ul className="manage-list">
          {sorted.map((a) =>
            editing?.id === a.id ? (
              <li key={a.id} className="manage-list__item">
                <div className="inline-form">
                  <input
                    type="date"
                    value={editing.fields.date}
                    onChange={(e) => setEditing({ id: a.id, fields: { ...editing.fields, date: e.target.value } })}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Family name(s), comma-separated"
                    value={editing.fields.familyNames}
                    onChange={(e) => setEditing({ id: a.id, fields: { ...editing.fields, familyNames: e.target.value } })}
                  />
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={editing.fields.notes}
                    onChange={(e) => setEditing({ id: a.id, fields: { ...editing.fields, notes: e.target.value } })}
                  />
                </div>
                <div className="row-actions">
                  <button type="button" className="link-button" onClick={handleSaveEdit}>
                    Save
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={a.id} className="manage-list__item">
                <span className="manage-list__label">
                  {formatDisplayDate(a.date)} — {a.familyNames}
                  {a.notes && <span className="text-muted"> ({a.notes})</span>}
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setEditing({ id: a.id, fields: { date: a.date, familyNames: a.familyNames, notes: a.notes ?? '' } })}
                  >
                    Edit
                  </button>
                  <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(a)}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="inline-form">
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <input
          type="text"
          placeholder="Family name(s), comma-separated"
          value={draft.familyNames}
          onChange={(e) => setDraft({ ...draft, familyNames: e.target.value })}
        />
        <input type="text" placeholder="Notes (optional)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        <button type="button" className="button button--secondary" onClick={handleAdd}>
          + Add Entry
        </button>
      </div>
      {error && (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Pooja Roster Entry?"
          description={`The entry for ${formatDisplayDate(deleteTarget.date)} will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
