// Financial calculation engine — pure functions only, no DB/React dependency, so they can be
// unit tested in isolation (see src/test/calculations.test.ts) and reused identically by the
// dashboard, reports, and PDF/PNG exports.
//
// Hard rules (do not relax these — see spec "Data Integrity Rules"):
//   1. Actual closing balance = opening + actual monetary donations + auction proceeds - actual expenses.
//   2. Expected donations/expenses NEVER affect the actual balance, only once converted/moved.
//   3. Commodity donations are never treated as cash.
//   4. Auction proceeds are tracked separately from monetary donations.
import type {
  Auction,
  Category,
  CommodityTotal,
  Donation,
  ExpectedDonation,
  ExpectedExpense,
  Expense,
  FinancialSummary,
  Unit,
} from '@/types'

export interface SummaryInput {
  yearProfileId: string
  openingBalance: number
  donations: Donation[]
  expectedDonations: ExpectedDonation[]
  expenses: Expense[]
  expectedExpenses: ExpectedExpense[]
  auctions: Auction[]
}

const sum = (values: Array<number | undefined>): number =>
  values.reduce((acc: number, v) => acc + (Number.isFinite(v) ? (v as number) : 0), 0)

export function computeFinancialSummary(input: SummaryInput): FinancialSummary {
  const { yearProfileId, openingBalance, donations, expectedDonations, expenses, expectedExpenses, auctions } = input

  const monetaryDonations = donations.filter((d) => d.type === 'monetary')
  const commodityDonations = donations.filter((d) => d.type === 'commodity')

  const totalMonetaryDonations = sum(monetaryDonations.map((d) => d.amount))
  const totalAuctionProceeds = sum(auctions.map((a) => a.amount))
  const totalExpenses = sum(expenses.map((e) => e.amount))
  const closingBalance = openingBalance + totalMonetaryDonations + totalAuctionProceeds - totalExpenses

  const pendingExpectedDonations = expectedDonations.filter((d) => d.status === 'pending')
  const pendingExpectedExpenses = expectedExpenses.filter((e) => e.status === 'pending')

  const expectedMonetaryDonations = sum(
    pendingExpectedDonations.filter((d) => d.type === 'monetary').map((d) => d.amount),
  )
  const expectedCommodityDonationCount = pendingExpectedDonations.filter((d) => d.type === 'commodity').length
  const expectedExpensesTotal = sum(pendingExpectedExpenses.map((e) => e.amount))

  return {
    yearProfileId,
    openingBalance,
    totalMonetaryDonations,
    totalAuctionProceeds,
    totalExpenses,
    closingBalance,
    totalCommodityDonationCount: commodityDonations.length,
    expectedMonetaryDonations,
    expectedCommodityDonationCount,
    expectedExpenses: expectedExpensesTotal,
    counts: {
      monetaryDonations: monetaryDonations.length,
      commodityDonations: commodityDonations.length,
      auctions: auctions.length,
      expenses: expenses.length,
      expectedDonations: pendingExpectedDonations.length,
      expectedExpenses: pendingExpectedExpenses.length,
    },
  }
}

export interface CategoryTotal {
  categoryId: string
  categoryName: string
  total: number
  count: number
}

/** Groups monetary amounts by category. Categories are looked up by id so a renamed or
 *  deactivated category still resolves correctly for historical records. */
export function computeCategoryTotals(
  records: Array<{ categoryId: string; amount?: number }>,
  categories: Category[],
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c.name]))
  const totals = new Map<string, CategoryTotal>()
  for (const record of records) {
    if (!Number.isFinite(record.amount)) continue
    const name = byId.get(record.categoryId) ?? 'Uncategorized'
    const existing = totals.get(record.categoryId)
    if (existing) {
      existing.total += record.amount as number
      existing.count += 1
    } else {
      totals.set(record.categoryId, {
        categoryId: record.categoryId,
        categoryName: name,
        total: record.amount as number,
        count: 1,
      })
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total)
}

/** Groups commodity donations by (commodity name, unit) — quantities in different units are
 *  NEVER summed together (50 kg + 10 litres must stay two separate rows). */
export function computeCommodityTotals(donations: Donation[], units: Unit[]): CommodityTotal[] {
  const unitById = new Map(units.map((u) => [u.id, u.name]))
  const groups = new Map<string, CommodityTotal & { donorNames: Set<string> }>()

  for (const d of donations) {
    if (d.type !== 'commodity') continue
    const name = (d.commodityName ?? '').trim()
    if (!name) continue
    const unitId = d.unitId ?? 'unknown'
    const key = `${name.toLowerCase()}::${unitId}`
    const existing = groups.get(key)
    const qty = Number.isFinite(d.quantity) ? (d.quantity as number) : 0
    const donorKey = d.donorName.trim().toLowerCase()
    if (existing) {
      existing.totalQuantity += qty
      existing.donorNames.add(donorKey)
    } else {
      groups.set(key, {
        commodityName: name,
        unitId,
        unitName: unitById.get(unitId) ?? 'unit',
        totalQuantity: qty,
        donorCount: 0,
        donorNames: new Set([donorKey]),
      })
    }
  }

  return Array.from(groups.values())
    .map(({ donorNames, ...rest }) => ({ ...rest, donorCount: donorNames.size }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
}

export interface DailyTrendPoint {
  date: string
  donations: number
  expenses: number
  auctions: number
  net: number
}

export function computeDailyTrend(
  donations: Donation[],
  expenses: Expense[],
  auctions: Auction[],
): DailyTrendPoint[] {
  const byDate = new Map<string, DailyTrendPoint>()
  const ensure = (date: string) => {
    let point = byDate.get(date)
    if (!point) {
      point = { date, donations: 0, expenses: 0, auctions: 0, net: 0 }
      byDate.set(date, point)
    }
    return point
  }

  for (const d of donations) {
    // A commodity donation still creates a point for its date (at ₹0 cash) so the day isn't
    // silently dropped from the trend — only its monetary value is excluded from the cash line.
    const point = ensure(d.date)
    if (d.type === 'monetary' && Number.isFinite(d.amount)) {
      point.donations += d.amount as number
    }
  }
  for (const a of auctions) {
    ensure(a.date).auctions += a.amount
  }
  for (const e of expenses) {
    ensure(e.date).expenses += e.amount
  }

  const points = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const p of points) {
    p.net = p.donations + p.auctions - p.expenses
  }
  return points
}

/** Computes the new year's opening balance when carry-forward is enabled. */
export function computeCarryForwardOpeningBalance(previousYearClosingBalance: number): number {
  return previousYearClosingBalance
}
