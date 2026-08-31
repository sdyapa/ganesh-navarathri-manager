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

/** The default source year for a carry-forward — the most recent existing year strictly
 *  before `year`. Shared by createYearProfile's own default resolution and by the "carry
 *  forward now" action on an already-existing year (see applyCarryForwardOpeningBalance). */
export function findMostRecentPriorYear(profiles: YearProfile[], year: number): YearProfile | undefined {
  return profiles.filter((p) => p.year < year).sort((a, b) => b.year - a.year)[0]
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
      : findMostRecentPriorYear(profiles, options.year)

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

/** Retroactively pulls a prior year's closing balance into an ALREADY-EXISTING year's opening
 *  balance — for when a year was created before an earlier year existed yet (e.g. the current
 *  year was auto-created at first launch, and an older year was only imported afterward via a
 *  backup file), so there was nothing to carry forward from at creation time. Unlike
 *  createYearProfile's carry-forward, this takes the new balance as an already-computed value
 *  (see getYearClosingBalance) rather than recomputing it, so the UI can show the exact number
 *  in a confirmation dialog before this is called. */
export async function applyCarryForwardOpeningBalance(
  yearProfileId: string,
  sourceYearProfileId: string,
  newOpeningBalance: number,
): Promise<void> {
  await updateYearProfile(yearProfileId, {
    openingBalance: newOpeningBalance,
    carryForward: true,
    carryForwardSourceYearId: sourceYearProfileId,
  })
}

/** Like createYearProfile, but reuses an existing profile for that year instead of throwing —
 *  for callers (like sample-data seeding) where "this year already exists" is an expected,
 *  recoverable case rather than a user error. */
export async function getOrCreateYearProfile(options: CreateYearOptions): Promise<{ profile: YearProfile; created: boolean }> {
  const existing = (await listYearProfiles()).find((p) => p.year === options.year)
  if (existing) return { profile: existing, created: false }
  const profile = await createYearProfile(options)
  return { profile, created: true }
}

/** Resolves (or creates) the year profile immediately following the given source year — used
 *  when converting an Auction win into a pledge, since the winner pays the *following* year's
 *  festival, not the one the auction was held at. Carries the closing balance forward from the
 *  source year, matching the default a user gets from the "create new year" flow in Settings
 *  (see YearSettings.tsx's own `carryForward: true` default). */
export async function getOrCreateNextYearProfile(sourceYearProfileId: string): Promise<{ profile: YearProfile; created: boolean }> {
  const sourceYear = await getYearProfile(sourceYearProfileId)
  if (!sourceYear) throw new Error('Source year profile not found')
  const targetYear = sourceYear.year + 1
  return getOrCreateYearProfile({
    year: targetYear,
    name: `Ganesh Navarathri ${targetYear}`,
    carryForward: true,
    carryForwardFromYearId: sourceYearProfileId,
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
