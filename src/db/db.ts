import Dexie, { type Table } from 'dexie'
import type {
  AppSettings,
  Auction,
  Category,
  Donation,
  ExpectedDonation,
  ExpectedExpense,
  Expense,
  Unit,
  YearProfile,
} from '@/types'

// A single IndexedDB database holds every year — records are scoped by `yearProfileId`, so
// switching the active year is just a query filter, not a restore. Indexes are declared on the
// fields every list/filter/search screen queries by, so lookups stay fast even with thousands
// of records across many years (see spec "Performance").
export class AppDatabase extends Dexie {
  yearProfiles!: Table<YearProfile, string>
  donations!: Table<Donation, string>
  expectedDonations!: Table<ExpectedDonation, string>
  expenses!: Table<Expense, string>
  expectedExpenses!: Table<ExpectedExpense, string>
  auctions!: Table<Auction, string>
  categories!: Table<Category, string>
  units!: Table<Unit, string>
  appSettings!: Table<AppSettings, string>

  constructor() {
    super('ganesh-navarathri-manager')
    this.version(1).stores({
      yearProfiles: 'id, year, status',
      donations: 'id, yearProfileId, date, type, categoryId, donorName, [yearProfileId+date], [yearProfileId+type]',
      expectedDonations:
        'id, yearProfileId, date, type, status, categoryId, [yearProfileId+status], [yearProfileId+date]',
      expenses: 'id, yearProfileId, date, categoryId, [yearProfileId+date]',
      expectedExpenses: 'id, yearProfileId, date, status, categoryId, [yearProfileId+status]',
      auctions: 'id, yearProfileId, date, [yearProfileId+date]',
      categories: 'id, kind, active, order',
      units: 'id, active, order',
      appSettings: 'id',
    })
    // v2: unitId was queried (isUnitInUse, in units.ts) but never indexed — that throws a
    // SchemaError the moment it actually runs (e.g. deleting a unit from Settings). Adding an
    // index requires a version bump; a database already created at v1 upgrades automatically
    // the next time this app opens it.
    this.version(2).stores({
      donations: 'id, yearProfileId, date, type, categoryId, donorName, unitId, [yearProfileId+date], [yearProfileId+type]',
      expectedDonations:
        'id, yearProfileId, date, type, status, categoryId, unitId, [yearProfileId+status], [yearProfileId+date]',
    })
  }
}

export const db = new AppDatabase()
