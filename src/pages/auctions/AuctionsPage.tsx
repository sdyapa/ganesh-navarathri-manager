import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useAuctions, useCategories, useUnits } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, DateRangeFilter } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FieldDiffList } from '@/components/common/FieldDiffList'
import { SummaryList } from '@/components/common/SummaryList'
import { StatCard } from '@/components/common/StatCard'
import { ExportButtons } from '@/components/common/ExportButtons'
import { AuctionForm, defaultAuctionFormValues, auctionToFormValues } from './AuctionForm'
import { DonationForm, type DonationFormValues } from '@/pages/donations/DonationForm'
import { insertAuction, updateAuction, deleteAuction } from '@/db/repositories/auctions'
import { getOrCreateNextYearProfile } from '@/services/yearService'
import { convertAuctionToExpectedDonation } from '@/services/conversionService'
import { formatCurrency, formatCurrencyForPdf } from '@/lib/currency'
import { formatDisplayDate, isDateInRange, todayDateOnly } from '@/lib/date'
import { matchesSearch } from '@/lib/tableUtils'
import { diffFields } from '@/lib/diff'
import { buildPdfReport, pdfFileName } from '@/lib/export/pdf'
import { buildAuctionsTable } from '@/lib/export/reportBuilders'
import { exportTableReportAsPng, pngFileName } from '@/lib/export/png'
import { getAppSettings } from '@/db/repositories/settings'
import type { AuctionInput, DonationInput } from '@/lib/validation'
import type { Auction, Category, YearProfile } from '@/types'

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; auction: Auction }
  | { mode: 'convert'; auction: Auction }

function findSourceYear(auction: Auction, years: YearProfile[]): YearProfile | undefined {
  return years.find((y) => y.id === auction.yearProfileId)
}

/** Human-readable name of the year a pledge will land in — shown in the conversion modal
 *  before anything is created, so nothing is fabricated silently if the user cancels. */
function describeTargetYear(auction: Auction, years: YearProfile[]): string {
  const sourceYear = findSourceYear(auction, years)
  if (!sourceYear) return 'next year'
  const targetYearNumber = sourceYear.year + 1
  const existing = years.find((y) => y.year === targetYearNumber)
  return existing?.name ?? `Ganesh Navarathri ${targetYearNumber} (will be created)`
}

/** An auction winner pays the *following* year's festival, not on the spot — this pre-fills
 *  the pledge with the winner's name/amount and a note matching the exact convention already
 *  used in this committee's historical records (e.g. "2025 Pedda Laddu"). */
function buildPledgeFormValues(auction: Auction, categories: Category[], years: YearProfile[]): DonationFormValues {
  const sourceYear = findSourceYear(auction, years)
  const auctionCategory = categories.find((c) => c.name.trim().toLowerCase() === 'auction')
  return {
    donorName: auction.person,
    type: 'monetary',
    date: todayDateOnly(),
    categoryId: auctionCategory?.id ?? categories[0]?.id ?? '',
    notes: sourceYear ? `${sourceYear.year} ${auction.item}` : auction.item,
    amount: String(auction.amount),
    commodityName: '',
    quantity: '',
    unitId: '',
  }
}

