import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useYearSummary } from '@/hooks/useYearSummary'
import { StatCard } from '@/components/common/StatCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ExportButtons } from '@/components/common/ExportButtons'
import { useToast } from '@/context/ToastContext'
import { formatCurrency } from '@/lib/currency'
import { formatDisplayDate, todayDateOnly } from '@/lib/date'
import { buildPdfReport, pdfFileName } from '@/lib/export/pdf'
import { buildSummaryLines } from '@/lib/export/reportBuilders'
import { exportElementAsPng, pngFileName } from '@/lib/export/png'

export function Dashboard() {
  const { loading, currentYear, summary, donations, expenses, auctions, expectedDonations } = useYearSummary()
  const { showToast } = useToast()
  const reportRef = useRef<HTMLDivElement>(null)

  if (loading || !currentYear || !summary) {
    return <p className="page-loading">Loading dashboard…</p>
  }

  async function handleExportPdf() {
    if (!currentYear || !summary) return
    try {
      const doc = await buildPdfReport({
        yearName: currentYear.name,
        reportTitle: 'Summary Report',
        summaryLines: buildSummaryLines(summary),
      })
      doc.save(pdfFileName(currentYear.name, 'Summary Report'))
    } catch {
      showToast('Could not generate PDF. Please try again.', 'error')
    }
  }

  async function handleExportPng() {
    if (!currentYear || !reportRef.current) return
    try {
      await exportElementAsPng(reportRef.current, pngFileName(currentYear.name, 'Summary Report'))
    } catch {
      showToast('Could not generate image. Please try again.', 'error')
    }
  }

  const totalCommodityQty = donations.filter((d) => d.type === 'commodity').length
  const hasAnyData =
    donations.length > 0 || expenses.length > 0 || auctions.length > 0 || expectedDonations.length > 0

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>{currentYear.name}</h1>
          <p className="page__subtitle">Financial summary as of {formatDisplayDate(todayDateOnly())}</p>
        </div>
        <ExportButtons onExportPdf={handleExportPdf} onExportPng={handleExportPng} pdfLabel="Export Summary PDF" pngLabel="Export Summary PNG" />
      </div>

      {!hasAnyData && (
        <EmptyState
          title="No records yet for this year"
          description="Start by adding your first donation, expense, or auction entry for this Ganesh Navarathri."
          action={
            <div className="empty-state__actions">
              <Link className="button button--primary" to="/donations?add=1">
                + Add Donation
              </Link>
              <Link className="button button--ghost" to="/expenses?add=1">
                + Add Expense
              </Link>
            </div>
          }
        />
      )}

      <div ref={reportRef}>
      <section aria-labelledby="actual-heading">
        <h2 id="actual-heading" className="section-title">
          Actual (Cash in Hand)
        </h2>
        <div className="stat-grid">
          <StatCard label="Opening Balance" value={formatCurrency(summary.openingBalance)} />
          <StatCard
            label="Monetary Donations"
            value={formatCurrency(summary.totalMonetaryDonations)}
            hint={`${summary.counts.monetaryDonations} donation(s)`}
            tone="positive"
          />
          <StatCard
            label="Commodity Donations"
            value={String(totalCommodityQty)}
            hint={`${summary.counts.commodityDonations} donation(s) — see Reports for quantities`}
            tone="muted"
          />
          <StatCard
            label="Auction Proceeds"
            value={formatCurrency(summary.totalAuctionProceeds)}
            hint={`${summary.counts.auctions} item(s)`}
            tone="positive"
          />
          <StatCard
            label="Expenses"
            value={formatCurrency(summary.totalExpenses)}
            hint={`${summary.counts.expenses} entr(y/ies)`}
            tone="negative"
          />
          <StatCard label="Closing Balance" value={formatCurrency(summary.closingBalance)} tone="default" />
        </div>
      </section>

      <section aria-labelledby="expected-heading">
        <h2 id="expected-heading" className="section-title">
          Expected (Promised, Not Yet Received)
        </h2>
        <div className="stat-grid">
          <StatCard
            label="Expected Monetary Donations"
            value={formatCurrency(summary.expectedMonetaryDonations)}
            hint={`${summary.counts.expectedDonations} pending`}
            tone="muted"
          />
          <StatCard
            label="Expected Commodity Donations"
            value={String(summary.expectedCommodityDonationCount)}
            hint="pending commodity pledges"
            tone="muted"
          />
          <StatCard
            label="Expected Expenses"
            value={formatCurrency(summary.expectedExpenses)}
            hint={`${summary.counts.expectedExpenses} pending`}
            tone="muted"
          />
        </div>
        <p className="page__note">
          Expected amounts are shown for planning only — they do not affect the actual closing balance above until
          converted.
        </p>
      </section>
      </div>

      <section className="quick-actions">
        <Link className="button button--primary" to="/donations?add=1">
          + Add Donation
        </Link>
        <Link className="button button--secondary" to="/expenses?add=1">
          + Add Expense
        </Link>
        <Link className="button button--secondary" to="/auctions?add=1">
          + Add Auction
        </Link>
        <Link className="button button--ghost" to="/reports">
          View Reports
        </Link>
      </section>
    </div>
  )
}
