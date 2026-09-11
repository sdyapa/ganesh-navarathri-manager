import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SectionTabs } from '@/components/common/SectionTabs'
import { useYearContext } from '@/context/YearContext'
import { useCategories, useDonations, useUnits } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { useWhatsAppShare } from '@/hooks/useWhatsAppShare'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter, SortControl, DateRangeFilter } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FieldDiffList } from '@/components/common/FieldDiffList'
import { SummaryList } from '@/components/common/SummaryList'
import { ExportButtons } from '@/components/common/ExportButtons'
import { CopyToYearModal, NEXT_YEAR_VALUE } from '@/components/common/CopyToYearModal'
import { ActionButton } from '@/components/common/ActionButton'
import { DonationForm, defaultDonationFormValues, donationToFormValues } from './DonationForm'
import { insertDonation, updateDonation, deleteDonation } from '@/db/repositories/donations'
import { copyDonationsToExpected } from '@/services/copyForwardService'
import { revertDonationToExpected } from '@/services/conversionService'
import { getOrCreateNextYearProfile } from '@/services/yearService'
import { formatCurrency, formatCurrencyForPdf, formatNumber } from '@/lib/currency'
import { pluralize } from '@/lib/pluralize'
import { formatDisplayDate, isDateInRange, todayDateOnly } from '@/lib/date'
import { matchesSearch, sortByKey, type SortDirection } from '@/lib/tableUtils'
import { diffFields } from '@/lib/diff'
import { buildPdfReport, pdfFileName } from '@/lib/export/pdf'
import { buildMonetaryDonationsTable, buildCommodityDonationsTable } from '@/lib/export/reportBuilders'
import { exportTableReportAsPng, pngFileName } from '@/lib/export/png'
import { getAppSettings } from '@/db/repositories/settings'
import { EDIT_ICON, DELETE_ICON, DUPLICATE_ICON, COPY_ICON, REVERT_ICON } from '@/lib/actionIcons'
import type { DonationInput } from '@/lib/validation'
import type { Donation } from '@/types'

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; donation: Donation }
  | { mode: 'duplicate'; donation: Donation }
  | { mode: 'copy' }

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Date (Newest first)' },
  { value: 'date-asc', label: 'Date (Oldest first)' },
  { value: 'donorName-asc', label: 'Donor (A–Z)' },
  { value: 'donorName-desc', label: 'Donor (Z–A)' },
]

