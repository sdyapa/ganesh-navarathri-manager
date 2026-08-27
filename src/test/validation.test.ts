import { describe, expect, it } from 'vitest'
import {
  auctionInputSchema,
  backupFileSchema,
  donationInputSchema,
  expenseInputSchema,
} from '@/lib/validation'
import { BACKUP_SCHEMA_VERSION } from '@/types'

describe('donationInputSchema', () => {
  const base = { donorName: 'Ramesh', date: '2026-08-27', categoryId: 'cat-1' }

  it('accepts a valid monetary donation', () => {
    const result = donationInputSchema.safeParse({ ...base, type: 'monetary', amount: 500 })
    expect(result.success).toBe(true)
  })

  it('rejects a monetary donation with ₹0 or missing amount', () => {
    expect(donationInputSchema.safeParse({ ...base, type: 'monetary', amount: 0 }).success).toBe(false)
    expect(donationInputSchema.safeParse({ ...base, type: 'monetary' }).success).toBe(false)
  })

  it('rejects a commodity donation missing commodity name, quantity, or unit', () => {
    expect(donationInputSchema.safeParse({ ...base, type: 'commodity', quantity: 5, unitId: 'kg' }).success).toBe(false)
    expect(donationInputSchema.safeParse({ ...base, type: 'commodity', commodityName: 'Rice', unitId: 'kg' }).success).toBe(false)
    expect(donationInputSchema.safeParse({ ...base, type: 'commodity', commodityName: 'Rice', quantity: 5 }).success).toBe(false)
  })

  it('accepts a valid commodity donation with a decimal quantity', () => {
    const result = donationInputSchema.safeParse({
      ...base,
      type: 'commodity',
      commodityName: 'Cooking Oil',
      quantity: 1.5,
      unitId: 'litre',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing donor name or invalid date', () => {
    expect(donationInputSchema.safeParse({ ...base, donorName: '', type: 'monetary', amount: 100 }).success).toBe(false)
    expect(donationInputSchema.safeParse({ ...base, date: 'not-a-date', type: 'monetary', amount: 100 }).success).toBe(false)
  })
})

describe('expenseInputSchema', () => {
  it('rejects ₹0 and negative amounts', () => {
    expect(expenseInputSchema.safeParse({ description: 'Flowers', amount: 0, date: '2026-08-27', categoryId: 'c1' }).success).toBe(false)
    expect(expenseInputSchema.safeParse({ description: 'Flowers', amount: -50, date: '2026-08-27', categoryId: 'c1' }).success).toBe(false)
  })

  it('accepts a valid expense', () => {
    expect(expenseInputSchema.safeParse({ description: 'Flowers', amount: 500, date: '2026-08-27', categoryId: 'c1' }).success).toBe(true)
  })
})

describe('auctionInputSchema', () => {
  it('requires item, person, and a positive amount', () => {
    expect(auctionInputSchema.safeParse({ item: '', person: 'Ramesh', amount: 100, date: '2026-08-27' }).success).toBe(false)
    expect(auctionInputSchema.safeParse({ item: 'Laddu', person: '', amount: 100, date: '2026-08-27' }).success).toBe(false)
    expect(auctionInputSchema.safeParse({ item: 'Laddu', person: 'Ramesh', amount: 0, date: '2026-08-27' }).success).toBe(false)
    expect(auctionInputSchema.safeParse({ item: 'Laddu', person: 'Ramesh', amount: 3500, date: '2026-08-27' }).success).toBe(true)
  })
})

describe('backupFileSchema', () => {
  function validBackup(overrides: Record<string, unknown> = {}) {
    return {
      appName: 'Ganesh Navarathri Manager',
      appVersion: '1.0.0',
      backupVersion: BACKUP_SCHEMA_VERSION,
      exportType: 'single-year',
      exportedAt: new Date().toISOString(),
      years: [
        {
          profile: {
            id: 'y1',
            year: 2026,
            name: 'Ganesh Navarathri 2026',
            openingBalance: 0,
            carryForward: false,
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          donations: [],
          expectedDonations: [],
          expenses: [],
          expectedExpenses: [],
          auctions: [],
        },
      ],
      settings: { categories: [], units: [], appSettings: {} },
      ...overrides,
    }
  }

  it('accepts a well-formed backup', () => {
    expect(backupFileSchema.safeParse(validBackup()).success).toBe(true)
  })

  it('rejects malformed / unrelated JSON without throwing', () => {
    expect(backupFileSchema.safeParse({ hello: 'world' }).success).toBe(false)
    expect(backupFileSchema.safeParse(null).success).toBe(false)
    expect(backupFileSchema.safeParse('just a string').success).toBe(false)
  })

  it('preserves unknown future fields via passthrough rather than stripping/rejecting them', () => {
    const withExtra = validBackup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(withExtra.years[0].profile as any).futureField = 'from a newer app version'
    const result = backupFileSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.data.years[0].profile as any).futureField).toBe('from a newer app version')
    }
  })
})
