import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useCategories, useDonations, useExpectedDonations, useUnits } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { useWhatsAppShare } from '@/hooks/useWhatsAppShare'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { SectionTabs } from '@/components/common/SectionTabs'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter, SortControl } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SummaryList } from '@/components/common/SummaryList'
import { FieldDiffList } from '@/components/common/FieldDiffList'
import { ActionButton } from '@/components/common/ActionButton'
import { DonationForm, defaultDonationFormValues, donationToFormValues } from './DonationForm'
import {
  insertExpectedDonation,
  updateExpectedDonation,
  deleteExpectedDonation,
} from '@/db/repositories/expectedDonations'
import { convertExpectedDonationToDonation, recordPartialPayment } from '@/services/conversionService'
import { formatCurrency, formatNumber } from '@/lib/currency'
import { formatDisplayDate, todayDateOnly } from '@/lib/date'
import { matchesSearch, sortByKey, type SortDirection } from '@/lib/tableUtils'
import { computeOutstandingPledgeAmount } from '@/lib/calculations'
import { diffFields } from '@/lib/diff'
import { EDIT_ICON, DELETE_ICON, DUPLICATE_ICON, MOVE_ICON, PARTIAL_PAYMENT_ICON } from '@/lib/actionIcons'
import type { DonationInput } from '@/lib/validation'
import type { ExpectedDonation } from '@/types'

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; record: ExpectedDonation }
  | { mode: 'duplicate'; record: ExpectedDonation }
  | { mode: 'convert'; record: ExpectedDonation }
  | { mode: 'partial-payment'; record: ExpectedDonation }

function statusBadge(status: ExpectedDonation['status']) {
  if (status === 'converted') return <span className="badge badge--success">Converted</span>
  if (status === 'partially-paid') return <span className="badge badge--warning">Partially Paid</span>
  return <span className="badge">Pending</span>
}

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Expected Date (Newest first)' },
  { value: 'date-asc', label: 'Expected Date (Oldest first)' },
  { value: 'donorName-asc', label: 'Donor (A–Z)' },
  { value: 'donorName-desc', label: 'Donor (Z–A)' },
]

