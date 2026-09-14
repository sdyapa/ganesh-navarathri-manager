import { useEffect, useMemo, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { useInventoryItems } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter } from '@/components/common/Filters'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SummaryList } from '@/components/common/SummaryList'
import { ActionButton } from '@/components/common/ActionButton'
import { CopyToYearModal, NEXT_YEAR_VALUE } from '@/components/common/CopyToYearModal'
import { InventoryForm, defaultInventoryFormValues, inventoryItemToFormValues } from './InventoryForm'
import {
  insertInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  markInventoryItemReturned,
  markInventoryItemStored,
  getInventoryItemsByIds,
} from '@/db/repositories/inventoryItems'
import { copyInventoryItemsToYear } from '@/services/copyForwardService'
import { getOrCreateNextYearProfile } from '@/services/yearService'
import { formatDisplayDate } from '@/lib/date'
import { matchesSearch } from '@/lib/tableUtils'
import { pluralize } from '@/lib/pluralize'
import { EDIT_ICON, DELETE_ICON, DONE_ICON, UNDO_DONE_ICON } from '@/lib/actionIcons'
import type { InventoryItemInput } from '@/lib/validation'
import type { InventoryItem, YearProfile } from '@/types'

type ModalState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; item: InventoryItem } | { mode: 'copy' }

/** Resolves each carried-forward item's source year name for the "Carried from {year}" line —
 *  a source item's own yearProfileId isn't known without fetching it, so this batches one
 *  lookup for every item on screen that has a sourceInventoryItemId, rather than one per card. */
