import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { resetApplication } from '@/services/resetService'
import {
  createYearProfile,
  getYearClosingBalance,
  deleteYear,
  getOrCreateNextYearProfile,
  applyCarryForwardOpeningBalance,
  findMostRecentPriorYear,
} from '@/services/yearService'
import { getYearProfile } from '@/db/repositories/yearProfiles'
import {
  convertExpectedDonationToDonation,
  moveExpectedExpenseToExpense,
  convertAuctionToExpectedDonation,
  revertDonationToExpected,
  revertExpenseToExpected,
} from '@/services/conversionService'
import { insertDonation, listDonationsForYear, getDonation } from '@/db/repositories/donations'
import { insertExpectedDonation, listExpectedDonationsForYear } from '@/db/repositories/expectedDonations'
import { insertAuction, getAuction } from '@/db/repositories/auctions'
import { insertExpense, getExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense, listExpectedExpensesForYear } from '@/db/repositories/expectedExpenses'
import { insertTask, addChecklistItem, toggleChecklistItem, removeChecklistItem, setTaskDone, listTasksForYear } from '@/db/repositories/tasks'
import { insertKeyEvent, listKeyEventsForYear } from '@/db/repositories/keyEvents'
import { insertPoojaAssignment, listPoojaAssignmentsForYear } from '@/db/repositories/poojaAssignments'
import {
  listCategories,
  isCategoryInUse,
  setCategoryActive,
  deleteCategory,
  restoreDefaultCategories,
} from '@/db/repositories/categories'
import { listUnits, setUnitActive, deleteUnit, isUnitInUse, restoreDefaultUnits } from '@/db/repositories/units'
import { listProfiles, renameProfile, reorderProfiles, deleteProfile } from '@/db/repositories/profiles'
import { copyExpensesToExpected, copyDonationsToExpected, copyTasksToYear } from '@/services/copyForwardService'
import { exportYearBackup, exportFullBackup } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile } from '@/services/backupImport'
import {
  getAppSettings,
  recordDriveBackupCompleted,
  recordLocalBackupCompleted,
  setLocalBackupDirectory,
  updateActionDisplayMode,
  updateDashboardTaskPreviewCount,
  updateDisplayName,
  updateDriveReminderIntervalDays,
  updateLocalBackupEnabled,
  updateThemePreference,
} from '@/db/repositories/settings'
import {
  saveLocalBackupDirectoryHandle,
  getLocalBackupDirectoryHandle,
  clearLocalBackupDirectoryHandle,
} from '@/db/repositories/localBackupHandle'
import { matchesSearch } from '@/lib/tableUtils'
import { DEFAULT_DISPLAY_NAME } from '@/db/defaults'
import { seedSampleData, YearHasRealDataError } from '@/services/sampleDataService'
import { ensureAppInitialized } from '@/db/init'
import { listYearProfiles } from '@/db/repositories/yearProfiles'

async function categoryId(kind: 'donation' | 'expense', name: string): Promise<string> {
  const cats = await listCategories(kind)
  const found = cats.find((c) => c.name === name)
  if (!found) throw new Error(`category ${name} not found`)
  return found.id
}
async function unitId(name: string): Promise<string> {
  const units = await listUnits()
  const found = units.find((u) => u.name === name)
  if (!found) throw new Error(`unit ${name} not found`)
  return found.id
}

beforeEach(async () => {
  await resetApplication()
})

describe('year carry-forward', () => {
  it('carries the exact closing balance of the most recent year into the new year opening balance', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const pooja = await categoryId('expense', 'Pooja Items')

    const year3026 = await createYearProfile({ year: 3026, name: 'GN 3026', carryForward: false })
    await insertDonation(year3026.id, { donorName: 'A', type: 'monetary', amount: 150000, date: '3026-08-20', categoryId: chanda })
    await insertExpense(year3026.id, { description: 'Setup', amount: 100000, date: '3026-08-20', categoryId: pooja })
    // no auction this time; closing = 0 + 150000 - 100000 = 50000
    expect(await getYearClosingBalance(year3026.id)).toBe(50000)

    const year3027 = await createYearProfile({ year: 3027, name: 'GN 3027', carryForward: true })
    expect(year3027.openingBalance).toBe(50000)

    await insertDonation(year3027.id, { donorName: 'B', type: 'monetary', amount: 30000, date: '3027-08-20', categoryId: chanda })
    await insertExpense(year3027.id, { description: 'Flowers', amount: 20000, date: '3027-08-20', categoryId: pooja })
    expect(await getYearClosingBalance(year3027.id)).toBe(60000)
  })

  it('keeps years fully isolated — records never leak across years', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const y1 = await createYearProfile({ year: 3030, name: 'Y1', carryForward: false })
    const y2 = await createYearProfile({ year: 3031, name: 'Y2', carryForward: false })
    await insertDonation(y1.id, { donorName: 'OnlyInY1', type: 'monetary', amount: 100, date: '3030-01-01', categoryId: chanda })

    const y1Donations = await listDonationsForYear(y1.id)
    const y2Donations = await listDonationsForYear(y2.id)
    expect(y1Donations).toHaveLength(1)
    expect(y2Donations).toHaveLength(0)
  })

  it('deleting a year removes only that year’s records', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const y1 = await createYearProfile({ year: 3040, name: 'Y1', carryForward: false })
    const y2 = await createYearProfile({ year: 3041, name: 'Y2', carryForward: false })
    await insertDonation(y1.id, { donorName: 'X', type: 'monetary', amount: 100, date: '3040-01-01', categoryId: chanda })
    await insertDonation(y2.id, { donorName: 'Y', type: 'monetary', amount: 200, date: '3041-01-01', categoryId: chanda })

    await deleteYear(y1.id)

    expect(await listDonationsForYear(y1.id)).toHaveLength(0)
    expect(await listDonationsForYear(y2.id)).toHaveLength(1)
  })
})