export function AuctionsPage() {
  const { currentYearId, currentYear, years } = useYearContext()
  const auctions = useAuctions(currentYearId)
  const donationCategories = useCategories('donation')
  const units = useUnits()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [pendingEdit, setPendingEdit] = useState<{ auction: Auction; input: AuctionInput } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Auction | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    if (!auctions) return []
    return auctions
      .filter((a) => isDateInRange(a.date, dateFrom || undefined, dateTo || undefined))
      .filter((a) => matchesSearch([a.item, a.person, a.notes], search))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [auctions, dateFrom, dateTo, search])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || auctions === undefined || donationCategories === undefined || units === undefined) {
    return <p className="page-loading">Loading auctions…</p>
  }

  const total = auctions.reduce((sum, a) => sum + a.amount, 0)
  const auctionCount = auctions.length

  async function handleAdd(input: AuctionInput) {
    await insertAuction(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Auction entry added successfully')
  }

  function handleEditSubmit(original: Auction, input: AuctionInput) {
    const changes = diffFields([
      ['Item', original.item, input.item],
      ['Person', original.person, input.person],
      ['Amount', formatCurrency(original.amount), formatCurrency(input.amount)],
      ['Date', formatDisplayDate(original.date), formatDisplayDate(input.date)],
      ['Notes', original.notes ?? '', input.notes ?? ''],
    ])
    if (changes.length === 0) {
      setModal({ mode: 'closed' })
      return
    }
    setPendingEdit({ auction: original, input })
  }

  async function confirmEdit() {
    if (!pendingEdit) return
    setBusy(true)
    try {
      await updateAuction(pendingEdit.auction.id, pendingEdit.input)
      setPendingEdit(null)
      setModal({ mode: 'closed' })
      showToast('Auction entry updated successfully')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteAuction(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Auction entry deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  async function handleConvertAuction(auction: Auction, input: DonationInput) {
    setBusy(true)
    try {
      const { profile: targetYear, created } = await getOrCreateNextYearProfile(auction.yearProfileId)
      await convertAuctionToExpectedDonation(auction.id, targetYear.id, input)
      setModal({ mode: 'closed' })
      showToast(created ? `Pledge added — created ${targetYear.name} to hold it` : `Pledge added to ${targetYear.name}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleExportPdf() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      const doc = await buildPdfReport({
        yearName: currentYear.name,
        reportTitle: 'Auction Report',
        appName: displayName,
        summaryLines: [`Total Auction Proceeds: ${formatCurrencyForPdf(total)} (${auctionCount} item(s))`],
        table: buildAuctionsTable(filtered),
      })
      doc.save(pdfFileName(currentYear.name, 'Auction Report'))
    } catch {
      showToast('Could not generate PDF. Please try again.', 'error')
    }
  }

  async function handleExportPng() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      await exportTableReportAsPng(pngFileName(currentYear.name, 'Auction Report'), {
        appName: displayName,
        reportTitle: 'Auction Report',
        yearName: currentYear.name,
        summaryLines: [`Total Auction Proceeds: ${formatCurrency(total)} (${auctionCount} item(s))`],
        tables: [{ table: buildAuctionsTable(filtered, formatCurrency) }],
      })
    } catch {
      showToast('Could not generate image. Please try again.', 'error')
    }
  }

  const columns: Array<DataTableColumn<Auction>> = [
    { key: 'date', header: 'Date', render: (a) => formatDisplayDate(a.date) },
    { key: 'item', header: 'Item', render: (a) => a.item },
    { key: 'person', header: 'Person', render: (a) => a.person },
    { key: 'amount', header: 'Amount', align: 'right', render: (a) => formatCurrency(a.amount) },
    { key: 'notes', header: 'Notes', render: (a) => a.notes ?? '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (a) => (
        <div className="row-actions">
          {a.convertedToExpectedDonationId ? (
            <span className="text-muted">✓ Pledge created</span>
          ) : (
            <button type="button" className="link-button" onClick={() => setModal({ mode: 'convert', auction: a })}>
              Convert to Expected Donation
            </button>
          )}
          <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', auction: a })}>
            Edit
          </button>
          <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(a)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Auctions</h1>
          <p className="page__subtitle">Track items auctioned and proceeds collected separately from donations.</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Auction
        </button>
      </div>

      {auctions.length > 0 && (
        <div className="stat-grid stat-grid--compact">
          <StatCard label="Total Auction Proceeds" value={formatCurrency(total)} tone="positive" hint={`${auctionCount} item(s)`} />
        </div>
      )}

      {auctions.length === 0 ? (
        <EmptyState
          title="No auction entries yet"
          description="Record items auctioned during the celebration and the amount they fetched."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Auction
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search item, person, notes…" />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </FilterBar>

          <ExportButtons onExportPdf={handleExportPdf} onExportPng={handleExportPng} />

          {filtered.length === 0 ? (
            <EmptyState title="No matching auction entries" description="Try adjusting your search or filters." />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={pageItems}
                rowKey={(a) => a.id}
                renderCard={(a) => (
                  <>
                    <div className="record-card__top">
                      <strong>{a.item}</strong>
                    </div>
                    <div className="record-card__amount">{formatCurrency(a.amount)}</div>
                    <div className="record-card__meta">
                      {formatDisplayDate(a.date)} · Won by {a.person}
                    </div>
                    {a.notes && <div className="record-card__notes">{a.notes}</div>}
                    <div className="row-actions">
                      {a.convertedToExpectedDonationId ? (
                        <span className="text-muted">✓ Pledge created</span>
                      ) : (
                        <button type="button" className="link-button" onClick={() => setModal({ mode: 'convert', auction: a })}>
                          Convert to Expected Donation
                        </button>
                      )}
                      <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', auction: a })}>
                        Edit
                      </button>
                      <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(a)}>
                        Delete
                      </button>
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
        <AuctionForm
          title="Add Auction Entry"
          submitLabel="Save"
          initialValues={defaultAuctionFormValues()}
          onSubmit={handleAdd}
          onClose={() => {
            setModal({ mode: 'closed' })
            searchParams.delete('add')
            setSearchParams(searchParams, { replace: true })
          }}
        />
      )}

      {modal.mode === 'edit' && (
        <AuctionForm
          title="Edit Auction Entry"
          submitLabel="Save Changes"
          initialValues={auctionToFormValues(modal.auction)}
          onSubmit={(input) => handleEditSubmit(modal.auction, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'convert' && (
        <DonationForm
          title="Convert to Expected Donation"
          submitLabel="Create Pledge"
          description={`This will be recorded as a pending pledge in ${describeTargetYear(modal.auction, years)}.`}
          initialValues={buildPledgeFormValues(modal.auction, donationCategories, years)}
          categories={donationCategories}
          units={units}
          onSubmit={(input) => handleConvertAuction(modal.auction, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {pendingEdit && (
        <ConfirmDialog
          title="Confirm Changes"
          summary={
            <FieldDiffList
              changes={diffFields([
                ['Item', pendingEdit.auction.item, pendingEdit.input.item],
                ['Person', pendingEdit.auction.person, pendingEdit.input.person],
                ['Amount', formatCurrency(pendingEdit.auction.amount), formatCurrency(pendingEdit.input.amount)],
                ['Date', formatDisplayDate(pendingEdit.auction.date), formatDisplayDate(pendingEdit.input.date)],
              ])}
            />
          }
          confirmLabel="Save Changes"
          onConfirm={confirmEdit}
          onCancel={() => setPendingEdit(null)}
          busy={busy}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Auction Entry?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Item', value: deleteTarget.item },
                { label: 'Person', value: deleteTarget.person },
                { label: 'Amount', value: formatCurrency(deleteTarget.amount) },
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
    </div>
  )
}
