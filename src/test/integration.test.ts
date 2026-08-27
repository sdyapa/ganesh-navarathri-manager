import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { resetApplication } from '@/services/resetService'
import { createYearProfile, getYearClosingBalance, deleteYear } from '@/services/yearService'
import { convertExpectedDonationToDonation, moveExpectedExpenseToExpense } from '@/services/conversionService'
import { insertDonation, listDonationsForYear } from '@/db/repositories/donations'
import { insertExpectedDonation, listExpectedDonationsForYear } from '@/db/repositories/expectedDonations'
import { insertExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense, listExpectedExpensesForYear } from '@/db/repositories/expectedExpenses'
import { listCategories, isCategoryInUse, setCategoryActive, deleteCategory } from '@/db/repositories/categories'
import { listUnits } from '@/db/repositories/units'
import { exportYearBackup, exportFullBackup } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile } from '@/services/backupImport'

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