function useSourceYearNames(items: InventoryItem[], years: YearProfile[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const sourceIds = useMemo(
    () => items.map((i) => i.sourceInventoryItemId).filter((id): id is string => Boolean(id)),
    [items],
  )
  useEffect(() => {
    let cancelled = false
    if (sourceIds.length === 0) {
      setNames({})
      return
    }
    getInventoryItemsByIds(sourceIds).then((sources) => {
      if (cancelled) return
      const yearById = new Map(years.map((y) => [y.id, y.name]))
      const map: Record<string, string> = {}
      for (const item of items) {
        if (!item.sourceInventoryItemId) continue
        const source = sources.find((s) => s.id === item.sourceInventoryItemId)
        if (source) map[item.id] = yearById.get(source.yearProfileId) ?? 'a prior year'
      }
      setNames(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds.join(','), years])
  return names
}

export function InventoryPage() {
  const { currentYearId, currentYear, years } = useYearContext()
  const items = useInventoryItems(currentYearId)
  const { showToast } = useToast()

  const [modal, setModal] = useState<ModalState>({ mode: 'closed' })
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('stored')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!items) return []
    return items
      .filter((i) => (statusFilter ? i.status === statusFilter : true))
      .filter((i) => matchesSearch([i.itemName, i.keptWith, i.notes], search))
      .sort((a, b) => a.itemName.localeCompare(b.itemName))
  }, [items, statusFilter, search])

  const sourceYearNames = useSourceYearNames(filtered, years)

  if (!currentYearId || items === undefined) {
    return <p className="page-loading">Loading inventory…</p>
  }

  async function handleAdd(input: InventoryItemInput) {
    await insertInventoryItem(currentYearId!, input)
    setModal({ mode: 'closed' })
    showToast('Inventory item added')
  }

  async function handleEdit(item: InventoryItem, input: InventoryItemInput) {
    await updateInventoryItem(item.id, input)
    setModal({ mode: 'closed' })
    showToast('Inventory item updated')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteInventoryItem(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Inventory item deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCopyToYear(targetYearSelection: string) {
    if (!currentYearId || !currentYear) return
    setBusy(true)
    try {
      const { targetYearId, targetYearName } =
        targetYearSelection === NEXT_YEAR_VALUE
          ? await getOrCreateNextYearProfile(currentYearId).then((r) => ({ targetYearId: r.profile.id, targetYearName: r.profile.name }))
          : { targetYearId: targetYearSelection, targetYearName: years.find((y) => y.id === targetYearSelection)?.name ?? 'target year' }
      const count = await copyInventoryItemsToYear([...selectedIds], targetYearId)
      setSelectedIds(new Set())
      setModal({ mode: 'closed' })
      showToast(`Copied ${pluralize(count, 'item')} to ${targetYearName} — mark each one returned there once it actually comes back`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Inventory</h1>
          <p className="page__subtitle">
            Equipment kept at committee members' homes between festivals — speakers, amplifiers, carpets, lights, and
            so on.
          </p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No inventory items yet"
          description="Track equipment stored at committee members' homes between festivals."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Item
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search item, kept with, notes…" />
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'stored', label: 'Stored' },
                { value: 'returned', label: 'Returned' },
              ]}
            />
          </FilterBar>

          {selectedIds.size > 0 && (
            <div className="row-actions">
              <button type="button" className="button button--secondary" onClick={() => setModal({ mode: 'copy' })}>
                Copy {pluralize(selectedIds.size, 'item')} to Next Year
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="No matching items" description="Try adjusting your filters." />
          ) : (
            <div className="card-list">
              {filtered.map((i) => (
                <div key={i.id} className="record-card">
                  {i.status === 'stored' && (
                    <label className="record-card__select">
                      <input type="checkbox" checked={selectedIds.has(i.id)} onChange={() => toggleSelected(i.id)} />
                      Select
                    </label>
                  )}
                  <div className="record-card__top">
                    <strong>
                      {i.itemName}
                      {i.quantity !== undefined ? ` (${i.quantity})` : ''}
                    </strong>
                    {i.status === 'returned' ? <span className="badge badge--success">Returned</span> : <span className="badge">Stored</span>}
                  </div>
                  <div className="record-card__meta">
                    Kept with {i.keptWith} · Since {formatDisplayDate(i.storedDate)}
                    {i.status === 'returned' && i.returnedDate && <> · Returned {formatDisplayDate(i.returnedDate)}</>}
                  </div>
                  {sourceYearNames[i.id] && <div className="record-card__meta">Carried from {sourceYearNames[i.id]}</div>}
                  {i.notes && <div className="record-card__notes">{i.notes}</div>}
                  <div className="row-actions">
                    <ActionButton
                      icon={i.status === 'returned' ? UNDO_DONE_ICON : DONE_ICON}
                      label={i.status === 'returned' ? 'Mark Stored' : 'Mark Returned'}
                      onClick={() => (i.status === 'returned' ? markInventoryItemStored(i.id) : markInventoryItemReturned(i.id))}
                    />
                    <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', item: i })} />
                    <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(i)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal.mode === 'add' && (
        <InventoryForm
          title="Add Inventory Item"
          submitLabel="Save Item"
          initialValues={defaultInventoryFormValues()}
          onSubmit={handleAdd}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'edit' && (
        <InventoryForm
          title="Edit Inventory Item"
          submitLabel="Save Changes"
          initialValues={inventoryItemToFormValues(modal.item)}
          onSubmit={(input) => handleEdit(modal.item, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'copy' && currentYear && (
        <CopyToYearModal
          title="Copy Inventory Items to Another Year"
          itemLabel={pluralize(selectedIds.size, 'item')}
          description={`This copies ${pluralize(selectedIds.size, 'item')} into the target year as a reconciliation checklist — each one starts fresh as "Stored" there so you can mark it returned once it actually comes back. The item here in ${currentYear.name} is left untouched.`}
          sourceYear={currentYear}
          years={years}
          busy={busy}
          onConfirm={handleCopyToYear}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Inventory Item?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Item', value: deleteTarget.itemName },
                { label: 'Kept With', value: deleteTarget.keptWith },
                { label: 'Stored Since', value: formatDisplayDate(deleteTarget.storedDate) },
              ]}
            />
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  )
}