describe('expected -> actual conversion', () => {
  it('converts an expected donation into a real donation, marks it converted, and updates the balance', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3050, name: 'GN 3050', carryForward: false })

    const expected = await insertExpectedDonation(year.id, {
      donorName: 'Ramesh',
      type: 'monetary',
      amount: 10000,
      date: '3050-08-28',
      categoryId: chanda,
    })

    expect(await getYearClosingBalance(year.id)).toBe(0) // expected donations must not affect actual balance

    const donation = await convertExpectedDonationToDonation(expected.id, year.id, {
      donorName: 'Ramesh',
      type: 'monetary',
      amount: 10000,
      date: '3050-08-29',
      categoryId: chanda,
    })

    expect(donation.sourceExpectedDonationId).toBe(expected.id)
    const [updatedExpected] = await listExpectedDonationsForYear(year.id)
    expect(updatedExpected.status).toBe('converted')
    expect(updatedExpected.convertedDonationId).toBe(donation.id)
    expect(await getYearClosingBalance(year.id)).toBe(10000)
  })

  it('moves an expected expense into a real expense and updates the balance', async () => {
    const pooja = await categoryId('expense', 'Pooja Items')
    const year = await createYearProfile({ year: 3051, name: 'GN 3051', carryForward: false })

    const expected = await insertExpectedExpense(year.id, {
      description: 'Fireworks',
      amount: 6000,
      date: '3051-08-28',
      categoryId: pooja,
    })
    expect(await getYearClosingBalance(year.id)).toBe(0)

    const expense = await moveExpectedExpenseToExpense(expected.id, year.id, {
      description: 'Fireworks',
      amount: 6000,
      date: '3051-08-29',
      categoryId: pooja,
    })

    expect(expense.sourceExpectedExpenseId).toBe(expected.id)
    const [updatedExpected] = await listExpectedExpensesForYear(year.id)
    expect(updatedExpected.status).toBe('converted')
    expect(await getYearClosingBalance(year.id)).toBe(-6000)
  })
})

describe('undo a conversion (move back to Expected)', () => {
  it('reverts a converted donation back to a pending expected donation, deleting the actual record', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3052, name: 'GN 3052', carryForward: false })

    const expected = await insertExpectedDonation(year.id, { donorName: 'Ramesh', type: 'monetary', amount: 10000, date: '3052-08-28', categoryId: chanda })
    const donation = await convertExpectedDonationToDonation(expected.id, year.id, {
      donorName: 'Ramesh',
      type: 'monetary',
      amount: 10000,
      date: '3052-08-29',
      categoryId: chanda,
    })
    expect(await getYearClosingBalance(year.id)).toBe(10000)

    await revertDonationToExpected(donation)

    expect(await getDonation(donation.id)).toBeUndefined()
    const [reverted] = await listExpectedDonationsForYear(year.id)
    expect(reverted.status).toBe('pending')
    expect(reverted.convertedDonationId).toBeNull()
    expect(await getYearClosingBalance(year.id)).toBe(0)
  })

  it('reverts a moved expense back to a pending expected expense, deleting the actual record', async () => {
    const pooja = await categoryId('expense', 'Pooja Items')
    const year = await createYearProfile({ year: 3053, name: 'GN 3053', carryForward: false })

    const expected = await insertExpectedExpense(year.id, { description: 'Fireworks', amount: 6000, date: '3053-08-28', categoryId: pooja })
    const expense = await moveExpectedExpenseToExpense(expected.id, year.id, {
      description: 'Fireworks',
      amount: 6000,
      date: '3053-08-29',
      categoryId: pooja,
    })
    expect(await getYearClosingBalance(year.id)).toBe(-6000)

    await revertExpenseToExpected(expense)

    expect(await getExpense(expense.id)).toBeUndefined()
    const [reverted] = await listExpectedExpensesForYear(year.id)
    expect(reverted.status).toBe('pending')
    expect(reverted.convertedExpenseId).toBeNull()
    expect(await getYearClosingBalance(year.id)).toBe(0)
  })

  it('is a no-op for a manually-entered actual record with no source Expected record', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3054, name: 'GN 3054', carryForward: false })
    const donation = await insertDonation(year.id, { donorName: 'Direct', type: 'monetary', amount: 500, date: '3054-08-20', categoryId: chanda })

    await revertDonationToExpected(donation)

    expect(await getDonation(donation.id)).toBeDefined()
  })
})

describe('auction -> expected donation conversion', () => {
  it('converts an auction win into a pending expected donation for next year and marks the auction converted', async () => {
    const auctionCat = await categoryId('donation', 'Auction')
    const year = await createYearProfile({ year: 3060, name: 'GN 3060', carryForward: false })

    const auction = await insertAuction(year.id, {
      item: 'Pedda Laddu',
      person: 'Ramesh',
      amount: 42000,
      date: '3060-09-06',
    })
    expect(auction.convertedToExpectedDonationId).toBeUndefined()

    const { profile: nextYear, created } = await getOrCreateNextYearProfile(year.id)
    expect(created).toBe(true)
    expect(nextYear.year).toBe(3061)

    const pledge = await convertAuctionToExpectedDonation(auction.id, nextYear.id, {
      donorName: 'Ramesh',
      type: 'monetary',
      amount: 42000,
      date: '3061-08-20',
      categoryId: auctionCat,
    })

    expect(pledge.sourceAuctionId).toBe(auction.id)
    expect(pledge.status).toBe('pending')
    expect(pledge.yearProfileId).toBe(nextYear.id)

    const updatedAuction = await getAuction(auction.id)
    expect(updatedAuction?.convertedToExpectedDonationId).toBe(pledge.id)
  })

  it('carries the source year’s closing balance forward when auto-creating next year, and reuses it if it already exists', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3070, name: 'GN 3070', carryForward: false })
    await insertDonation(year.id, { donorName: 'A', type: 'monetary', amount: 50000, date: '3070-08-20', categoryId: chanda })
    expect(await getYearClosingBalance(year.id)).toBe(50000)

    const first = await getOrCreateNextYearProfile(year.id)
    expect(first.created).toBe(true)
    expect(first.profile.year).toBe(3071)
    expect(first.profile.openingBalance).toBe(50000)

    const second = await getOrCreateNextYearProfile(year.id)
    expect(second.created).toBe(false)
    expect(second.profile.id).toBe(first.profile.id)

    const allYears = await listYearProfiles()
    expect(allYears.filter((y) => y.year === 3071)).toHaveLength(1)
  })
})

describe('retroactive carry-forward into an existing year', () => {
  it('pulls a prior year\'s closing balance into a year that already exists, without touching its records', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    // Year B is created FIRST (opening balance 0) — mirrors the real scenario: the current
    // year already existed before an older year was imported afterward via a backup file.
    const yearB = await createYearProfile({ year: 3081, name: 'GN 3081', carryForward: false })
    await insertDonation(yearB.id, { donorName: 'X', type: 'monetary', amount: 1000, date: '3081-08-20', categoryId: chanda })

    const yearA = await createYearProfile({ year: 3080, name: 'GN 3080', carryForward: false })
    await insertDonation(yearA.id, { donorName: 'A', type: 'monetary', amount: 90000, date: '3080-08-20', categoryId: chanda })
    expect(await getYearClosingBalance(yearA.id)).toBe(90000)
    expect(yearB.openingBalance).toBe(0)

    const years = await listYearProfiles()
    const source = findMostRecentPriorYear(years, yearB.year)
    expect(source?.id).toBe(yearA.id)

    const newBalance = await getYearClosingBalance(source!.id)
    await applyCarryForwardOpeningBalance(yearB.id, yearA.id, newBalance)

    const updatedB = await getYearProfile(yearB.id)
    expect(updatedB?.openingBalance).toBe(90000)
    expect(updatedB?.carryForwardSourceYearId).toBe(yearA.id)
    expect(updatedB?.carryForward).toBe(true)
    // The donation already in year B must survive untouched.
    expect(await listDonationsForYear(yearB.id)).toHaveLength(1)
    expect(await getYearClosingBalance(yearB.id)).toBe(90000 + 1000)
  })
})

