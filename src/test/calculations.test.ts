import { describe, expect, it } from 'vitest'
import {
  computeCarryForwardOpeningBalance,
  computeCategoryTotals,
  computeCommodityTotals,
  computeDailyTrend,
  computeFinancialSummary,
} from '@/lib/calculations'
import type { Auction, Donation, ExpectedDonation, ExpectedExpense, Expense } from '@/types'

function donation(overrides: Partial<Donation>): Donation {
  return {
    id: overrides.id ?? 'd1',
    yearProfileId: 'y1',
    donorName: 'Donor',
    type: 'monetary',
    date: '2026-08-20',
    categoryId: 'cat-chanda',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id ?? 'e1',
    yearProfileId: 'y1',
    description: 'Expense',
    amount: 0,
    date: '2026-08-20',
    categoryId: 'cat-pooja',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function auction(overrides: Partial<Auction>): Auction {
  return {
    id: overrides.id ?? 'a1',
    yearProfileId: 'y1',
    item: 'Item',
    person: 'Person',
    amount: 0,
    date: '2026-08-20',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('computeFinancialSummary', () => {
  it('matches the spec worked example exactly', () => {
    // Opening 20,000 + donations 1,00,000 + auction 20,000 - expenses 70,000 = 70,000
    // Expected donations/expenses and commodity donations must NOT affect this number.
    const donations: Donation[] = [donation({ id: 'd1', amount: 100000, type: 'monetary' })]
    const commodity: Donation[] = [
      donation({ id: 'd2', type: 'commodity', commodityName: 'Rice', quantity: 50, unitId: 'kg', amount: undefined }),
    ]
    const expenses: Expense[] = [expense({ amount: 70000 })]
    const auctions: Auction[] = [auction({ amount: 20000 })]
    const expectedDonations: ExpectedDonation[] = [
      { ...donation({ amount: 50000 }), status: 'pending', convertedDonationId: null } as ExpectedDonation,
    ]
    const expectedExpenses: ExpectedExpense[] = [
      { ...expense({ amount: 10000 }), status: 'pending', convertedExpenseId: null } as ExpectedExpense,
    ]

    const summary = computeFinancialSummary({
      yearProfileId: 'y1',
      openingBalance: 20000,
      donations: [...donations, ...commodity],
      expectedDonations,
      expenses,
      expectedExpenses,
      auctions,
    })

    expect(summary.closingBalance).toBe(70000)
    expect(summary.totalMonetaryDonations).toBe(100000)
    expect(summary.totalAuctionProceeds).toBe(20000)
    expect(summary.totalExpenses).toBe(70000)
    expect(summary.expectedMonetaryDonations).toBe(50000)
    expect(summary.expectedExpenses).toBe(10000)
    expect(summary.totalCommodityDonationCount).toBe(1)
    expect(summary.counts.monetaryDonations).toBe(1)
    expect(summary.counts.commodityDonations).toBe(1)
  })

  it('excludes converted expected donations/expenses from expected totals', () => {
    const expectedDonations: ExpectedDonation[] = [
      { ...donation({ amount: 5000 }), status: 'converted', convertedDonationId: 'd-actual' } as ExpectedDonation,
      { ...donation({ id: 'd3', amount: 3000 }), status: 'pending', convertedDonationId: null } as ExpectedDonation,
    ]
    const summary = computeFinancialSummary({
      yearProfileId: 'y1',
      openingBalance: 0,
      donations: [],
      expectedDonations,
      expenses: [],
      expectedExpenses: [],
      auctions: [],
    })
    expect(summary.expectedMonetaryDonations).toBe(3000)
    expect(summary.counts.expectedDonations).toBe(1)
  })

  it('never lets a ₹0 or negative record silently distort the balance beyond what was entered', () => {
    const summary = computeFinancialSummary({
      yearProfileId: 'y1',
      openingBalance: 100,
      donations: [],
      expectedDonations: [],
      expenses: [],
      expectedExpenses: [],
      auctions: [],
    })
    expect(summary.closingBalance).toBe(100)
  })
})

describe('carry-forward', () => {
  it('uses the exact previous closing balance as next opening balance', () => {
    // 2026: opening 0 + donations 1,50,000 + auction 20,000 - expenses 1,00,000 = 70,000
    const summary2026 = computeFinancialSummary({
      yearProfileId: 'y2026',
      openingBalance: 0,
      donations: [donation({ amount: 150000 })],
      expectedDonations: [],
      expenses: [expense({ amount: 100000 })],
      expectedExpenses: [],
      auctions: [auction({ amount: 20000 })],
    })
    expect(summary2026.closingBalance).toBe(70000)

    const opening2027 = computeCarryForwardOpeningBalance(summary2026.closingBalance)
    expect(opening2027).toBe(70000)

    // 2027: opening 70,000 + donations 30,000 - expenses 20,000 = 80,000
    const summary2027 = computeFinancialSummary({
      yearProfileId: 'y2027',
      openingBalance: opening2027,
      donations: [donation({ amount: 30000 })],
      expectedDonations: [],
      expenses: [expense({ amount: 20000 })],
      expectedExpenses: [],
      auctions: [],
    })
    expect(summary2027.closingBalance).toBe(80000)
  })
})

describe('computeCommodityTotals', () => {
  it('never combines quantities across different units', () => {
    const donations: Donation[] = [
      donation({ id: 'd1', type: 'commodity', commodityName: 'Rice', quantity: 50, unitId: 'kg', donorName: 'A' }),
      donation({ id: 'd2', type: 'commodity', commodityName: 'Rice', quantity: 10, unitId: 'litre', donorName: 'B' }),
      donation({ id: 'd3', type: 'commodity', commodityName: 'Rice', quantity: 25, unitId: 'kg', donorName: 'C' }),
    ]
    const units = [
      { id: 'kg', name: 'kg', active: true, order: 0, isDefault: true },
      { id: 'litre', name: 'litre', active: true, order: 1, isDefault: true },
    ]
    const totals = computeCommodityTotals(donations, units)
    const kgRow = totals.find((t) => t.unitId === 'kg')!
    const litreRow = totals.find((t) => t.unitId === 'litre')!
    expect(kgRow.totalQuantity).toBe(75)
    expect(litreRow.totalQuantity).toBe(10)
    expect(totals).toHaveLength(2)
  })

  it('counts distinct donors, and supports decimal quantities', () => {
    const donations: Donation[] = [
      donation({ id: 'd1', type: 'commodity', commodityName: 'Oil', quantity: 1.5, unitId: 'litre', donorName: 'Ramesh' }),
      donation({ id: 'd2', type: 'commodity', commodityName: 'Oil', quantity: 2.75, unitId: 'litre', donorName: 'Ramesh' }),
      donation({ id: 'd3', type: 'commodity', commodityName: 'Oil', quantity: 1, unitId: 'litre', donorName: 'Suresh' }),
    ]
    const units = [{ id: 'litre', name: 'litre', active: true, order: 0, isDefault: true }]
    const totals = computeCommodityTotals(donations, units)
    expect(totals).toHaveLength(1)
    expect(totals[0].totalQuantity).toBeCloseTo(5.25)
    expect(totals[0].donorCount).toBe(2)
  })
})

describe('computeCategoryTotals', () => {
  it('resolves category names by id and groups totals', () => {
    const categories = [
      { id: 'c1', kind: 'donation' as const, name: 'Chanda', active: true, order: 0, isDefault: true },
      { id: 'c2', kind: 'donation' as const, name: 'Annadanam', active: false, order: 1, isDefault: true },
    ]
    const records = [{ categoryId: 'c1', amount: 1000 }, { categoryId: 'c1', amount: 500 }, { categoryId: 'c2', amount: 300 }]
    const totals = computeCategoryTotals(records, categories)
    expect(totals.find((t) => t.categoryId === 'c1')?.total).toBe(1500)
    expect(totals.find((t) => t.categoryId === 'c2')?.total).toBe(300)
  })

  it('still resolves a deactivated category name for historical records', () => {
    const categories = [{ id: 'c2', kind: 'expense' as const, name: 'Old Category', active: false, order: 0, isDefault: false }]
    const totals = computeCategoryTotals([{ categoryId: 'c2', amount: 200 }], categories)
    expect(totals[0].categoryName).toBe('Old Category')
  })
})

describe('computeDailyTrend', () => {
  it('aggregates donations, expenses and auctions per day and computes net', () => {
    const donations = [donation({ date: '2026-08-20', amount: 1000 })]
    const expenses = [expense({ date: '2026-08-20', amount: 400 })]
    const auctions = [auction({ date: '2026-08-20', amount: 200 })]
    const trend = computeDailyTrend(donations, expenses, auctions)
    expect(trend).toHaveLength(1)
    expect(trend[0].net).toBe(1000 + 200 - 400)
  })

  it('excludes commodity donations from the monetary trend line', () => {
    const donations = [donation({ date: '2026-08-20', type: 'commodity', amount: undefined, quantity: 5, unitId: 'kg' })]
    const trend = computeDailyTrend(donations, [], [])
    expect(trend[0].donations).toBe(0)
  })
})
