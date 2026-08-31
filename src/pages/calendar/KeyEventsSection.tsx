import { useMemo, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { useKeyEvents } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { insertKeyEvent, updateKeyEvent, deleteKeyEvent } from '@/db/repositories/keyEvents'
import { keyEventInputSchema } from '@/lib/validation'
import { compareDateOnly, formatDisplayDate, todayDateOnly } from '@/lib/date'
import type { KeyEvent } from '@/types'

interface DraftFields {
  name: string
  date: string
  notes: string
}

function emptyDraft(): DraftFields {
  return { name: '', date: todayDateOnly(), notes: '' }
}

export function KeyEventsSection() {
  const { currentYearId } = useYearContext()
  const events = useKeyEvents(currentYearId)
  const { showToast } = useToast()
  const [draft, setDraft] = useState<DraftFields>(emptyDraft())
  const [editing, setEditing] = useState<{ id: string; fields: DraftFields } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<KeyEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(() => [...(events ?? [])].sort((a, b) => compareDateOnly(a.date, b.date)), [events])

  if (!currentYearId || events === undefined) {
    return <p className="page-loading">Loading key events…</p>
  }

  async function handleAdd() {
    const parsed = keyEventInputSchema.safeParse({ name: draft.name, date: draft.date, notes: draft.notes || undefined })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    await insertKeyEvent(currentYearId!, parsed.data)
    setDraft(emptyDraft())
    showToast('Key event added')
  }

  async function handleSaveEdit() {
    if (!editing) return
    const parsed = keyEventInputSchema.safeParse({
      name: editing.fields.name,
      date: editing.fields.date,
      notes: editing.fields.notes || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    await updateKeyEvent(editing.id, parsed.data)
    setEditing(null)
    showToast('Key event updated')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteKeyEvent(deleteTarget.id)
    setDeleteTarget(null)
    showToast('Key event deleted', 'info')
  }

  return (
    <div className="settings-section">
      <p className="page__note">
        Named festival milestones — Annadanam, Nimajjanam (idol immersion), Kumkumarchana, or anything else relevant
        this year. Add only what applies; nothing is required.
      </p>

      {sorted.length === 0 ? (
        <EmptyState title="No key events added yet" description="Add dates like Annadanam, Nimajjanam, or Kumkumarchana." />
      ) : (
        <ul className="manage-list">
          {sorted.map((ev) =>
            editing?.id === ev.id ? (
              <li key={ev.id} className="manage-list__item">
                <div className="inline-form">
                  <input
                    type="text"
                    value={editing.fields.name}
                    onChange={(e) => setEditing({ id: ev.id, fields: { ...editing.fields, name: e.target.value } })}
                    autoFocus
                  />
                  <input
                    type="date"
                    value={editing.fields.date}
                    onChange={(e) => setEditing({ id: ev.id, fields: { ...editing.fields, date: e.target.value } })}
                  />
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={editing.fields.notes}
                    onChange={(e) => setEditing({ id: ev.id, fields: { ...editing.fields, notes: e.target.value } })}
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
              <li key={ev.id} className="manage-list__item">
                <span className="manage-list__label">
                  {formatDisplayDate(ev.date)} — {ev.name}
                  {ev.notes && <span className="text-muted"> ({ev.notes})</span>}
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setEditing({ id: ev.id, fields: { name: ev.name, date: ev.date, notes: ev.notes ?? '' } })}
                  >
                    Edit
                  </button>
                  <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(ev)}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="inline-form">
        <input type="text" placeholder="Event name (e.g. Nimajjanam)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <input type="text" placeholder="Notes (optional)" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        <button type="button" className="button button--secondary" onClick={handleAdd}>
          + Add Event
        </button>
      </div>
      {error && (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Key Event?"
          description={`"${deleteTarget.name}" on ${formatDisplayDate(deleteTarget.date)} will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