describe('category lifecycle', () => {
  it('deactivates rather than deletes a category still referenced by historical records', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3060, name: 'GN 3060', carryForward: false })
    await insertDonation(year.id, { donorName: 'X', type: 'monetary', amount: 100, date: '3060-01-01', categoryId: chanda })

    expect(await isCategoryInUse(chanda)).toBe(true)
    await setCategoryActive(chanda, false)

    const [donation] = await listDonationsForYear(year.id)
    expect(donation.categoryId).toBe(chanda) // historical record keeps its category
  })

  it('allows hard delete only when a category is unused', async () => {
    const cats = await listCategories('donation')
    const unused = cats.find((c) => c.name === 'Auction')!
    expect(await isCategoryInUse(unused.id)).toBe(false)
    await deleteCategory(unused.id)
    const after = await listCategories('donation')
    expect(after.find((c) => c.id === unused.id)).toBeUndefined()
  })
})

describe('backup export/import round trip', () => {
  it('exports a single year and re-imports it as add-new without touching other years', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const kg = await unitId('kg')
    const year = await createYearProfile({ year: 3070, name: 'GN 3070', carryForward: false })
    await insertDonation(year.id, { donorName: 'Ramesh', type: 'monetary', amount: 1000, date: '3070-08-20', categoryId: chanda })
    await insertDonation(year.id, {
      donorName: 'Lakshmi',
      type: 'commodity',
      commodityName: 'Rice',
      quantity: 10,
      unitId: kg,
      date: '3070-08-21',
      categoryId: chanda,
    })

    const backup = await exportYearBackup(year.id)
    expect(backup.exportType).toBe('single-year')
    expect(backup.years[0].donations).toHaveLength(2)

    // Delete the local year, then restore purely from the exported backup.
    await deleteYear(year.id)
    expect(await db.yearProfiles.get(year.id)).toBeUndefined()

    const inspection = await inspectBackupFile(backup)
    expect(inspection.valid).toBe(true)
    if (!inspection.valid) return
    const result = await applyBackupImport(inspection.backup, 'add-new')
    expect(result.inserted.donations).toBe(2)
    expect(result.yearsCreated).toBe(1)
  })

  it('rejects a corrupted/unrelated JSON file instead of importing it', async () => {
    const inspection = await inspectBackupFile({ some: 'random', shape: true })
    expect(inspection.valid).toBe(false)
  })

  it('rejects a backup from a newer, unsupported schema version', async () => {
    const backup = await exportFullBackup()
    const tampered = { ...backup, backupVersion: backup.backupVersion + 999 }
    const inspection = await inspectBackupFile(tampered)
    expect(inspection.valid).toBe(false)
  })

  it('skip-duplicates mode does not double-insert identical records on repeated import', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3080, name: 'GN 3080', carryForward: false })
    await insertDonation(year.id, { donorName: 'Ramesh', type: 'monetary', amount: 1000, date: '3080-08-20', categoryId: chanda })

    const backup = await exportYearBackup(year.id)
    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')

    const result = await applyBackupImport(inspection.backup, 'skip-duplicates')
    expect(result.inserted.donations).toBe(0)
    expect(result.skippedDuplicates).toBe(1)
    expect(await listDonationsForYear(year.id)).toHaveLength(1)
  })
})

