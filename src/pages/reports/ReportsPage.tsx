import { useMemo, useRef, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { CHART_COLORS } from '@/lib/chartSetup'
import { useYearContext } from '@/context/YearContext'
import { useToast } from '@/context/ToastContext'
import {
  useAuctions,
  useCategories,
  useDonations,
  useExpenses,
  useUnits,
} from '@/hooks/useYearData'
import {
  computeCategoryTotals,
  computeCommodityTotals,
  computeDailyTrend,
  computeFinancialSummary,
} from '@/lib/calculations'
import { DateRangeFilter } from '@/components/common/Filters'
import { EmptyState } from '@/components/common/EmptyState'
import { ExportButtons } from '@/components/common/ExportButtons'
import { formatCurrency, formatCurrencyForPdf, formatNumber } from '@/lib/currency'
import { isDateInRange, formatDisplayDate } from '@/lib/date'
import { buildPdfReport, pdfFileName } from '@/lib/export/pdf'
import { buildSummaryLines } from '@/lib/export/reportBuilders'
import { exportElementAsPng, pngFileName } from '@/lib/export/png'
import { getAppSettings } from '@/db/repositories/settings'

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' as const } },
}

export function ReportsPage() {
  const { currentYear, currentYearId } = useYearContext()
  const { showToast } = useToast()
  const donations = useDonations(currentYearId)
  const expenses = useExpenses(currentYearId)
  const auctions = useAuctions(currentYearId)
  const donationCategories = useCategories('donation')
  const expenseCategories = useCategories('expense')
  const units = useUnits()

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  const loading =
    !currentYear ||
    donations === undefined ||
    expenses === undefined ||
    auctions === undefined ||
    donationCategories === undefined ||
    expenseCategories === undefined ||
    units === undefined

  const filteredDonations = useMemo(
    () => (donations ?? []).filter((d) => isDateInRange(d.date, dateFrom || undefined, dateTo || undefined)),
    [donations, dateFrom, dateTo],
  )
  const filteredExpenses = useMemo(
    () => (expenses ?? []).filter((e) => isDateInRange(e.date, dateFrom || undefined, dateTo || undefined)),
    [expenses, dateFrom, dateTo],
  )
  const filteredAuctions = useMemo(
    () => (auctions ?? []).filter((a) => isDateInRange(a.date, dateFrom || undefined, dateTo || undefined)),
    [auctions, dateFrom, dateTo],
  )

  const donationCategoryTotals = useMemo(() => {
    if (loading) return []
    const monetary = filteredDonations.filter((d) => d.type === 'monetary')
    const totals = computeCategoryTotals(monetary, donationCategories!)
    if (filteredAuctions.length > 0) {
      totals.push({
        categoryId: '__auction__',
        categoryName: 'Auction',
        total: filteredAuctions.reduce((s, a) => s + a.amount, 0),
        count: filteredAuctions.length,
      })
    }
    return totals.sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filteredDonations, filteredAuctions, donationCategories])

  const expenseCategoryTotals = useMemo(() => {
    if (loading) return []
    return computeCategoryTotals(filteredExpenses, expenseCategories!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filteredExpenses, expenseCategories])

  const commodityTotals = useMemo(() => {
    if (loading) return []
    return computeCommodityTotals(filteredDonations, units!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filteredDonations, units])

  const dailyTrend = useMemo(() => {
    if (loading) return []
    return computeDailyTrend(filteredDonations, filteredExpenses, filteredAuctions)
  }, [loading, filteredDonations, filteredExpenses, filteredAuctions])

  const filteredSummary = useMemo(() => {
    if (loading || !currentYear) return undefined
    return computeFinancialSummary({
      yearProfileId: currentYear.id,
      openingBalance: currentYear.openingBalance,
      donations: filteredDonations,
      expectedDonations: [],
      expenses: filteredExpenses,
      expectedExpenses: [],
      auctions: filteredAuctions,
    })
  }, [loading, currentYear, filteredDonations, filteredExpenses, filteredAuctions])

  if (loading) return <p className="page-loading">Loading reports…</p>

  const hasAnyData = donations!.length > 0 || expenses!.length > 0 || auctions!.length > 0

  async function handleExportPdf() {
    if (!currentYear || !filteredSummary) return
    try {
      const { displayName } = await getAppSettings()
      const doc = await buildPdfReport({
        yearName: currentYear.name,
        reportTitle: 'Reports & Charts Summary',
        appName: displayName,
        summaryLines: [
          ...(dateFrom || dateTo ? [`Date range: ${dateFrom ? formatDisplayDate(dateFrom) : 'start'} to ${dateTo ? formatDisplayDate(dateTo) : 'today'}`] : []),
          ...buildSummaryLines(filteredSummary),
        ],
        extraTables: [
          {
            heading: 'Donations by Category',
            table: { head: ['Category', 'Total', 'Count'], rows: donationCategoryTotals.map((c) => [c.categoryName, formatCurrencyForPdf(c.total), String(c.count)]) },
          },
          {
            heading: 'Expenses by Category',
            table: { head: ['Category', 'Total', 'Count'], rows: expenseCategoryTotals.map((c) => [c.categoryName, formatCurrencyForPdf(c.total), String(c.count)]) },
          },
          {
            heading: 'Commodity Donations',
            table: {
              head: ['Commodity', 'Total Quantity', 'Unit', 'Donors'],
              rows: commodityTotals.map((c) => [c.commodityName, formatNumber(c.totalQuantity), c.unitName, String(c.donorCount)]),
            },
          },
        ],
      })
      doc.save(pdfFileName(currentYear.name, 'Reports Summary'))
    } catch {
      showToast('Could not generate PDF. Please try again.', 'error')
    }
  }

  async function handleExportPng() {
    if (!currentYear || !filteredSummary || !reportRef.current) return
    try {
      const { displayName } = await getAppSettings()
      await exportElementAsPng(reportRef.current, pngFileName(currentYear.name, 'Reports Summary'), {
        appName: displayName,
        reportTitle: 'Reports & Charts Summary',
        yearName: currentYear.name,
        summaryLines: [
          ...(dateFrom || dateTo ? [`Date range: ${dateFrom ? formatDisplayDate(dateFrom) : 'start'} to ${dateTo ? formatDisplayDate(dateTo) : 'today'}`] : []),
          `Monetary Donations: ${formatCurrency(filteredSummary.totalMonetaryDonations)}`,
          `Auction Proceeds: ${formatCurrency(filteredSummary.totalAuctionProceeds)}`,
          `Total Expenses: ${formatCurrency(filteredSummary.totalExpenses)}`,
          `Closing Balance: ${formatCurrency(filteredSummary.closingBalance)}`,
        ],
      })
    } catch {
      showToast('Could not generate image. Please try again.', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Reports &amp; Charts</h1>
          <p className="page__subtitle">Visual breakdown of donations, expenses, and cash flow for {currentYear!.name}.</p>
        </div>
        <ExportButtons onExportPdf={handleExportPdf} onExportPng={handleExportPng} />
      </div>

      {!hasAnyData ? (
        <EmptyState title="Nothing to report yet" description="Add donations, expenses, or auctions to see charts here." />
      ) : (
        <div ref={reportRef}>
          <div className="filter-bar">
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </div>

          <div className="chart-grid">
            <div className="chart-card">
              <h3>Donations by Category</h3>
              <div className="chart-card__canvas">
                <Bar
                  options={chartOptions}
                  data={{
                    labels: donationCategoryTotals.map((c) => c.categoryName),
                    datasets: [{ label: 'Amount (₹)', data: donationCategoryTotals.map((c) => c.total), backgroundColor: CHART_COLORS }],
                  }}
                />
              </div>
            </div>

            <div className="chart-card">
              <h3>Expenses by Category</h3>
              <div className="chart-card__canvas">
                <Bar
                  options={chartOptions}
                  data={{
                    labels: expenseCategoryTotals.map((c) => c.categoryName),
                    datasets: [{ label: 'Amount (₹)', data: expenseCategoryTotals.map((c) => c.total), backgroundColor: CHART_COLORS }],
                  }}
                />
              </div>
            </div>

            <div className="chart-card">
              <h3>Donations vs Auction vs Expenses</h3>
              <div className="chart-card__canvas">
                <Bar
                  options={chartOptions}
                  data={{
                    labels: ['Monetary Donations', 'Auction Proceeds', 'Expenses'],
                    datasets: [
                      {
                        label: 'Amount (₹)',
                        data: [filteredSummary?.totalMonetaryDonations ?? 0, filteredSummary?.totalAuctionProceeds ?? 0, filteredSummary?.totalExpenses ?? 0],
                        backgroundColor: [CHART_COLORS[0], CHART_COLORS[4], CHART_COLORS[6]],
                      },
                    ],
                  }}
                />
              </div>
            </div>

            <div className="chart-card chart-card--wide">
              <h3>Day-by-Day Trend</h3>
              <div className="chart-card__canvas">
                <Line
                  options={chartOptions}
                  data={{
                    labels: dailyTrend.map((p) => formatDisplayDate(p.date)),
                    datasets: [
                      { label: 'Donations', data: dailyTrend.map((p) => p.donations + p.auctions), borderColor: CHART_COLORS[0], backgroundColor: CHART_COLORS[0] },
                      { label: 'Expenses', data: dailyTrend.map((p) => p.expenses), borderColor: CHART_COLORS[6], backgroundColor: CHART_COLORS[6] },
                      { label: 'Net Cash Flow', data: dailyTrend.map((p) => p.net), borderColor: CHART_COLORS[1], backgroundColor: CHART_COLORS[1] },
                    ],
                  }}
                />
              </div>
            </div>
          </div>

          <section aria-labelledby="category-breakdown-heading">
            <h2 id="category-breakdown-heading" className="section-title">
              Category Breakdown
            </h2>
            <div className="chart-grid">
              <div className="chart-card">
                <h3>Donations by Category</h3>
                {donationCategoryTotals.length === 0 ? (
                  <p className="text-muted">No donations in this range.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th className="text-right">Amount</th>
                          <th className="text-right">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {donationCategoryTotals.map((c) => (
                          <tr key={c.categoryId}>
                            <td>{c.categoryName}</td>
                            <td className="text-right">{formatCurrency(c.total)}</td>
                            <td className="text-right">{c.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="chart-card">
                <h3>Expenses by Category</h3>
                {expenseCategoryTotals.length === 0 ? (
                  <p className="text-muted">No expenses in this range.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th className="text-right">Amount</th>
                          <th className="text-right">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseCategoryTotals.map((c) => (
                          <tr key={c.categoryId}>
                            <td>{c.categoryName}</td>
                            <td className="text-right">{formatCurrency(c.total)}</td>
                            <td className="text-right">{c.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="commodity-heading">
            <h2 id="commodity-heading" className="section-title">
              Commodity Donations
            </h2>
            {commodityTotals.length === 0 ? (
              <p className="text-muted">No commodity donations in this range.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Commodity</th>
                      <th>Total Quantity</th>
                      <th>Unit</th>
                      <th>Donors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commodityTotals.map((c) => (
                      <tr key={`${c.commodityName}-${c.unitId}`}>
                        <td>{c.commodityName}</td>
                        <td>{formatNumber(c.totalQuantity)}</td>
                        <td>{c.unitName}</td>
                        <td>{c.donorCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="page__note">
              Quantities are grouped strictly by commodity + unit — quantities in different units (e.g. kg and litres)
              are never combined.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
