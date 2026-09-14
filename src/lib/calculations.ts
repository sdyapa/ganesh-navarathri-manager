// Financial calculation engine — pure functions only, no DB/React dependency, so they can be
// unit tested in isolation (see src/test/calculations.test.ts) and reused identically by the
// dashboard, reports, and PDF/PNG exports.
//
// Hard rules (do not relax these — see spec "Data Integrity Rules"):
//   1. Actual closing balance = opening + actual monetary donations - actual expenses.
//   2. Expected donations/expenses NEVER affect the actual balance, only once converted/moved.
//   3. Commodity donations are never treated as cash.
//   4. Auction proceeds are NEVER treated as cash either, and for the same reason: an auction
//      win is a pledge, not money in hand — the winner pays the following year's festival (see
//      conversionService's convertAuctionToExpectedDonation). totalAuctionProceeds is still
//      computed and reported for visibility, it's just excluded from closingBalance/net cash
//      flow until the pledge is actually converted and collected as a real Donation.
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

/** How much of a monetary pledge is still outstanding — its full amount minus whatever's
 *  already been collected via installmentDonationIds (see ExpectedDonation's doc comment). A
 *  plain 'pending' pledge with no installments yet is fully outstanding (its whole amount);
 *  this only differs from `pledge.amount` once at least one partial payment has been recorded.
 *  `donations` must be the same year's Donation list the pledge's installments were inserted
 *  into (always true for computeFinancialSummary's per-year call). Never negative — an
 *  over-collected pledge (shouldn't normally happen since recordPartialPayment marks it
 *  'converted' once the total reaches the full amount) still reports 0 outstanding rather than
 *  a confusing negative "expected" figure. */
export function computeOutstandingPledgeAmount(pledge: ExpectedDonation, donations: Donation[]): number {
  if (!pledge.installmentDonationIds || pledge.installmentDonationIds.length === 0) {
    return pledge.amount ?? 0
  }
  const collected = sum(
    pledge.installmentDonationIds.map((id) => donations.find((d) => d.id === id)?.amount),
  )
  return Math.max(0, (pledge.amount ?? 0) - collected)
}

export function computeFinancialSummary(input: SummaryInput): FinancialSummary {
  const { yearProfileId, openingBalance, donations, expectedDonations, expenses, expectedExpenses, auctions } = input

  const monetaryDonations = donations.filter((d) => d.type === 'monetary')
  const commodityDonations = donations.filter((d) => d.type === 'commodity')

  const totalMonetaryDonations = sum(monetaryDonations.map((d) => d.amount))
  const totalAuctionProceeds = sum(auctions.map((a) => a.amount))
  const totalExpenses = sum(expenses.map((e) => e.amount))
  // Auction proceeds are deliberately excluded — see the "Hard rules" comment above.
  const closingBalance = openingBalance + totalMonetaryDonations - totalExpenses

  // 'partially-paid' pledges are still outstanding (only 'converted' means fully collected), so
  // they count as "expected" alongside plain 'pending' ones — see computeOutstandingPledgeAmount
  // below for why the *amount* counted is the remaining balance, not the full pledge.
  const pendingExpectedDonations = expectedDonations.filter((d) => d.status !== 'converted')
  const pendingExpectedExpenses = expectedExpenses.filter((e) => e.status === 'pending')

  const expectedMonetaryDonations = sum(
    pendingExpectedDonations
      .filter((d) => d.type === 'monetary')
      .map((d) => computeOutstandingPledgeAmount(d, donations)),
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
    // Auction proceeds excluded from net cash flow for the same reason as closingBalance
    // above — a win isn't cash until collected the following year.
    p.net = p.donations - p.expenses
  }
  return points
}

/** Computes the new year's opening balance when carry-forward is enabled. */
export function computeCarryForwardOpeningBalance(previousYearClosingBalance: number): number {
  return previousYearClosingBalance
}

/** What fraction (0-1) of funds available so far (opening balance + monetary donations
 *  received) has already been spent — the needle position for the Dashboard's speedometer
 *  gauge (see BalanceGauge.tsx). 0 = nothing spent yet, 1 = every rupee available has been
 *  spent (closing balance is exactly zero), and it can exceed 1 when spending has gone into
 *  the negative. Returns 0 when there are no funds available at all (avoids a 0/0 or
 *  divide-by-zero producing NaN/Infinity on a brand-new year with no records yet). */
export function computeSpentFraction(openingBalance: number, totalMonetaryDonations: number, totalExpenses: number): number {
  const available = openingBalance + totalMonetaryDonations
  if (available <= 0) return totalExpenses > 0 ? 1 : 0
  return totalExpenses / available
}