describe('reusable profiles (People & Vendors)', () => {
  it('auto-registers a new donor name as a Profile, and does not duplicate it on repeat or different-case use', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3090, name: 'GN 3090', carryForward: false })

    await insertDonation(year.id, { donorName: 'Venkatesh', type: 'monetary', amount: 500, date: '3090-08-20', categoryId: chanda })
    let people = await listProfiles('person')
    expect(people.filter((p) => p.name === 'Venkatesh')).toHaveLength(1)

    // Same name again, different case — must not create a second entry.
    await insertDonation(year.id, { donorName: 'venkatesh', type: 'monetary', amount: 200, date: '3090-08-21', categoryId: chanda })
    people = await listProfiles('person')
    expect(people.filter((p) => p.name.toLowerCase() === 'venkatesh')).toHaveLength(1)
  })

  it('registers an auction participant and an expense vendor under the right kind', async () => {
    const pooja = await categoryId('expense', 'Pooja Items')
    const year = await createYearProfile({ year: 3091, name: 'GN 3091', carryForward: false })

    await insertAuction(year.id, { item: 'Modak Basket', person: 'Deepa', amount: 3000, date: '3091-09-06' })
    const people = await listProfiles('person')
    expect(people.some((p) => p.name === 'Deepa')).toBe(true)

    await insertExpense(year.id, { description: 'Flowers', amount: 500, date: '3091-08-20', categoryId: pooja, vendorName: 'Sri Flower Mart' })
    const vendors = await listProfiles('vendor')
    expect(vendors.some((v) => v.name === 'Sri Flower Mart')).toBe(true)
    // Vendor names must never leak into the person list.
    expect((await listProfiles('person')).some((p) => p.name === 'Sri Flower Mart')).toBe(false)
  })

  it('supports rename, reorder, and delete — delete is always safe since nothing references a Profile by id', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3092, name: 'GN 3092', carryForward: false })
    await insertDonation(year.id, { donorName: 'Alpha', type: 'monetary', amount: 100, date: '3092-08-20', categoryId: chanda })
    await insertDonation(year.id, { donorName: 'Beta', type: 'monetary', amount: 100, date: '3092-08-20', categoryId: chanda })

    const before = await listProfiles('person')
    const alpha = before.find((p) => p.name === 'Alpha')!
    const beta = before.find((p) => p.name === 'Beta')!

    await renameProfile(alpha.id, 'Alpha Renamed')
    expect((await listProfiles('person')).some((p) => p.name === 'Alpha Renamed')).toBe(true)

    await reorderProfiles([beta.id, alpha.id])
    const reordered = await listProfiles('person')
    expect(reordered[0].id).toBe(beta.id)
    expect(reordered[1].id).toBe(alpha.id)

    await deleteProfile(alpha.id)
    expect((await listProfiles('person')).some((p) => p.id === alpha.id)).toBe(false)
    // The donation record itself keeps whatever name it already has after a delete — deletion
    // never cascades. (Rename, tested separately below, is the opposite: it must cascade.)
    const donations = await listDonationsForYear(year.id)
    expect(donations.some((d) => d.donorName === 'Alpha Renamed')).toBe(true)
  })

  it('renaming a person Profile cascades to every donation/expected-donation/auction using the old name, across every year', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const yearA = await createYearProfile({ year: 3094, name: 'GN 3094', carryForward: false })
    const yearB = await createYearProfile({ year: 3095, name: 'GN 3095', carryForward: false })

    await insertDonation(yearA.id, { donorName: 'Ramu', type: 'monetary', amount: 500, date: '3094-08-20', categoryId: chanda })
    await insertExpectedDonation(yearB.id, { donorName: 'ramu', type: 'monetary', amount: 600, date: '3095-08-20', categoryId: chanda })
    await insertAuction(yearB.id, { item: 'Basket', person: 'Ramu', amount: 700, date: '3095-09-06' })

    const ramu = (await listProfiles('person')).find((p) => p.name.toLowerCase() === 'ramu')!
    await renameProfile(ramu.id, 'Ramu Kumar')

    expect((await listDonationsForYear(yearA.id)).find((d) => d.donorName === 'Ramu')).toBeUndefined()
    expect((await listDonationsForYear(yearA.id)).some((d) => d.donorName === 'Ramu Kumar')).toBe(true)
    expect((await listExpectedDonationsForYear(yearB.id)).some((d) => d.donorName === 'Ramu Kumar')).toBe(true)
    const auctionsInB = await db.auctions.where('yearProfileId').equals(yearB.id).toArray()
    expect(auctionsInB.some((a) => a.person === 'Ramu Kumar')).toBe(true)
  })

  it('renaming a vendor Profile cascades to every expense/expected-expense using the old name', async () => {
    const pooja = await categoryId('expense', 'Pooja Items')
    const year = await createYearProfile({ year: 3096, name: 'GN 3096', carryForward: false })
    await insertExpense(year.id, { description: 'Flowers', amount: 500, date: '3096-08-20', categoryId: pooja, vendorName: 'Sri Flower Mart' })
    await insertExpectedExpense(year.id, { description: 'Flowers next year', amount: 550, date: '3096-08-21', categoryId: pooja, vendorName: 'Sri Flower Mart' })

    const vendor = (await listProfiles('vendor')).find((v) => v.name === 'Sri Flower Mart')!
    await renameProfile(vendor.id, 'Sri Flower Mart & Co')

    const expenses = await db.expenses.where('yearProfileId').equals(year.id).toArray()
    expect(expenses.every((e) => e.vendorName === 'Sri Flower Mart & Co')).toBe(true)
    const expectedExpenses = await listExpectedExpensesForYear(year.id)
    expect(expectedExpenses.every((e) => e.vendorName === 'Sri Flower Mart & Co')).toBe(true)
  })

  it('round-trips profiles through a full backup export/import', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3093, name: 'GN 3093', carryForward: false })
    await insertDonation(year.id, { donorName: 'Kavitha', type: 'monetary', amount: 100, date: '3093-08-20', categoryId: chanda })
    expect((await listProfiles('person')).some((p) => p.name === 'Kavitha')).toBe(true)

    const backup = await exportFullBackup()
    expect(backup.settings.profiles.some((p) => p.name === 'Kavitha')).toBe(true)

    await resetApplication()
    expect(await listProfiles('person')).toHaveLength(0)

    const inspection = await inspectBackupFile(backup)
    expect(inspection.valid).toBe(true)
    if (!inspection.valid) return
    expect(inspection.summary.profileCount).toBeGreaterThan(0)
    await applyBackupImport(inspection.backup, 'add-new')
    expect((await listProfiles('person')).some((p) => p.name === 'Kavitha')).toBe(true)
  })

  it('registers profiles from a backup with NO explicit profiles list — from the actual donor/vendor/person fields in its records', async () => {
    // Mirrors the legacy 2025 Excel-migration JSON, built before the Profiles feature existed:
    // valid per backupFileSchema (profiles defaults to []), but carries none explicitly.
    const now = new Date().toISOString()
    const legacyStyleBackup = {
      appName: 'Ganesh Navarathri Manager',
      backupVersion: 1,
      exportType: 'single-year' as const,
      exportedAt: now,
      years: [
        {
          profile: {
            id: 'legacy-year',
            year: 3097,
            name: 'GN 3097 (Legacy)',
            openingBalance: 0,
            carryForward: false,
            status: 'active' as const,
            createdAt: now,
            updatedAt: now,
          },
          donations: [
            {
              id: 'legacy-d1',
              yearProfileId: 'legacy-year',
              donorName: 'Legacy Donor',
              type: 'monetary' as const,
              date: '3097-08-20',
              categoryId: await categoryId('donation', 'Chanda'),
              amount: 1000,
              createdAt: now,
              updatedAt: now,
            },
          ],
          expectedDonations: [],
          expenses: [
            {
              id: 'legacy-e1',
              yearProfileId: 'legacy-year',
              description: 'Legacy expense',
              amount: 200,
              date: '3097-08-20',
              categoryId: await categoryId('expense', 'Pooja Items'),
              vendorName: 'Legacy Vendor',
              createdAt: now,
              updatedAt: now,
            },
          ],
          expectedExpenses: [],
          auctions: [
            { id: 'legacy-a1', yearProfileId: 'legacy-year', item: 'Basket', person: 'Legacy Bidder', amount: 300, date: '3097-09-06', createdAt: now, updatedAt: now },
          ],
        },
      ],
      settings: { categories: [], units: [] }, // no `profiles` key at all
    }

    const inspection = await inspectBackupFile(legacyStyleBackup)
    expect(inspection.valid).toBe(true)
    if (!inspection.valid) return
    expect(inspection.summary.profileCount).toBe(0) // nothing explicit in the file

    await applyBackupImport(inspection.backup, 'add-new')

    const people = await listProfiles('person')
    expect(people.some((p) => p.name === 'Legacy Donor')).toBe(true)
    expect(people.some((p) => p.name === 'Legacy Bidder')).toBe(true)
    const vendors = await listProfiles('vendor')
    expect(vendors.some((v) => v.name === 'Legacy Vendor')).toBe(true)
  })

  it('registers profiles from a backup with NO explicit profiles list even under "replace entire database" mode', async () => {
    // Regression test: replace-all used to seed db.profiles via a plain bulkAdd of
    // backup.settings.profiles ONLY — a backup with no explicit profiles list (like the actual
    // 2025 legacy Excel-migration file the user imports) silently ended up with an EMPTY
    // People & Vendors list under this mode, even though every other import mode derived
    // profiles from each record's own name as it was inserted.
    const now = new Date().toISOString()
    const legacyStyleBackup = {
      appName: 'Ganesh Navarathri Manager',
      backupVersion: 1,
      exportType: 'full' as const,
      exportedAt: now,
      years: [
        {
          profile: {
            id: 'legacy-year-2',
            year: 3098,
            name: 'GN 3098 (Legacy)',
            openingBalance: 0,
            carryForward: false,
            status: 'active' as const,
            createdAt: now,
            updatedAt: now,
          },
          donations: [
            {
              id: 'legacy-d2',
              yearProfileId: 'legacy-year-2',
              donorName: 'Replace-All Donor',
              type: 'monetary' as const,
              date: '3098-08-20',
              categoryId: await categoryId('donation', 'Chanda'),
              amount: 1000,
              createdAt: now,
              updatedAt: now,
            },
          ],
          expectedDonations: [],
          expenses: [
            {
              id: 'legacy-e2',
              yearProfileId: 'legacy-year-2',
              description: 'Legacy expense',
              amount: 200,
              date: '3098-08-20',
              categoryId: await categoryId('expense', 'Pooja Items'),
              vendorName: 'Replace-All Vendor',
              createdAt: now,
              updatedAt: now,
            },
          ],
          expectedExpenses: [],
          auctions: [
            { id: 'legacy-a2', yearProfileId: 'legacy-year-2', item: 'Basket', person: 'Replace-All Bidder', amount: 300, date: '3098-09-06', createdAt: now, updatedAt: now },
          ],
        },
      ],
      settings: { categories: [], units: [] }, // no `profiles` key at all
    }

    const inspection = await inspectBackupFile(legacyStyleBackup)
    expect(inspection.valid).toBe(true)
    if (!inspection.valid) return

    await applyBackupImport(inspection.backup, 'replace-all')

    const people = await listProfiles('person')
    expect(people.some((p) => p.name === 'Replace-All Donor')).toBe(true)
    expect(people.some((p) => p.name === 'Replace-All Bidder')).toBe(true)
    const vendors = await listProfiles('vendor')
    expect(vendors.some((v) => v.name === 'Replace-All Vendor')).toBe(true)
  })
})