export function ExpectedDonationsPage() {
  const { currentYearId } = useYearContext()
  const records = useExpectedDonations(currentYearId)
  const donations = useDonations(currentYearId)
  const categories = useCategories('donation')
  const units = useUnits()
  const { showToast } = useToast()
  const { shareDonation } = useWhatsAppShare()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [pendingEdit, setPendingEdit] = useState<{ record: ExpectedDonation; input: DonationInput } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpectedDonation | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  // 'outstanding' (the default) covers both 'pending' and 'partially-paid' — a partially-paid
  // pledge still has money outstanding, so it shouldn't disappear from the default view the way
  // a stricter status === 'pending' filter would leave it hidden.
  const [statusFilter, setStatusFilter] = useState('outstanding')
  const [sortOption, setSortOption] = useState('date-desc')

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const unitName = (id?: string) => units?.find((u) => u.id === id)?.name ?? ''

  const filtered = useMemo(() => {
    if (!records) return []
    const [sortField, sortDirection] = sortOption.split('-') as [keyof ExpectedDonation, SortDirection]
    const base = records
      .filter((d) => {
        if (statusFilter === 'outstanding') return d.status !== 'converted'
        return statusFilter ? d.status === statusFilter : true
      })
      .filter((d) => matchesSearch([d.donorName, d.commodityName, d.notes], search))
    return sortByKey(base, sortField, sortDirection)
  }, [records, statusFilter, search, sortOption])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || records === undefined || donations === undefined || categories === undefined || units === undefined) {
    return <p className="page-loading">Loading expected donations…</p>
  }

  function outstandingAmount(record: ExpectedDonation): number {
    return computeOutstandingPledgeAmount(record, donations!)
  }

  async function handleAdd(input: DonationInput) {
    await insertExpectedDonation(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Expected donation added')
  }

  function handleEditSubmit(record: ExpectedDonation, input: DonationInput) {
    const changes = diffFields([
      ['Donor Name', record.donorName, input.donorName],
      ['Amount', formatCurrency(record.amount), formatCurrency(input.amount)],
      ['Commodity', record.commodityName ?? '', input.commodityName ?? ''],
      ['Quantity', formatNumber(record.quantity), formatNumber(input.quantity)],
      ['Unit', unitName(record.unitId), unitName(input.unitId)],
      ['Category', categoryName(record.categoryId), categoryName(input.categoryId)],
      ['Expected Date', formatDisplayDate(record.date), formatDisplayDate(input.date)],
      ['Notes', record.notes ?? '', input.notes ?? ''],
    ])
    if (changes.length === 0) {
      setModal({ mode: 'closed' })
      return
    }
    // Close the edit form the moment we hand off to the confirm step — see DonationsPage.tsx's
    // identical comment for why (stacked look-alike dialogs read as the app being stuck).
    setModal({ mode: 'closed' })
    setPendingEdit({ record, input })
  }

  async function confirmEdit() {
    if (!pendingEdit) return
    setBusy(true)
    try {
      await updateExpectedDonation(pendingEdit.record.id, pendingEdit.input)
      setPendingEdit(null)
      setModal({ mode: 'closed' })
      showToast('Expected donation updated')
    } finally {
      setBusy(false)
    }
  }

  async function handleConvert(record: ExpectedDonation, input: DonationInput) {
    setBusy(true)
    try {
      await convertExpectedDonationToDonation(record.id, currentYearId!, input)
      setModal({ mode: 'closed' })
      showToast('Converted to actual donation successfully', 'success', {
        label: 'Copy WhatsApp message',
        onClick: () => shareDonation(input),
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleRecordPartialPayment(record: ExpectedDonation, input: DonationInput) {
    setBusy(true)
    try {
      await recordPartialPayment(record.id, currentYearId!, input)
      setModal({ mode: 'closed' })
      showToast('Payment recorded successfully', 'success', {
        label: 'Copy WhatsApp message',
        onClick: () => shareDonation(input),
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate(input: DonationInput) {
    await insertExpectedDonation(currentYearId!, input)
    setModal({ mode: 'closed' })
    showToast('Expected donation duplicated')
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
      render: (d) =>
        d.type === 'monetary' ? (
          d.status === 'partially-paid' ? (
            <span>
              {formatCurrency(outstandingAmount(d))} of {formatCurrency(d.amount)} outstanding
            </span>
          ) : (
            formatCurrency(d.amount)
          )
        ) : (
          `${d.commodityName} (${formatNumber(d.quantity)} ${unitName(d.unitId)})`
        ),
    },
    { key: 'category', header: 'Category', render: (d) => categoryName(d.categoryId) },
    { key: 'status', header: 'Status', render: (d) => statusBadge(d.status) },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) =>
        d.status !== 'converted' ? (
          <div className="row-actions">
            {d.type === 'monetary' && (
              <ActionButton icon={PARTIAL_PAYMENT_ICON} label="Record Partial Payment" onClick={() => setModal({ mode: 'partial-payment', record: d })} />
            )}
            <ActionButton icon={MOVE_ICON} label="Convert to Donation" onClick={() => setModal({ mode: 'convert', record: d })} />
            <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', record: d })} />
            <ActionButton icon={DUPLICATE_ICON} label="Duplicate" onClick={() => setModal({ mode: 'duplicate', record: d })} />
            <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(d)} />
          </div>
        ) : (
          <span className="text-muted">Already converted</span>
        ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <h1>Expected Donations</h1>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Expected Donation
        </button>
      </div>

      <SectionTabs
        tabs={[
          { to: '/donations', label: 'Actual Donations', end: true },
          { to: '/donations/expected', label: 'Expected Donations' },
        ]}
      />

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
                { value: 'outstanding', label: 'Outstanding (Pending + Partially Paid)' },
                { value: 'pending', label: 'Pending' },
                { value: 'partially-paid', label: 'Partially Paid' },
                { value: 'converted', label: 'Converted' },
              ]}
            />
            <SortControl value={sortOption} onChange={setSortOption} options={SORT_OPTIONS} />
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
                      {statusBadge(d.status)}
                    </div>
                    <div className="record-card__amount">
                      {d.type === 'monetary'
                        ? d.status === 'partially-paid'
                          ? `${formatCurrency(outstandingAmount(d))} of ${formatCurrency(d.amount)} outstanding`
                          : formatCurrency(d.amount)
                        : `${d.commodityName} — ${formatNumber(d.quantity)} ${unitName(d.unitId)}`}
                    </div>
                    <div className="record-card__meta">
                      Expected {formatDisplayDate(d.date)} · {categoryName(d.categoryId)}
                    </div>
                    {d.status !== 'converted' && (
                      <div className="row-actions">
                        {d.type === 'monetary' && (
                          <ActionButton icon={PARTIAL_PAYMENT_ICON} label="Record Partial Payment" onClick={() => setModal({ mode: 'partial-payment', record: d })} />
                        )}
                        <ActionButton icon={MOVE_ICON} label="Convert to Donation" onClick={() => setModal({ mode: 'convert', record: d })} />
                        <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', record: d })} />
                        <ActionButton icon={DUPLICATE_ICON} label="Duplicate" onClick={() => setModal({ mode: 'duplicate', record: d })} />
                        <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(d)} />
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
          submitLabel="Review Changes"
          initialValues={donationToFormValues(modal.record)}
          categories={categories}
          units={units}
          onSubmit={(input) => handleEditSubmit(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'duplicate' && (
        <DonationForm
          title="Duplicate Expected Donation"
          submitLabel="Save Duplicate"
          initialValues={donationToFormValues(modal.record, todayDateOnly())}
          categories={categories}
          units={units}
          onSubmit={handleDuplicate}
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

      {modal.mode === 'partial-payment' && (
        <DonationForm
          title="Record Partial Payment"
          description={`Outstanding balance: ${formatCurrency(outstandingAmount(modal.record))} of ${formatCurrency(modal.record.amount)}. Enter how much was actually received this time — the pledge stays "Partially Paid" until the full amount is collected.`}
          submitLabel={busy ? 'Recording…' : 'Record Payment'}
          initialValues={{ ...donationToFormValues(modal.record, todayDateOnly()), amount: '' }}
          categories={categories}
          units={units}
          onSubmit={(input) => handleRecordPartialPayment(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {pendingEdit && (
        <ConfirmDialog
          title="Review & Confirm"
          description="Check the changes below, then confirm to save them. Cancel to go back without saving."
          summary={
            <FieldDiffList
              changes={diffFields([
                ['Donor Name', pendingEdit.record.donorName, pendingEdit.input.donorName],
                ['Amount', formatCurrency(pendingEdit.record.amount), formatCurrency(pendingEdit.input.amount)],
                ['Category', categoryName(pendingEdit.record.categoryId), categoryName(pendingEdit.input.categoryId)],
                ['Expected Date', formatDisplayDate(pendingEdit.record.date), formatDisplayDate(pendingEdit.input.date)],
              ])}
            />
          }
          confirmLabel="Confirm & Save"
          onConfirm={confirmEdit}
          onCancel={() => setPendingEdit(null)}
          busy={busy}
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
