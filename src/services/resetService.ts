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
  tasks: number
  keyEvents: number
  poojaAssignments: number
}

export async function getResetImpact(): Promise<ResetImpact> {
  const [years, donations, expectedDonations, expenses, expectedExpenses, auctions, tasks, keyEvents, poojaAssignments] =
    await Promise.all([
      db.yearProfiles.count(),
      db.donations.count(),
      db.expectedDonations.count(),
      db.expenses.count(),
      db.expectedExpenses.count(),
      db.auctions.count(),
      db.tasks.count(),
      db.keyEvents.count(),
      db.poojaAssignments.count(),
    ])
  return { years, donations, expectedDonations, expenses, expectedExpenses, auctions, tasks, keyEvents, poojaAssignments }
}

/** Wipes every table and reseeds default categories/units/settings and a fresh current-year profile. */
export async function resetApplication(): Promise<YearProfile[]> {
  await db.transaction(
    'rw',
    [
      db.yearProfiles,
      db.donations,
      db.expectedDonations,
      db.expenses,
      db.expectedExpenses,
      db.auctions,
      db.categories,
      db.units,
      db.profiles,
      db.tasks,
      db.keyEvents,
      db.poojaAssignments,
      db.appSettings,
    ],
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
        db.profiles.clear(),
        db.tasks.clear(),
        db.keyEvents.clear(),
        db.poojaAssignments.clear(),
        db.appSettings.clear(),
      ])
    },
  )
  return ensureAppInitialized()
}