describe('copy Actual records forward to Expected (recurring items)', () => {
  it('copies selected expenses into pending Expected Expenses in the target year, unchanged in the source', async () => {
    const pooja = await categoryId('expense', 'Pooja Items')
    const sourceYear = await createYearProfile({ year: 3098, name: 'GN 3098', carryForward: false })
    const targetYear = await createYearProfile({ year: 3099, name: 'GN 3099', carryForward: false })
    const priest = await insertExpense(sourceYear.id, {
      description: 'Priest Charges',
      amount: 5000,
      date: '3098-08-20',
      categoryId: pooja,
      vendorName: 'Sharma Ji',
    })

    const count = await copyExpensesToExpected([priest.id], targetYear.id)
    expect(count).toBe(1)

    const targetExpected = await listExpectedExpensesForYear(targetYear.id)
    expect(targetExpected).toHaveLength(1)
    expect(targetExpected[0].description).toBe('Priest Charges')
    expect(targetExpected[0].amount).toBe(5000)
    expect(targetExpected[0].vendorName).toBe('Sharma Ji')
    expect(targetExpected[0].status).toBe('pending')

    // Source expense is untouched.
    const sourceExpenses = await db.expenses.where('yearProfileId').equals(sourceYear.id).toArray()
    expect(sourceExpenses).toHaveLength(1)
    expect(sourceExpenses[0].id).toBe(priest.id)
  })

  it('copies selected donations (monetary and commodity) into pending Expected Donations in the target year', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const kg = await unitId('kg')
    const sourceYear = await createYearProfile({ year: 3100, name: 'GN 3100', carryForward: false })
    const targetYear = await createYearProfile({ year: 3101, name: 'GN 3101', carryForward: false })
    const monetary = await insertDonation(sourceYear.id, { donorName: 'Regular Donor', type: 'monetary', amount: 2000, date: '3100-08-20', categoryId: chanda })
    const commodity = await insertDonation(sourceYear.id, {
      donorName: 'Regular Donor',
      type: 'commodity',
      commodityName: 'Rice',
      quantity: 25,
      unitId: kg,
      date: '3100-08-21',
      categoryId: chanda,
    })

    const count = await copyDonationsToExpected([monetary.id, commodity.id], targetYear.id)
    expect(count).toBe(2)

    const targetExpected = await listExpectedDonationsForYear(targetYear.id)
    expect(targetExpected).toHaveLength(2)
    const copiedMonetary = targetExpected.find((d) => d.type === 'monetary')!
    expect(copiedMonetary.amount).toBe(2000)
    const copiedCommodity = targetExpected.find((d) => d.type === 'commodity')!
    expect(copiedCommodity.commodityName).toBe('Rice')
    expect(copiedCommodity.quantity).toBe(25)
    expect(targetExpected.every((d) => d.status === 'pending')).toBe(true)
  })

  it('copies selected tasks into a target year as fresh unchecked to-dos, shifting the due date by the year gap and leaving the source untouched', async () => {
    const sourceYear = await createYearProfile({ year: 3120, name: 'GN 3120', carryForward: false })
    const targetYear = await createYearProfile({ year: 3122, name: 'GN 3122', carryForward: false })
    const task = await insertTask(sourceYear.id, {
      title: 'Buy pooja items',
      dueDate: '3120-08-10',
      notes: 'Ask Sharma Ji',
      checklistItems: ['Flowers', 'Coconuts'],
    })
    await toggleChecklistItem(task.id, task.checklist[0].id)

    const count = await copyTasksToYear([task.id], targetYear.id, sourceYear.year, targetYear.year)
    expect(count).toBe(1)

    const targetTasks = await listTasksForYear(targetYear.id)
    expect(targetTasks).toHaveLength(1)
    expect(targetTasks[0].title).toBe('Buy pooja items')
    expect(targetTasks[0].dueDate).toBe('3122-08-10')
    expect(targetTasks[0].notes).toBe('Ask Sharma Ji')
    expect(targetTasks[0].done).toBe(false)
    expect(targetTasks[0].checklist).toHaveLength(2)
    expect(targetTasks[0].checklist.every((i) => !i.done)).toBe(true)

    // Source task is untouched, including the checked-off checklist item.
    const sourceTasks = await listTasksForYear(sourceYear.id)
    expect(sourceTasks).toHaveLength(1)
    expect(sourceTasks[0].dueDate).toBe('3120-08-10')
    expect(sourceTasks[0].checklist.find((i) => i.label === 'Flowers')?.done).toBe(true)
  })
})

