import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { resetApplication } from '@/services/resetService'
import { createYearProfile, getYearClosingBalance, deleteYear } from '@/services/yearService'
import { convertExpectedDonationToDonation, moveExpectedExpenseToExpense } from '@/services/conversionService'
import { insertDonation, listDonationsForYear } from '@/db/repositories/donations'
import { insertExpectedDonation, listExpectedDonationsForYear } from '@/db/repositories/expectedDonations'
import { insertExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense, listExpectedExpensesForYear } from '@/db/repositories/expectedExpenses'
import {
  listCategories,
  isCategoryInUse,
  setCategoryActive,
  deleteCategory,
  restoreDefaultCategories,
} from '@/db/repositories/categories'
import { listUnits, setUnitActive, deleteUnit, isUnitInUse, restoreDefaultUnits } from '@/db/repositories/units'
import { exportYearBackup, exportFullBackup } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile } from '@/services/backupImport'
import {
  getAppSettings,
  recordDriveBackupCompleted,
  updateDisplayName,
  updateDriveReminderIntervalDays,
} from '@/db/repositories/settings'
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

describe('reset application', () => {
  it('wipes everything and reseeds clean defaults', async () => {
    const chanda = await categoryId('donation', 'Chanda')
    const year = await createYearProfile({ year: 3090, name: 'GN 3090', carryForward: false })
    await insertDonation(year.id, { donorName: 'X', type: 'monetary', amount: 100, date: '3090-01-01', categoryId: chanda })

    const profiles = await resetApplication()

    expect(await db.donations.count()).toBe(0)
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
