import { formatCurrency, formatNumber } from '@/lib/currency'
import { formatDisplayDate } from '@/lib/date'
import type { Auction, Category, Donation, Expense, FinancialSummary, Unit } from '@/types'
import type { PdfTableSpec } from './pdf'

function categoryName(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? 'Uncategorized'
}
function unitName(units: Unit[], id?: string): string {
  return units.find((u) => u.id === id)?.name ?? ''
}

export function buildDonationsTable(donations: Donation[], categories: Category[], units: Unit[]): PdfTableSpec {
  return {
    head: ['Date', 'Donor', 'Type', 'Amount / Commodity', 'Category', 'Notes'],
    rows: donations.map((d) => [
      formatDisplayDate(d.date),
      d.donorName,
      d.type === 'monetary' ? 'Monetary' : 'Commodity',
      d.type === 'monetary' ? formatCurrency(d.amount) : `${d.commodityName} — ${formatNumber(d.quantity)} ${unitName(units, d.unitId)}`,
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
      formatCurrency(e.amount),
      categoryName(categories, e.categoryId),
      e.notes ?? '',
    ]),
  }
}

export function buildAuctionsTable(auctions: Auction[]): PdfTableSpec {
  return {
    head: ['Date', 'Item', 'Person', 'Amount', 'Notes'],
    rows: auctions.map((a) => [formatDisplayDate(a.date), a.item, a.person, formatCurrency(a.amount), a.notes ?? '']),
  }
}

export function buildSummaryLines(summary: FinancialSummary): string[] {
  return [
    `Opening Balance: ${formatCurrency(summary.openingBalance)}`,
    `Monetary Donations: ${formatCurrency(summary.totalMonetaryDonations)} (${summary.counts.monetaryDonations})`,
    `Commodity Donations: ${summary.counts.commodityDonations} entr(y/ies)`,
    `Auction Proceeds: ${formatCurrency(summary.totalAuctionProceeds)} (${summary.counts.auctions})`,
    `Total Expenses: ${formatCurrency(summary.totalExpenses)} (${summary.counts.expenses})`,
    `Closing Balance: ${formatCurrency(summary.closingBalance)}`,
    `Expected Monetary Donations: ${formatCurrency(summary.expectedMonetaryDonations)} (${summary.counts.expectedDonations} pending)`,
    `Expected Expenses: ${formatCurrency(summary.expectedExpenses)} (${summary.counts.expectedExpenses} pending)`,
  ]
}