describe('Tasks and checklists', () => {
  it('search matches a task by title, notes, or a checklist item label', async () => {
    const year = await createYearProfile({ year: 3130, name: 'GN 3130', carryForward: false })
    const task = await insertTask(year.id, {
      title: 'Buy pooja items',
      dueDate: '3130-08-10',
      notes: 'Ask Sharma Ji for a discount',
      checklistItems: ['Flowers', 'Coconuts', 'Camphor'],
    })
    const other = await insertTask(year.id, { title: 'Book priest', dueDate: '3130-08-05', notes: undefined, checklistItems: [] })

    // Simulates TasksPage's filtered useMemo: matchesSearch([t.title, t.notes, ...checklist labels], query)
    function matchesTaskSearch(t: typeof task, query: string) {
      return matchesSearch([t.title, t.notes, ...t.checklist.map((c) => c.label)], query)
    }

    expect(matchesTaskSearch(task, 'pooja')).toBe(true) // title match
    expect(matchesTaskSearch(task, 'sharma')).toBe(true) // notes match
    expect(matchesTaskSearch(task, 'flowers')).toBe(true) // checklist item label match — the whole point of this feature
    expect(matchesTaskSearch(task, 'coconuts')).toBe(true)
    expect(matchesTaskSearch(other, 'flowers')).toBe(false) // a task with no matching checklist item is excluded
  })

  it('creates a task with checklist items parsed at creation, then supports toggling and removing items independently', async () => {
    const year = await createYearProfile({ year: 3110, name: 'GN 3110', carryForward: false })

    const task = await insertTask(year.id, {
      title: 'Buy pooja items',
      dueDate: '3110-08-10',
      notes: undefined,
      checklistItems: ['Flowers', 'Coconuts', 'Camphor'],
    })
    expect(task.checklist).toHaveLength(3)
    expect(task.done).toBe(false)

    await toggleChecklistItem(task.id, task.checklist[0].id)
    let [current] = await listTasksForYear(year.id)
    expect(current.checklist.find((i) => i.id === task.checklist[0].id)?.done).toBe(true)
    expect(current.checklist.find((i) => i.id === task.checklist[1].id)?.done).toBe(false)

    await addChecklistItem(task.id, 'Betel leaves')
    current = (await listTasksForYear(year.id))[0]
    expect(current.checklist).toHaveLength(4)

    await removeChecklistItem(task.id, task.checklist[1].id)
    current = (await listTasksForYear(year.id))[0]
    expect(current.checklist).toHaveLength(3)
    expect(current.checklist.some((i) => i.id === task.checklist[1].id)).toBe(false)
  })

  it('marks a task done and back to pending without touching its checklist', async () => {
    const year = await createYearProfile({ year: 3111, name: 'GN 3111', carryForward: false })
    const task = await insertTask(year.id, { title: 'Book priest', dueDate: '3111-08-05', notes: undefined, checklistItems: [] })

    await setTaskDone(task.id, true)
    expect((await listTasksForYear(year.id))[0].done).toBe(true)

    await setTaskDone(task.id, false)
    expect((await listTasksForYear(year.id))[0].done).toBe(false)
  })
})

describe('festival calendar (Key Events + Pooja Roster)', () => {
  it('round-trips Key Events and Pooja Roster entries through a full backup export/import', async () => {
    const year = await createYearProfile({ year: 3120, name: 'GN 3120', carryForward: false })
    await insertKeyEvent(year.id, { name: 'Nimajjanam', date: '3120-09-06', notes: undefined })
    await insertPoojaAssignment(year.id, { date: '3120-08-29', familyNames: 'Sharma family, Reddy family', notes: undefined })

    const backup = await exportFullBackup()
    const bundle = backup.years.find((y) => y.profile.id === year.id)!
    expect(bundle.keyEvents).toHaveLength(1)
    expect(bundle.poojaAssignments).toHaveLength(1)

    await resetApplication()

    const inspection = await inspectBackupFile(backup)
    expect(inspection.valid).toBe(true)
    if (!inspection.valid) return
    const result = await applyBackupImport(inspection.backup, 'add-new')
    expect(result.inserted.keyEvents).toBe(1)
    expect(result.inserted.poojaAssignments).toBe(1)

    const restoredYear = (await listYearProfiles()).find((y) => y.year === 3120)!
    expect((await listKeyEventsForYear(restoredYear.id))[0].name).toBe('Nimajjanam')
    expect((await listPoojaAssignmentsForYear(restoredYear.id))[0].familyNames).toBe('Sharma family, Reddy family')
  })

  it('a backup with no tasks/keyEvents/poojaAssignments fields at all (pre-feature export) still validates', async () => {
    const backup = await exportFullBackup()
    const stripped = {
      ...backup,
      years: backup.years.map((y) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tasks, keyEvents, poojaAssignments, ...rest } = y
        return rest
      }),
    }
    const inspection = await inspectBackupFile(stripped)
    expect(inspection.valid).toBe(true)
  })

  it('search matches Key Events by name or notes (simulating KeyEventsSection filter)', async () => {
    const year = await createYearProfile({ year: 3121, name: 'GN 3121', carryForward: false })
    const nimajjanam = await insertKeyEvent(year.id, { name: 'Nimajjanam', date: '3121-09-06', notes: 'Immersion at the lake' })
    await insertKeyEvent(year.id, { name: 'Annadanam', date: '3121-08-30', notes: undefined })

    function matches(e: typeof nimajjanam, query: string) {
      return matchesSearch([e.name, e.notes], query)
    }

    expect(matches(nimajjanam, 'nimajjanam')).toBe(true)
    expect(matches(nimajjanam, 'lake')).toBe(true) // notes match
    expect(matches(nimajjanam, 'annadanam')).toBe(false)
  })

  it('search matches Pooja Roster entries by family names or notes (simulating PoojaRosterSection filter)', async () => {
    const year = await createYearProfile({ year: 3122, name: 'GN 3122', carryForward: false })
    const entry = await insertPoojaAssignment(year.id, { date: '3122-08-29', familyNames: 'Sharma family, Reddy family', notes: 'Morning slot' })

    function matches(a: typeof entry, query: string) {
      return matchesSearch([a.familyNames, a.notes], query)
    }

    expect(matches(entry, 'sharma')).toBe(true)
    expect(matches(entry, 'reddy')).toBe(true)
    expect(matches(entry, 'morning')).toBe(true) // notes match
    expect(matches(entry, 'gupta')).toBe(false)
  })
})

describe('reset application', () => {
  it('wipes everything and reseeds clean defaults', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3090, name: 'GN 3090', carryForward: false })
    await insertDonation(year.id, { donorName: 'X', type: 'monetary', amount: 100, date: '3090-01-01', categoryId: chanda })
    await insertTask(year.id, { title: 'Leftover task', dueDate: '3090-08-01', notes: undefined, checklistItems: [] })
    await insertKeyEvent(year.id, { name: 'Leftover event', date: '3090-08-01', notes: undefined })
    await insertPoojaAssignment(year.id, { date: '3090-08-01', familyNames: 'Leftover family', notes: undefined })

    const profiles = await resetApplication()

    expect(await db.donations.count()).toBe(0)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.keyEvents.count()).toBe(0)
    expect(await db.poojaAssignments.count()).toBe(0)
    expect(await db.yearProfiles.count()).toBe(1)
    expect(profiles).toHaveLength(1)
    const cats = await listCategories('donation')
    expect(cats.map((c) => c.name)).toContain('Chanda')
  })
})

