// Builds table/summary data specifically for PDF export (see pdf.ts) — every amount here goes
// through formatCurrencyForPdf, not formatCurrency, because jsPDF's built-in fonts can't render
// the ₹ glyph (see that function's doc comment). On-screen React components must keep using
// formatCurrency from '@/lib/currency' directly — never import formatCurrencyForPdf there.
import { formatCurrencyForPdf, formatNumber } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/date'
import type { Auction, Category, Donation, Expense, FinancialSummary, Unit } from '@/types'
import type { PdfTableSpec } from './pdf'

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
export function buildMonetaryDonationsTable(donations: Donation[], categories: Category[]): PdfTableSpec {
  return {
    head: ['Date', 'Donor', 'Amount', 'Category', 'Notes'],
    rows: donations
      .filter((d) => d.type === 'monetary')
      .map((d) => [
        formatDisplayDate(d.date),
        d.donorName,
        formatCurrencyForPdf(d.amount),
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

export function buildExpensesTable(expenses: Expense[], categories: Category[]): PdfTableSpec {
  return {
    head: ['Date', 'Description', 'Amount', 'Category', 'Notes'],
    rows: expenses.map((e) => [
      formatDisplayDate(e.date),
      e.description,
      formatCurrencyForPdf(e.amount),
      categoryName(categories, e.categoryId),
      e.notes ?? '',
    ]),
  }
}

export function buildAuctionsTable(auctions: Auction[]): PdfTableSpec {
  return {
    head: ['Date', 'Item', 'Person', 'Amount', 'Notes'],
    rows: auctions.map((a) => [formatDisplayDate(a.date), a.item, a.person, formatCurrencyForPdf(a.amount), a.notes ?? '']),
  }
}

export function buildSummaryLines(summary: FinancialSummary): string[] {
  return [
    `Opening Balance: ${formatCurrencyForPdf(summary.openingBalance)}`,
    `Monetary Donations: ${formatCurrencyForPdf(summary.totalMonetaryDonations)} (${summary.counts.monetaryDonations})`,
    `Commodity Donations: ${summary.counts.commodityDonations} entr(y/ies)`,
    `Auction Proceeds: ${formatCurrencyForPdf(summary.totalAuctionProceeds)} (${summary.counts.auctions})`,
    `Total Expenses: ${formatCurrencyForPdf(summary.totalExpenses)} (${summary.counts.expenses})`,
    `Closing Balance: ${formatCurrencyForPdf(summary.closingBalance)}`,
    `Expected Monetary Donations: ${formatCurrencyForPdf(summary.expectedMonetaryDonations)} (${summary.counts.expectedDonations} pending)`,
    `Expected Expenses: ${formatCurrencyForPdf(summary.expectedExpenses)} (${summary.counts.expectedExpenses} pending)`,
  ]
}
