import { useMemo } from 'react'
import { useYearContext } from '@/context/YearContext'
import {
  useAuctions,
  useCategories,
  useDonations,
  useExpectedDonations,
  useExpectedExpenses,
  useExpenses,
  useUnits,
} from '@/hooks/useYearData'
import {
  computeCategoryTotals,
  computeCommodityTotals,
  computeDailyTrend,
  computeFinancialSummary,
} from '@/lib/calculations'

/** Central place every dashboard/report screen pulls numbers from — reactive to any CRUD
 *  change via Dexie's live queries, and always the same math as the calculation engine tests. */
export function useYearSummary() {
  const { currentYear, currentYearId } = useYearContext()
  const donations = useDonations(currentYearId)
  const expectedDonations = useExpectedDonations(currentYearId)
  const expenses = useExpenses(currentYearId)
  const expectedExpenses = useExpectedExpenses(currentYearId)
  const auctions = useAuctions(currentYearId)
  const donationCategories = useCategories('donation')
  const expenseCategories = useCategories('expense')
  const units = useUnits()

  const loading =
    !currentYearId ||
    donations === undefined ||
    expectedDonations === undefined ||
    expenses === undefined ||
    expectedExpenses === undefined ||
    auctions === undefined ||
    donationCategories === undefined ||
    expenseCategories === undefined ||
    units === undefined

  const summary = useMemo(() => {
    if (loading || !currentYear) return undefined
    return computeFinancialSummary({
      yearProfileId: currentYear.id,
      openingBalance: currentYear.openingBalance,
      donations: donations!,
      expectedDonations: expectedDonations!,
      expenses: expenses!,
      expectedExpenses: expectedExpenses!,
      auctions: auctions!,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentYear, donations, expectedDonations, expenses, expectedExpenses, auctions])

  const commodityTotals = useMemo(() => {
    if (loading) return []
    return computeCommodityTotals(donations!, units!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, donations, units])

  const donationCategoryTotals = useMemo(() => {
    if (loading) return []
    const monetary = donations!.filter((d) => d.type === 'monetary')
    const auctionAsCategory = auctions!.map((a) => ({ categoryId: '__auction__', amount: a.amount }))
    const combined = computeCategoryTotals(monetary, donationCategories!)
    if (auctionAsCategory.length > 0) {
      combined.push({
        categoryId: '__auction__',
        categoryName: 'Auction',
        total: auctionAsCategory.reduce((s, a) => s + a.amount, 0),
        count: auctionAsCategory.length,
      })
    }
    return combined.sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, donations, auctions, donationCategories])

  const expenseCategoryTotals = useMemo(() => {
    if (loading) return []
    return computeCategoryTotals(expenses!, expenseCategories!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, expenses, expenseCategories])

  const dailyTrend = useMemo(() => {
    if (loading) return []
    return computeDailyTrend(donations!, expenses!, auctions!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, donations, expenses, auctions])

  return {
    loading,
    currentYear,
    summary,
    donations: donations ?? [],
    expectedDonations: expectedDonations ?? [],
    expenses: expenses ?? [],
    expectedExpenses: expectedExpenses ?? [],
    auctions: auctions ?? [],
    donationCategories: donationCategories ?? [],
    expenseCategories: expenseCategories ?? [],
    units: units ?? [],
    commodityTotals,
    donationCategoryTotals,
    expenseCategoryTotals,
    dailyTrend,
  }
}