describe('Google Drive backup reminder settings', () => {
  it('defaults to a 1-day interval with no backup recorded yet', async () => {
    const settings = await getAppSettings()
    expect(settings.driveBackupReminder).toEqual({ intervalDays: 1, lastBackupAt: null })
  })

  it('updates the interval and records a backup timestamp independently', async () => {
    await updateDriveReminderIntervalDays(7)
    let settings = await getAppSettings()
    expect(settings.driveBackupReminder.intervalDays).toBe(7)
    expect(settings.driveBackupReminder.lastBackupAt).toBeNull()

    await recordDriveBackupCompleted()
    settings = await getAppSettings()
    expect(settings.driveBackupReminder.intervalDays).toBe(7) // unaffected by recording a backup
    expect(settings.driveBackupReminder.lastBackupAt).not.toBeNull()
  })

  it('is preserved (not wiped) by a full-database "replace-all" import', async () => {
    await updateDriveReminderIntervalDays(14)
    await recordDriveBackupCompleted()
    const { lastBackupAt } = (await getAppSettings()).driveBackupReminder

    const backup = await exportFullBackup()
    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    const after = await getAppSettings()
    expect(after.driveBackupReminder.intervalDays).toBe(14)
    expect(after.driveBackupReminder.lastBackupAt).toBe(lastBackupAt)
  })

  it('is never included in an exported backup file', async () => {
    await updateDriveReminderIntervalDays(30)
    const backup = await exportFullBackup()
    expect(backup.settings.appSettings).not.toHaveProperty('driveBackupReminder')
  })
})

describe('customizable display name', () => {
  it('defaults to the generic app name', async () => {
    const settings = await getAppSettings()
    expect(settings.displayName).toBe(DEFAULT_DISPLAY_NAME)
  })

  it('updates independently of other settings', async () => {
    await updateDriveReminderIntervalDays(5)
    await updateDisplayName('Sri Ganesh Mandal')

    const settings = await getAppSettings()
    expect(settings.displayName).toBe('Sri Ganesh Mandal')
    expect(settings.driveBackupReminder.intervalDays).toBe(5) // unaffected by the rename
  })

  it('is included in an exported backup and restored by a full "replace-all" import', async () => {
    await updateDisplayName('Sri Ganesh Mandal')
    const backup = await exportFullBackup()
    expect(backup.settings.appSettings.displayName).toBe('Sri Ganesh Mandal')

    await updateDisplayName(DEFAULT_DISPLAY_NAME) // simulate a different device's current name
    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    expect((await getAppSettings()).displayName).toBe('Sri Ganesh Mandal')
  })

  it('falls back to the current device name when restoring an older backup that predates this field', async () => {
    await updateDisplayName('Kept Across Old Restore')
    const backup = await exportFullBackup()
    // Simulate a pre-existing backup captured before displayName was introduced.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (backup.settings.appSettings as any).displayName

    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    expect((await getAppSettings()).displayName).toBe('Kept Across Old Restore')
  })
})

describe('appearance settings (action display mode + theme + dashboard task preview count)', () => {
  it('defaults to text-only actions, the system theme, and a preview count of 3', async () => {
    const settings = await getAppSettings()
    expect(settings.actionDisplayMode).toBe('text')
    expect(settings.themePreference).toBe('system')
    expect(settings.dashboardTaskPreviewCount).toBe(3)
  })

  it('updates independently of other settings', async () => {
    await updateDriveReminderIntervalDays(5)
    await updateActionDisplayMode('icon')
    await updateThemePreference('dark')
    await updateDashboardTaskPreviewCount(5)

    const settings = await getAppSettings()
    expect(settings.actionDisplayMode).toBe('icon')
    expect(settings.themePreference).toBe('dark')
    expect(settings.dashboardTaskPreviewCount).toBe(5)
    expect(settings.driveBackupReminder.intervalDays).toBe(5) // unaffected by the other changes
  })

  it('is included in an exported backup and restored by a full "replace-all" import', async () => {
    await updateActionDisplayMode('both')
    await updateThemePreference('light')
    await updateDashboardTaskPreviewCount(7)
    const backup = await exportFullBackup()
    expect(backup.settings.appSettings.actionDisplayMode).toBe('both')
    expect(backup.settings.appSettings.themePreference).toBe('light')
    expect(backup.settings.appSettings.dashboardTaskPreviewCount).toBe(7)

    await updateActionDisplayMode('text') // simulate a different device's current settings
    await updateThemePreference('system')
    await updateDashboardTaskPreviewCount(3)
    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    const restored = await getAppSettings()
    expect(restored.actionDisplayMode).toBe('both')
    expect(restored.themePreference).toBe('light')
    expect(restored.dashboardTaskPreviewCount).toBe(7)
  })

  it('falls back to the current device values when restoring an older backup that predates these fields', async () => {
    await updateActionDisplayMode('icon')
    await updateThemePreference('dark')
    await updateDashboardTaskPreviewCount(9)
    const backup = await exportFullBackup()
    // Simulate a pre-existing backup captured before these fields were introduced.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (backup.settings.appSettings as any).actionDisplayMode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (backup.settings.appSettings as any).themePreference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (backup.settings.appSettings as any).dashboardTaskPreviewCount

    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    const restored = await getAppSettings()
    expect(restored.actionDisplayMode).toBe('icon')
    expect(restored.themePreference).toBe('dark')
    expect(restored.dashboardTaskPreviewCount).toBe(9)
  })
})

describe('local backup on launch settings', () => {
  it('defaults to enabled, saving to Downloads, with no backup recorded yet', async () => {
    const settings = await getAppSettings()
    expect(settings.localBackup).toEqual({
      enabled: true,
      destination: 'downloads',
      directoryName: null,
      lastLocalBackupAt: null,
    })
  })

  it('backfills a missing localBackup field for a settings document created before this feature existed', async () => {
    // Simulate an old settings doc, same technique as the other withAppSettingsDefaults tests
    // in this file — Dexie never enforces a stored document's shape.
    const current = await getAppSettings()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacy: any = { ...current }
    delete legacy.localBackup
    await db.appSettings.put(legacy)

    const backfilled = await getAppSettings()
    expect(backfilled.localBackup).toEqual({
      enabled: true,
      destination: 'downloads',
      directoryName: null,
      lastLocalBackupAt: null,
    })
  })

  it('toggling enabled, recording a completed backup, and setting/clearing a directory all update independently of other settings', async () => {
    await updateDriveReminderIntervalDays(5)
    await updateLocalBackupEnabled(false)
    let settings = await getAppSettings()
    expect(settings.localBackup.enabled).toBe(false)
    expect(settings.driveBackupReminder.intervalDays).toBe(5) // unaffected

    await updateLocalBackupEnabled(true)
    await setLocalBackupDirectory('Backups')
    settings = await getAppSettings()
    expect(settings.localBackup.enabled).toBe(true)
    expect(settings.localBackup.destination).toBe('directory')
    expect(settings.localBackup.directoryName).toBe('Backups')
    expect(settings.localBackup.lastLocalBackupAt).toBeNull()

    await recordLocalBackupCompleted()
    settings = await getAppSettings()
    expect(settings.localBackup.lastLocalBackupAt).not.toBeNull()
    expect(settings.localBackup.directoryName).toBe('Backups') // unaffected by recording a backup

    await setLocalBackupDirectory(null)
    settings = await getAppSettings()
    expect(settings.localBackup.destination).toBe('downloads')
    expect(settings.localBackup.directoryName).toBeNull()
  })

  it('is never included in an exported backup file', async () => {
    await setLocalBackupDirectory('Backups')
    const backup = await exportFullBackup()
    expect(backup.settings.appSettings).not.toHaveProperty('localBackup')
  })

  it('is preserved (not wiped) by a full-database "replace-all" import, since it is a per-device fact', async () => {
    await setLocalBackupDirectory('My Backups Folder')
    await recordLocalBackupCompleted()
    const before = (await getAppSettings()).localBackup

    const backup = await exportFullBackup()
    const inspection = await inspectBackupFile(backup)
    if (!inspection.valid) throw new Error('expected valid backup')
    await applyBackupImport(inspection.backup, 'replace-all')

    const after = await getAppSettings()
    expect(after.localBackup).toEqual(before)
  })
})