export function DonationsPage() {
  const { currentYearId, currentYear, years } = useYearContext()
  const donations = useDonations(currentYearId)
  const categories = useCategories('donation')
  const units = useUnits()
  const { showToast } = useToast()
  const { shareDonation } = useWhatsAppShare()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [pendingEdit, setPendingEdit] = useState<{ donation: Donation; input: DonationInput } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Donation | null>(null)
  const [revertTarget, setRevertTarget] = useState<Donation | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOption, setSortOption] = useState('date-desc')

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const unitName = (id?: string) => units?.find((u) => u.id === id)?.name ?? ''

  const filtered = useMemo(() => {
    if (!donations) return []
    const [sortField, sortDirection] = sortOption.split('-') as [keyof Donation, SortDirection]
    const base = donations
      .filter((d) => (typeFilter ? d.type === typeFilter : true))
      .filter((d) => (categoryFilter ? d.categoryId === categoryFilter : true))
      .filter((d) => isDateInRange(d.date, dateFrom || undefined, dateTo || undefined))
      .filter((d) => matchesSearch([d.donorName, d.commodityName, d.notes, categoryName(d.categoryId)], search))
    return sortByKey(base, sortField, sortDirection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donations, typeFilter, categoryFilter, dateFrom, dateTo, search, sortOption, categories])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || donations === undefined || categories === undefined || units === undefined) {
    return <p className="page-loading">Loading donations…</p>
  }

  async function handleAdd(input: DonationInput) {
    await insertDonation(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Donation added successfully', 'success', {
      label: 'Copy WhatsApp message',
      onClick: () => shareDonation(input),
    })
  }

  function handleEditSubmit(original: Donation, input: DonationInput) {
    const changes = diffFields([
      ['Donor Name', original.donorName, input.donorName],
      ['Type', original.type, input.type],
      ['Amount', formatCurrency(original.amount), formatCurrency(input.amount)],
      ['Commodity', original.commodityName ?? '', input.commodityName ?? ''],
      ['Quantity', formatNumber(original.quantity), formatNumber(input.quantity)],
      ['Unit', unitName(original.unitId), unitName(input.unitId)],
      ['Category', categoryName(original.categoryId), categoryName(input.categoryId)],
      ['Date', formatDisplayDate(original.date), formatDisplayDate(input.date)],
      ['Notes', original.notes ?? '', input.notes ?? ''],
    ])
    if (changes.length === 0) {
      setModal({ mode: 'closed' })
      return
    }
    // Close the edit form the moment we hand off to the confirm step — showing the confirm
    // dialog stacked ON TOP of the still-open edit form (two look-alike dialogs, one dimmed
    // behind the other) reads as the app being stuck rather than as "one more step needed".
    setModal({ mode: 'closed' })
    setPendingEdit({ donation: original, input })
  }

  async function confirmEdit() {
    if (!pendingEdit) return
    setBusy(true)
    try {
      await updateDonation(pendingEdit.donation.id, pendingEdit.input)
      setPendingEdit(null)
      setModal({ mode: 'closed' })
      showToast('Donation updated successfully')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteDonation(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Donation deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate(input: DonationInput) {
    await insertDonation(currentYearId!, input)
    setModal({ mode: 'closed' })
    showToast('Donation duplicated successfully')
  }

  async function confirmRevert() {
    if (!revertTarget) return
    setBusy(true)
    try {
      await revertDonationToExpected(revertTarget)
      setRevertTarget(null)
      showToast('Moved back to Expected Donations', 'info')
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

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = pageItems.length > 0 && pageItems.every((d) => next.has(d.id))
      for (const d of pageItems) {
        if (allSelected) next.delete(d.id)
        else next.add(d.id)
      }
      return next
    })
  }

  async function handleCopyToExpected(targetYearSelection: string) {
    if (!currentYearId || !currentYear) return
    setBusy(true)
    try {
      const { targetYearId, targetYearName } =
        targetYearSelection === NEXT_YEAR_VALUE
          ? await getOrCreateNextYearProfile(currentYearId).then((r) => ({ targetYearId: r.profile.id, targetYearName: r.profile.name }))
          : { targetYearId: targetYearSelection, targetYearName: years.find((y) => y.id === targetYearSelection)?.name ?? 'target year' }
      const count = await copyDonationsToExpected([...selectedIds], targetYearId)
      setSelectedIds(new Set())
      setModal({ mode: 'closed' })
      showToast(`Copied ${pluralize(count, 'donation')} to Expected Donations in ${targetYearName}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleExportPdf() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      const monetaryTotal = filtered.filter((d) => d.type === 'monetary').reduce((s, d) => s + (d.amount ?? 0), 0)
      const commodityCount = filtered.filter((d) => d.type === 'commodity').length
      const doc = await buildPdfReport({
        yearName: currentYear.name,
        reportTitle: 'Donations Report',
        appName: displayName,
        orientation: 'landscape',
        summaryLines: [
          `Total Monetary Donations: ${formatCurrencyForPdf(monetaryTotal)}`,
          `Commodity Donations: ${commodityCount}`,
          `Total Records: ${filtered.length}`,
        ],
        extraTables: [
          { heading: 'Monetary Donations', table: buildMonetaryDonationsTable(filtered, categories!) },
          { heading: 'Commodity Donations', table: buildCommodityDonationsTable(filtered, categories!, units!) },
        ],
      })
      doc.save(pdfFileName(currentYear.name, 'Donations Report'))
    } catch {
      showToast('Could not generate PDF. Please try again.', 'error')
    }
  }

  async function handleExportPng() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      const monetaryTotal = filtered.filter((d) => d.type === 'monetary').reduce((s, d) => s + (d.amount ?? 0), 0)
      const commodityCount = filtered.filter((d) => d.type === 'commodity').length
      await exportTableReportAsPng(pngFileName(currentYear.name, 'Donations Report'), {
        appName: displayName,
        reportTitle: 'Donations Report',
        yearName: currentYear.name,
        summaryLines: [
          `Total Monetary Donations: ${formatCurrency(monetaryTotal)}`,
          `Commodity Donations: ${commodityCount}`,
          `Total Records: ${filtered.length}`,
        ],
        tables: [
          { heading: 'Monetary Donations', table: buildMonetaryDonationsTable(filtered, categories!, formatCurrency) },
          { heading: 'Commodity Donations', table: buildCommodityDonationsTable(filtered, categories!, units!) },
        ],
      })
    } catch {
      showToast('Could not generate image. Please try again.', 'error')
    }
  }

  const columns: Array<DataTableColumn<Donation>> = [
    { key: 'date', header: 'Date', render: (d) => formatDisplayDate(d.date) },
    { key: 'donor', header: 'Donor', render: (d) => d.donorName },
    { key: 'type', header: 'Type', render: (d) => (d.type === 'monetary' ? 'Monetary' : 'Commodity') },
    {
      key: 'amount',
      header: 'Amount / Commodity',
      align: 'right',
      render: (d) => (d.type === 'monetary' ? formatCurrency(d.amount) : d.commodityName ?? '—'),
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      render: (d) => (d.type === 'commodity' ? `${formatNumber(d.quantity)} ${unitName(d.unitId)}` : '—'),
    },
    { key: 'category', header: 'Category', render: (d) => categoryName(d.categoryId) },
    { key: 'notes', header: 'Notes', render: (d) => d.notes ?? '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="row-actions">
          <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', donation: d })} />
          <ActionButton icon={DUPLICATE_ICON} label="Duplicate" onClick={() => setModal({ mode: 'duplicate', donation: d })} />
          <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(d)} />
          <ActionButton icon={COPY_ICON} label="Copy WhatsApp" onClick={() => shareDonation(d)} />
          {d.sourceExpectedDonationId && (
            <ActionButton icon={REVERT_ICON} label="Move back to Expected" onClick={() => setRevertTarget(d)} />
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <h1>Donations</h1>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Donation
        </button>
      </div>

      <SectionTabs
        tabs={[
          { to: '/donations', label: 'Actual Donations', end: true },
          { to: '/donations/expected', label: 'Expected Donations' },
        ]}
      />

      {donations.length === 0 ? (
        <EmptyState
          title="No donations yet"
          description="Add your first donation to start tracking Ganesh Navarathri contributions."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Donation
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search donor, commodity, notes…" />
            <SelectFilter
              label="Type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'monetary', label: 'Monetary' },
                { value: 'commodity', label: 'Commodity' },
              ]}
            />
            <SelectFilter
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            <SortControl value={sortOption} onChange={setSortOption} options={SORT_OPTIONS} />
          </FilterBar>

          <div className="row-actions">
            <ExportButtons onExportPdf={handleExportPdf} onExportPng={handleExportPng} />
            {selectedIds.size > 0 && (
              <button type="button" className="button button--secondary" onClick={() => setModal({ mode: 'copy' })}>
                Copy {selectedIds.size} to Expected Donations
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No matching donations" description="Try adjusting your search or filters." />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={pageItems}
                rowKey={(d) => d.id}
                selection={{ selectedIds, onToggle: toggleSelected, onToggleAll: toggleSelectAllOnPage }}
                renderCard={(d) => (
                  <>
                    <div className="record-card__top">
                      <strong>{d.donorName}</strong>
                      <span className="badge">{d.type === 'monetary' ? 'Monetary' : 'Commodity'}</span>
                    </div>
                    <div className="record-card__amount">
                      {d.type === 'monetary' ? formatCurrency(d.amount) : `${d.commodityName} — ${formatNumber(d.quantity)} ${unitName(d.unitId)}`}
                    </div>
                    <div className="record-card__meta">
                      {formatDisplayDate(d.date)} · {categoryName(d.categoryId)}
                    </div>
                    {d.notes && <div className="record-card__notes">{d.notes}</div>}
                    <div className="row-actions">
                      <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', donation: d })} />
                      <ActionButton icon={DUPLICATE_ICON} label="Duplicate" onClick={() => setModal({ mode: 'duplicate', donation: d })} />
                      <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(d)} />
                      <ActionButton icon={COPY_ICON} label="Copy WhatsApp" onClick={() => shareDonation(d)} />
                      {d.sourceExpectedDonationId && (
                        <ActionButton icon={REVERT_ICON} label="Move back to Expected" onClick={() => setRevertTarget(d)} />
                      )}
                    </div>
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
          title="Add Donation"
          submitLabel="Save Donation"
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
          title="Edit Donation"
          submitLabel="Review Changes"
          initialValues={donationToFormValues(modal.donation)}
          categories={categories}
          units={units}
          onSubmit={(input) => handleEditSubmit(modal.donation, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'duplicate' && (
        <DonationForm
          title="Duplicate Donation"
          submitLabel="Save Duplicate"
          initialValues={donationToFormValues(modal.donation, todayDateOnly())}
          categories={categories}
          units={units}
          onSubmit={handleDuplicate}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'copy' && currentYear && (
        <CopyToYearModal
          title="Copy to Expected Donations"
          itemLabel={pluralize(selectedIds.size, 'donation')}
          sourceYear={currentYear}
          years={years}
          busy={busy}
          onConfirm={handleCopyToExpected}
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
                ['Donor Name', pendingEdit.donation.donorName, pendingEdit.input.donorName],
                ['Amount', formatCurrency(pendingEdit.donation.amount), formatCurrency(pendingEdit.input.amount)],
                ['Category', categoryName(pendingEdit.donation.categoryId), categoryName(pendingEdit.input.categoryId)],
                ['Date', formatDisplayDate(pendingEdit.donation.date), formatDisplayDate(pendingEdit.input.date)],
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
          title="Delete Donation?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Donor', value: deleteTarget.donorName },
                { label: 'Type', value: deleteTarget.type === 'monetary' ? 'Monetary' : 'Commodity' },
                {
                  label: deleteTarget.type === 'monetary' ? 'Amount' : 'Commodity',
                  value:
                    deleteTarget.type === 'monetary'
                      ? formatCurrency(deleteTarget.amount)
                      : `${deleteTarget.commodityName} (${formatNumber(deleteTarget.quantity)} ${unitName(deleteTarget.unitId)})`,
                },
                { label: 'Category', value: categoryName(deleteTarget.categoryId) },
                { label: 'Date', value: formatDisplayDate(deleteTarget.date) },
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

      {revertTarget && (
        <ConfirmDialog
          title="Move back to Expected?"
          description="This actual donation will be deleted and the original Expected Donation it was converted from will be restored as pending."
          summary={
            <SummaryList
              rows={[
                { label: 'Donor', value: revertTarget.donorName },
                {
                  label: revertTarget.type === 'monetary' ? 'Amount' : 'Commodity',
                  value: revertTarget.type === 'monetary' ? formatCurrency(revertTarget.amount) : revertTarget.commodityName ?? '',
                },
                { label: 'Date', value: formatDisplayDate(revertTarget.date) },
              ]}
            />
          }
          confirmLabel="Move back to Expected"
          onConfirm={confirmRevert}
          onCancel={() => setRevertTarget(null)}
          busy={busy}
        />
      )}
    </div>
  )
}
