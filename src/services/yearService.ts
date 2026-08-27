import { computeFinancialSummary } from '@/lib/calculations'
import {
  deleteYearProfileCascade,
  getYearProfile,
  insertYearProfile,
  listYearProfiles,
  updateYearProfile,
  yearExists,
} from '@/db/repositories/yearProfiles'
import { listDonationsForYear } from '@/db/repositories/donations'
import { listExpectedDonationsForYear } from '@/db/repositories/expectedDonations'
import { listExpensesForYear } from '@/db/repositories/expenses'
import { listExpectedExpensesForYear } from '@/db/repositories/expectedExpenses'
import { listAuctionsForYear } from '@/db/repositories/auctions'
import type { YearProfile } from '@/types'

export async function getYearClosingBalance(yearProfileId: string): Promise<number> {
  const profile = await getYearProfile(yearProfileId)
  if (!profile) throw new Error('Year profile not found')
  const [donations, expectedDonations, expenses, expectedExpenses, auctions] = await Promise.all([
    listDonationsForYear(yearProfileId),
    listExpectedDonationsForYear(yearProfileId),
    listExpensesForYear(yearProfileId),
    listExpectedExpensesForYear(yearProfileId),
    listAuctionsForYear(yearProfileId),
  ])
  const summary = computeFinancialSummary({
    yearProfileId,
    openingBalance: profile.openingBalance,
    donations,
    expectedDonations,
    expenses,
    expectedExpenses,
    auctions,
  })
  return summary.closingBalance
}

export interface CreateYearOptions {
  year: number
  name: string
  carryForward: boolean
  /** Which existing year to carry the closing balance forward from. Defaults to the most recent year. */
  carryForwardFromYearId?: string
}

export async function createYearProfile(options: CreateYearOptions): Promise<YearProfile> {
  if (await yearExists(options.year)) {
    throw new Error(`A profile for ${options.year} already exists.`)
  }

  let openingBalance = 0
  let sourceYearId: string | null = null

  if (options.carryForward) {
    const profiles = await listYearProfiles()
    const source = options.carryForwardFromYearId
      ? profiles.find((p) => p.id === options.carryForwardFromYearId)
      : profiles.filter((p) => p.year < options.year).sort((a, b) => b.year - a.year)[0]

    if (source) {
      openingBalance = await getYearClosingBalance(source.id)
      sourceYearId = source.id
    }
  }

  return insertYearProfile({
    year: options.year,
    name: options.name.trim(),
    openingBalance,
    carryForward: options.carryForward,
    carryForwardSourceYearId: sourceYearId,
  })
}

export async function renameYearProfile(id: string, name: string): Promise<void> {
  await updateYearProfile(id, { name: name.trim() })
}

export async function setYearArchived(id: string, archived: boolean): Promise<void> {
  await updateYearProfile(id, { status: archived ? 'archived' : 'active' })
}

export interface YearDeletionImpact {
  donations: number
  expectedDonations: number
  expenses: number
  expectedExpenses: number
  auctions: number
}

export async function getYearDeletionImpact(yearProfileId: string): Promise<YearDeletionImpact> {
  const [donations, expectedDonations, expenses, expectedExpenses, auctions] = await Promise.all([
    listDonationsForYear(yearProfileId),
    listExpectedDonationsForYear(yearProfileId),
    listExpensesForYear(yearProfileId),
    listExpectedExpensesForYear(yearProfileId),
    listAuctionsForYear(yearProfileId),
  ])
  return {
    donations: donations.length,
    expectedDonations: expectedDonations.length,
    expenses: expenses.length,
    expectedExpenses: expectedExpenses.length,
    auctions: auctions.length,
  }
}

export async function deleteYear(yearProfileId: string): Promise<void> {
  await deleteYearProfileCascade(yearProfileId)
}
