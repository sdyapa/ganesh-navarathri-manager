import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useCategories, useExpectedDonations, useUnits } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SummaryList } from '@/components/common/SummaryList'
import { DonationForm, defaultDonationFormValues, donationToFormValues } from './DonationForm'
import {
  insertExpectedDonation,
  updateExpectedDonation,
  deleteExpectedDonation,
} from '@/db/repositories/expectedDonations'
import { convertExpectedDonationToDonation } from '@/services/conversionService'
import { formatCurrency, formatNumber } from '@/lib/currency'
import { formatDisplayDate, todayDateOnly } from '@/lib/date'
import { matchesSearch } from '@/lib/tableUtils'
import type { DonationInput } from '@/lib/validation'
import type { ExpectedDonation } from '@/types'

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; record: ExpectedDonation }
  | { mode: 'convert'; record: ExpectedDonation }

export function ExpectedDonationsPage() {
  const { currentYearId } = useYearContext()
  const records = useExpectedDonations(currentYearId)
  const categories = useCategories('donation')
  const units = useUnits()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [deleteTarget, setDeleteTarget] = useState<ExpectedDonation | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const unitName = (id?: string) => units?.find((u) => u.id === id)?.name ?? ''

  const filtered = useMemo(() => {
    if (!records) return []
    return records
      .filter((d) => (statusFilter ? d.status === statusFilter : true))
      .filter((d) => matchesSearch([d.donorName, d.commodityName, d.notes], search))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [records, statusFilter, search])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || records === undefined || categories === undefined || units === undefined) {
    return <p className="page-loading">Loading expected donations…</p>
  }

  async function handleAdd(input: DonationInput) {
    await insertExpectedDonation(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Expected donation added')
  }

  async function handleEdit(record: ExpectedDonation, input: DonationInput) {
    await updateExpectedDonation(record.id, input)
    setModal({ mode: 'closed' })
    showToast('Expected donation updated')
  }

  async function handleConvert(record: ExpectedDonation, input: DonationInput) {
    setBusy(true)
    try {
      await convertExpectedDonationToDonation(record.id, currentYearId!, input)
      setModal({ mode: 'closed' })
      showToast('Converted to actual donation successfully')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteExpectedDonation(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Expected donation deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  const columns: Array<DataTableColumn<ExpectedDonation>> = [
    { key: 'date', header: 'Expected Date', render: (d) => formatDisplayDate(d.date) },
    { key: 'donor', header: 'Donor', render: (d) => d.donorName },
    { key: 'type', header: 'Type', render: (d) => (d.type === 'monetary' ? 'Monetary' : 'Commodity') },
    {
      key: 'amount',
      header: 'Amount / Commodity',
      align: 'right',
      render: (d) => (d.type === 'monetary' ? formatCurrency(d.amount) : `${d.commodityName} (${formatNumber(d.quantity)} ${unitName(d.unitId)})`),
    },
    { key: 'category', header: 'Category', render: (d) => categoryName(d.categoryId) },
    { key: 'status', header: 'Status', render: (d) => (d.status === 'converted' ? <span className="badge badge--success">Converted</span> : <span className="badge">Pending</span>) },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) =>
        d.status === 'pending' ? (
          <div className="row-actions">
            <button type="button" className="link-button" onClick={() => setModal({ mode: 'convert', record: d })}>
              Convert to Donation
            </button>
            <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', record: d })}>
              Edit
            </button>
            <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(d)}>
              Delete
            </button>
          </div>
        ) : (
          <span className="text-muted">Already converted</span>
        ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Expected Donations</h1>
          <p className="page__subtitle">
            <Link to="/donations">Actual Donations</Link> · <Link to="/donations/expected">Expected Donations</Link>
          </p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Expected Donation
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState
          title="No expected donations yet"
          description="Track donations that have been promised but not yet received."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Expected Donation
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search donor, commodity, notes…" />
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'converted', label: 'Converted' },
              ]}
            />
          </FilterBar>

          {filtered.length === 0 ? (
            <EmptyState title="No matching records" description="Try adjusting your search or filters." />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={pageItems}
                rowKey={(d) => d.id}
                renderCard={(d) => (
                  <>
                    <div className="record-card__top">
                      <strong>{d.donorName}</strong>
                      {d.status === 'converted' ? <span className="badge badge--success">Converted</span> : <span className="badge">Pending</span>}
                    </div>
                    <div className="record-card__amount">
                      {d.type === 'monetary' ? formatCurrency(d.amount) : `${d.commodityName} — ${formatNumber(d.quantity)} ${unitName(d.unitId)}`}
                    </div>
                    <div className="record-card__meta">
                      Expected {formatDisplayDate(d.date)} · {categoryName(d.categoryId)}
                    </div>
                    {d.status === 'pending' && (
                      <div className="row-actions">
                        <button type="button" className="link-button" onClick={() => setModal({ mode: 'convert', record: d })}>
                          Convert to Donation
                        </button>
                        <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', record: d })}>
                          Edit
                        </button>
                        <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(d)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              />
              <Pagination page={page} totalPages={totalPages} hasNext={hasNext} hasPrev={hasPrev} onNext={next} onPrev={prev} />
            </>
          )}
        </>
      )}

      {modal.mode === 'add' && (
        <DonationForm
          title="Add Expected Donation"
          submitLabel="Save"
          initialValues={defaultDonationFormValues(categories, units)}
          categories={categories}
          units={units}
          onSubmit={handleAdd}
          onClose={() => {
            setModal({ mode: 'closed' })
            searchParams.delete('add')
            setSearchParams(searchParams, { replace: true })
          }}
        />
      )}

      {modal.mode === 'edit' && (
        <DonationForm
          title="Edit Expected Donation"
          submitLabel="Save Changes"
          initialValues={donationToFormValues(modal.record)}
          categories={categories}
          units={units}
          onSubmit={(input) => handleEdit(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'convert' && (
        <DonationForm
          title="Convert to Donation"
          submitLabel={busy ? 'Converting…' : 'Confirm & Create Donation'}
          initialValues={donationToFormValues(modal.record, todayDateOnly())}
          categories={categories}
          units={units}
          onSubmit={(input) => handleConvert(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Expected Donation?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Donor', value: deleteTarget.donorName },
                { label: 'Type', value: deleteTarget.type === 'monetary' ? 'Monetary' : 'Commodity' },
                { label: 'Expected Date', value: formatDisplayDate(deleteTarget.date) },
                { label: 'Category', value: categoryName(deleteTarget.categoryId) },
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
