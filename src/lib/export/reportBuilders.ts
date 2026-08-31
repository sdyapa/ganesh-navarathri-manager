// Builds table/summary data shared by PDF and PNG exports (see pdf.ts / png.ts). Every amount
// column takes a `formatAmount` callback rather than calling formatCurrency directly: jsPDF's
// built-in fonts can't render the ₹ glyph (see formatCurrencyForPdf's doc comment), so PDF
// callers must pass formatCurrencyForPdf, while PNG export renders real DOM/canvas text (no
// font limitation) and passes plain formatCurrency instead — same table shape, different
// formatter. Defaults to formatCurrencyForPdf so existing PDF call sites don't need to change.
// On-screen React components must keep using formatCurrency from '@/lib/currency' directly.
import { formatCurrencyForPdf, formatNumber } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/date'
import type { Auction, Category, Donation, Expense, FinancialSummary, Unit } from '@/types'
import type { PdfTableSpec } from './pdf'

type AmountFormatter = (amount: number | undefined | null) => string

function categoryName(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? 'Uncategorized'
}
function unitName(units: Unit[], id?: string): string {
  return units.find((u) => u.id === id)?.name ?? ''
}

/** Monetary and commodity donations are fundamentally different records (an amount vs. a
 *  quantity + unit) — combining them into one table with a shared "Amount / Commodity" column
 *  made it hard to scan either kind on its own, so exports render them as two separate tables
 *  (see buildMonetaryDonationsTable / buildCommodityDonationsTable) instead of one mixed table. */
export function buildMonetaryDonationsTable(
  donations: Donation[],
  categories: Category[],
  formatAmount: AmountFormatter = formatCurrencyForPdf,
): PdfTableSpec {
  return {
    head: ['Date', 'Donor', 'Amount', 'Category', 'Notes'],
    rows: donations
      .filter((d) => d.type === 'monetary')
      .map((d) => [
        formatDisplayDate(d.date),
        d.donorName,
        formatAmount(d.amount),
        categoryName(categories, d.categoryId),
        d.notes ?? '',
      ]),
  }
}

export function buildCommodityDonationsTable(donations: Donation[], categories: Category[], units: Unit[]): PdfTableSpec {
  return {
    head: ['Date', 'Donor', 'Commodity', 'Quantity', 'Unit', 'Category', 'Notes'],
    rows: donations
      .filter((d) => d.type === 'commodity')
      .map((d) => [
        formatDisplayDate(d.date),
        d.donorName,
        d.commodityName ?? '',
        formatNumber(d.quantity),
        unitName(units, d.unitId),
        categoryName(categories, d.categoryId),
        d.notes ?? '',
      ]),
  }
}

export function buildExpensesTable(
  expenses: Expense[],
  categories: Category[],
  formatAmount: AmountFormatter = formatCurrencyForPdf,
): PdfTableSpec {
  return {
    head: ['Date', 'Description', 'Amount', 'Category', 'Notes'],
    rows: expenses.map((e) => [
      formatDisplayDate(e.date),
      e.description,
      formatAmount(e.amount),
      categoryName(categories, e.categoryId),
      e.notes ?? '',
    ]),
  }
}

export function buildAuctionsTable(auctions: Auction[], formatAmount: AmountFormatter = formatCurrencyForPdf): PdfTableSpec {
  return {
    head: ['Date', 'Item', 'Person', 'Amount', 'Notes'],
    rows: auctions.map((a) => [formatDisplayDate(a.date), a.item, a.person, formatAmount(a.amount), a.notes ?? '']),
  }
}

export function buildSummaryLines(summary: FinancialSummary): string[] {
  return [
    // Cash-in-hand lines end at Closing Balance — auction proceeds and Expected amounts are
    // deliberately listed after it since neither is cash yet (see FinancialSummary's doc
    // comments in types/index.ts).
    `Opening Balance: ${formatCurrencyForPdf(summary.openingBalance)}`,
    `Monetary Donations: ${formatCurrencyForPdf(summary.totalMonetaryDonations)} (${summary.counts.monetaryDonations})`,
    `Commodity Donations: ${summary.counts.commodityDonations} entr(y/ies)`,
    `Total Expenses: ${formatCurrencyForPdf(summary.totalExpenses)} (${summary.counts.expenses})`,
    `Closing Balance: ${formatCurrencyForPdf(summary.closingBalance)}`,
    `Auction Proceeds (pledged, collected next year): ${formatCurrencyForPdf(summary.totalAuctionProceeds)} (${summary.counts.auctions})`,
    `Expected Monetary Donations: ${formatCurrencyForPdf(summary.expectedMonetaryDonations)} (${summary.counts.expectedDonations} pending)`,
    `Expected Expenses: ${formatCurrencyForPdf(summary.expectedExpenses)} (${summary.counts.expectedExpenses} pending)`,
  ]
}
