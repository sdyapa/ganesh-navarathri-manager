import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/common/Modal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/common/FormField'
import { SummaryList } from '@/components/common/SummaryList'
import { yearProfileInputSchema } from '@/lib/validation'
import {
  applyCarryForwardOpeningBalance,
  createYearProfile,
  deleteYear,
  findMostRecentPriorYear,
  getYearClosingBalance,
  getYearDeletionImpact,
  renameYearProfile,
  setYearArchived,
} from '@/services/yearService'
import { formatCurrency } from '@/lib/currency'
import type { YearProfile } from '@/types'

export function YearSettings() {
  const { years, currentYearId, setCurrentYearId } = useYearContext()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [showCreate, setShowCreate] = useState(searchParams.get('action') === 'create')
  const [renaming, setRenaming] = useState<YearProfile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<YearProfile | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<Awaited<ReturnType<typeof getYearDeletionImpact>> | null>(null)
  const [carryForwardTarget, setCarryForwardTarget] = useState<{
    year: YearProfile
    source: YearProfile
    newOpeningBalance: number
  } | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState(() => {
    const nextYear = (years[0]?.year ?? new Date().getFullYear() - 1) + 1
    return { year: String(nextYear), name: `Ganesh Navarathri ${nextYear}`, carryForward: true }
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function closeCreate() {
    setShowCreate(false)
    searchParams.delete('action')
    setSearchParams(searchParams, { replace: true })
  }

  async function handleCreate() {
    const parsed = yearProfileInputSchema.safeParse({
      year: Number(form.year),
      name: form.name,
      carryForward: form.carryForward,
    })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setFormErrors(errs)
      return
    }
    setFormErrors({})
    setBusy(true)
    try {
      const created = await createYearProfile(parsed.data)
      setCurrentYearId(created.id)
      closeCreate()
      showToast(`${created.name} created successfully`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create year profile', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleRename() {
    if (!renaming) return
    if (!renameValue.trim()) return
    await renameYearProfile(renaming.id, renameValue)
    setRenaming(null)
    showToast('Year profile renamed')
  }

  async function handleToggleArchive(year: YearProfile) {
    await setYearArchived(year.id, year.status !== 'archived')
    showToast(year.status === 'archived' ? 'Year restored to active' : 'Year archived')
  }

  async function openDelete(year: YearProfile) {
    setDeleteTarget(year)
    const impact = await getYearDeletionImpact(year.id)
    setDeleteImpact(impact)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteYear(deleteTarget.id)
      setDeleteTarget(null)
      setDeleteImpact(null)
      showToast(`${deleteTarget.name} deleted permanently`, 'info')
    } finally {
      setBusy(false)
    }
  }

  async function openCarryForward(year: YearProfile) {
    const source = findMostRecentPriorYear(years, year.year)
    if (!source) return // the button is hidden in this case, but guard anyway
    const newOpeningBalance = await getYearClosingBalance(source.id)
    setCarryForwardTarget({ year, source, newOpeningBalance })
  }

  async function confirmCarryForward() {
    if (!carryForwardTarget) return
    setBusy(true)
    try {
      await applyCarryForwardOpeningBalance(
        carryForwardTarget.year.id,
        carryForwardTarget.source.id,
        carryForwardTarget.newOpeningBalance,
      )
      showToast(`Opening balance updated to ${formatCurrency(carryForwardTarget.newOpeningBalance)}`)
      setCarryForwardTarget(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>Years &amp; Profiles</h2>
        <button type="button" className="button button--primary" onClick={() => setShowCreate(true)}>
          + Create New Year
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Profile Name</th>
              <th>Opening Balance</th>
              <th>Carry Forward</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td>{y.year}</td>
                <td>
                  {y.name} {y.id === currentYearId && <span className="badge badge--success">Current</span>}
                </td>
                <td>{formatCurrency(y.openingBalance)}</td>
                <td>{y.carryForward ? 'Yes' : 'No'}</td>
                <td>{y.status === 'archived' ? 'Archived' : 'Active'}</td>
                <td>
                  <div className="row-actions">
                    {y.id !== currentYearId && (
                      <button type="button" className="link-button" onClick={() => setCurrentYearId(y.id)}>
                        Switch to this year
                      </button>
                    )}
                    {findMostRecentPriorYear(years, y.year) && (
                      <button type="button" className="link-button" onClick={() => openCarryForward(y)}>
                        Carry Forward Balance
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setRenaming(y)
                        setRenameValue(y.name)
                      }}
                    >
                      Rename
                    </button>
                    <button type="button" className="link-button" onClick={() => handleToggleArchive(y)}>
                      {y.status === 'archived' ? 'Unarchive' : 'Archive'}
                    </button>
                    <button type="button" className="link-button link-button--danger" onClick={() => openDelete(y)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal
          title="Create New Year"
          onClose={closeCreate}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={closeCreate} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleCreate} disabled={busy}>
                {busy ? 'Creating…' : 'Create Year'}
              </button>
            </>
          }
        >
          <FormField label="Year" htmlFor="new-year" required error={formErrors.year}>
            <input
              id="new-year"
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </FormField>
          <FormField label="Profile Name" htmlFor="new-year-name" required error={formErrors.name}>
            <input
              id="new-year-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Carry forward previous year balance?" htmlFor="carry-forward">
            <div className="toggle-row">
              <input
                id="carry-forward"
                type="checkbox"
                checked={form.carryForward}
                onChange={(e) => setForm((f) => ({ ...f, carryForward: e.target.checked }))}
              />
              <label htmlFor="carry-forward">
                {form.carryForward
                  ? "Yes — the most recent year's closing balance becomes this year's opening balance."
                  : 'No — this year starts with ₹0 opening balance.'}
              </label>
            </div>
          </FormField>
        </Modal>
      )}

      {renaming && (
        <Modal
          title="Rename Year Profile"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleRename}>
                Save
              </button>
            </>
          }
        >
          <FormField label="Profile Name" htmlFor="rename-input" required>
            <input id="rename-input" type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </FormField>
        </Modal>
      )}

      {deleteTarget && deleteImpact && (
        <ConfirmDialog
          title="Delete Year?"
          description="This will permanently delete this year's profile and every record inside it. This cannot be undone."
          summary={
            <SummaryList
              rows={[
                { label: 'Year', value: `${deleteTarget.year} — ${deleteTarget.name}` },
                { label: 'Donations', value: String(deleteImpact.donations) },
                { label: 'Expected Donations', value: String(deleteImpact.expectedDonations) },
                { label: 'Expenses', value: String(deleteImpact.expenses) },
                { label: 'Expected Expenses', value: String(deleteImpact.expectedExpenses) },
                { label: 'Auctions', value: String(deleteImpact.auctions) },
              ]}
            />
          }
          confirmLabel="Delete Year"
          danger
          requireTypedConfirmation="DELETE"
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteTarget(null)
            setDeleteImpact(null)
          }}
          busy={busy}
        />
      )}

      {carryForwardTarget && (
        <ConfirmDialog
          title="Carry Forward Balance?"
          description={`This replaces ${carryForwardTarget.year.name}'s opening balance with ${carryForwardTarget.source.name}'s closing balance.`}
          summary={
            <SummaryList
              rows={[
                { label: 'Source Year', value: carryForwardTarget.source.name },
                { label: 'Source Year Closing Balance', value: formatCurrency(carryForwardTarget.newOpeningBalance) },
                { label: 'Current Opening Balance', value: formatCurrency(carryForwardTarget.year.openingBalance) },
                { label: 'New Opening Balance', value: formatCurrency(carryForwardTarget.newOpeningBalance) },
              ]}
            />
          }
          confirmLabel="Carry Forward"
          onConfirm={confirmCarryForward}
          onCancel={() => setCarryForwardTarget(null)}
          busy={busy}
        />
      )}
    </div>
  )
}