describe('local backup directory handle storage (db v5)', () => {
  it('saves, reads back, and clears a directory handle independently of appSettings', async () => {
    expect(await getLocalBackupDirectoryHandle()).toBeUndefined()

    // A real FileSystemDirectoryHandle only exists in a browser; this just exercises the
    // repository's put/get/delete plumbing against the new v5 table, not the real File System
    // Access API (that's covered by the live-browser verification pass instead).
    const fakeHandle = { kind: 'directory', name: 'Backups' } as unknown as FileSystemDirectoryHandle
    await saveLocalBackupDirectoryHandle(fakeHandle)

    const stored = await getLocalBackupDirectoryHandle()
    expect(stored?.name).toBe('Backups')

    await clearLocalBackupDirectoryHandle()
    expect(await getLocalBackupDirectoryHandle()).toBeUndefined()
  })
})

describe('sample data seeding', () => {
  it('succeeds on a fresh install even though the app already auto-creates a profile for the current year', async () => {
    // This is the exact bug: ensureAppInitialized (which every app boot runs) already
    // creates a profile for the current calendar year before seedSampleData ever runs.
    const bootProfiles = await ensureAppInitialized()
    const currentYear = new Date().getFullYear()
    expect(bootProfiles.some((p) => p.year === currentYear)).toBe(true)

    const result = await seedSampleData()

    const allProfiles = await listYearProfiles()
    expect(allProfiles.some((p) => p.year === currentYear)).toBe(true)
    expect(allProfiles.some((p) => p.year === currentYear - 1)).toBe(true)
    // The current year already existed, so it should be reused, not "created" a second time.
    expect(result.yearsReused.length).toBeGreaterThan(0)
    expect(await listDonationsForYear(allProfiles.find((p) => p.year === currentYear)!.id)).not.toHaveLength(0)
  })

  it('refuses to mix sample data into a year that already has real records', async () => {
    await ensureAppInitialized()
    const chanda = await categoryId('donation', 'Chanda')
    const currentYear = new Date().getFullYear()
    const existing = (await listYearProfiles()).find((p) => p.year === currentYear)!
    await insertDonation(existing.id, {
      donorName: 'Real Donor',
      type: 'monetary',
      amount: 5000,
      date: `${currentYear}-01-01`,
      categoryId: chanda,
    })

    await expect(seedSampleData()).rejects.toBeInstanceOf(YearHasRealDataError)

    // The real record must still be exactly what it was — nothing partially applied.
    expect(await listDonationsForYear(existing.id)).toHaveLength(1)
  })
})

describe('restore default categories/units', () => {
  it('reactivates a deactivated default category without duplicating it', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    await setCategoryActive(chanda, false)

    const restored = await restoreDefaultCategories('donation')

    expect(restored).toContain('Chanda')
    const cats = await listCategories('donation')
    const chandaEntries = cats.filter((c) => c.name === 'Chanda')
    expect(chandaEntries).toHaveLength(1)
    expect(chandaEntries[0].active).toBe(true)
  })

  it('recreates a hard-deleted default category', async () => {
    const cats = await listCategories('donation')
    const auction = cats.find((c) => c.name === 'Auction')!
    expect(await isCategoryInUse(auction.id)).toBe(false)
    await deleteCategory(auction.id)
    expect((await listCategories('donation')).some((c) => c.name === 'Auction')).toBe(false)

    const restored = await restoreDefaultCategories('donation')

    expect(restored).toContain('Auction')
    expect((await listCategories('donation')).some((c) => c.name === 'Auction')).toBe(true)
  })

  it('is a no-op when all defaults are already present and active', async () => {
    const restored = await restoreDefaultCategories('expense')
    expect(restored).toEqual([])
  })

  it('reactivates and recreates default units the same way', async () => {
    const units = await listUnits()
    const kg = units.find((u) => u.name === 'kg')!
    const bags = units.find((u) => u.name === 'bags')!
    expect(await isUnitInUse(kg.id)).toBe(false)
    await setUnitActive(kg.id, false)
    await deleteUnit(bags.id)

    const restored = await restoreDefaultUnits()

    expect(restored).toEqual(expect.arrayContaining(['kg', 'bags']))
    const after = await listUnits()
    expect(after.find((u) => u.name === 'kg')?.active).toBe(true)
    expect(after.some((u) => u.name === 'bags')).toBe(true)
  })
})

describe('concurrent initialization safety', () => {
  it('does not duplicate default categories/units/year-profile when ensureAppInitialized runs concurrently with itself', async () => {
    // Reproduces the exact bug: React 18 StrictMode double-invokes mount effects in dev, and
    // nothing stops two browser tabs from both hitting an empty database on first load. Both
    // race to seed defaults unless the check-then-seed sequence is atomic.
    await Promise.all([db.categories.clear(), db.units.clear(), db.yearProfiles.clear()])

    await Promise.all([ensureAppInitialized(), ensureAppInitialized(), ensureAppInitialized()])

    const categories = await listCategories()
    // Keyed by kind+name, not name alone — "Annadanam" is legitimately both a default
    // donation category AND a default expense category, which is not a duplicate.
    const categoryKeys = categories.map((c) => `${c.kind}::${c.name}`)
    expect(new Set(categoryKeys).size).toBe(categoryKeys.length)
    expect(categories).toHaveLength(3 + 5) // 3 donation + 5 expense defaults, exactly once each

    const unitNames = (await listUnits()).map((u) => u.name)
    expect(new Set(unitNames).size).toBe(unitNames.length)
    expect(unitNames).toHaveLength(8) // the 8 default units, exactly once each

    expect(await listYearProfiles()).toHaveLength(1)
  })
})
