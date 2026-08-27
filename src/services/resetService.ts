import { db } from '@/db/db'
import { ensureAppInitialized } from '@/db/init'
import type { YearProfile } from '@/types'

export interface ResetImpact {
  years: number
  donations: number
  expectedDonations: number
  expenses: number
  expectedExpenses: number
  auctions: number
}

export async function getResetImpact(): Promise<ResetImpact> {
  const [years, donations, expectedDonations, expenses, expectedExpenses, auctions] = await Promise.all([
    db.yearProfiles.count(),
    db.donations.count(),
    db.expectedDonations.count(),
    db.expenses.count(),
    db.expectedExpenses.count(),
    db.auctions.count(),
  ])
  return { years, donations, expectedDonations, expenses, expectedExpenses, auctions }
}

/** Wipes every table and reseeds default categories/units/settings and a fresh current-year profile. */
export async function resetApplication(): Promise<YearProfile[]> {
  await db.transaction(
    'rw',
    [db.yearProfiles, db.donations, db.expectedDonations, db.expenses, db.expectedExpenses, db.auctions, db.categories, db.units, db.appSettings],
    async () => {
      await Promise.all([
        db.yearProfiles.clear(),
        db.donations.clear(),
        db.expectedDonations.clear(),
        db.expenses.clear(),
        db.expectedExpenses.clear(),
        db.auctions.clear(),
        db.categories.clear(),
        db.units.clear(),
        db.appSettings.clear(),
      ])
    },
  )
  return ensureAppInitialized()
}
