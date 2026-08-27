// Core domain types. Dates are stored as "YYYY-MM-DD" strings (date-only, no time/timezone
// component) so a value entered as 27-Aug-2026 can never shift to 26-Aug-2026 because of a
// UTC conversion. Timestamps (createdAt/updatedAt) are ISO-8601 strings in UTC — those are
// bookkeeping metadata, not the financial date, so timezone shifting them is harmless.

export type DateOnly = string // "YYYY-MM-DD"
export type IsoTimestamp = string // new Date().toISOString()

export type DonationType = 'monetary' | 'commodity'
export type ExpectedStatus = 'pending' | 'converted'
export type CategoryKind = 'donation' | 'expense'
export type YearProfileStatus = 'active' | 'archived'

export interface YearProfile {
  id: string
  year: number
  name: string
  openingBalance: number
  carryForward: boolean
  /** Year this profile's opening balance was carried forward from, if any. */
  carryForwardSourceYearId?: string | null
  status: YearProfileStatus
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

interface BaseRecord {
  id: string
  yearProfileId: string
  date: DateOnly
  categoryId: string
  notes?: string
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export interface Donation extends BaseRecord {
  donorName: string
  type: DonationType
  // Monetary
  amount?: number
  // Commodity
  commodityName?: string
  quantity?: number
  unitId?: string
  /** Set when this donation was created by converting an ExpectedDonation. */
  sourceExpectedDonationId?: string | null
}

export interface ExpectedDonation extends BaseRecord {
  donorName: string
  type: DonationType
  amount?: number
  commodityName?: string
  quantity?: number
  unitId?: string
  status: ExpectedStatus
  /** Set once converted, pointing at the resulting Donation. */
  convertedDonationId?: string | null
}

export interface Expense extends BaseRecord {
  description: string
  amount: number
  sourceExpectedExpenseId?: string | null
}

export interface ExpectedExpense extends BaseRecord {
  description: string
  amount: number
  status: ExpectedStatus
  convertedExpenseId?: string | null
}

export interface Auction {
  id: string
  yearProfileId: string
  item: string
  person: string
  amount: number
  date: DateOnly
  notes?: string
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  active: boolean
  order: number
  isDefault: boolean
}

export interface Unit {
  id: string
  name: string
  active: boolean
  order: number
  isDefault: boolean
}

export interface WhatsAppTemplates {
  monetary: string
  commodity: string
}

export interface GoogleDriveState {
  connected: boolean
  accountEmail?: string
}

export interface AppSettings {
  id: 'global'
  whatsappTemplates: WhatsAppTemplates
  updatedAt: IsoTimestamp
}

export interface FinancialSummary {
  yearProfileId: string
  openingBalance: number
  totalMonetaryDonations: number
  totalAuctionProceeds: number
  totalExpenses: number
  closingBalance: number
  totalCommodityDonationCount: number
  expectedMonetaryDonations: number
  expectedCommodityDonationCount: number
  expectedExpenses: number
  counts: {
    monetaryDonations: number
    commodityDonations: number
    auctions: number
    expenses: number
    expectedDonations: number
    expectedExpenses: number
  }
}

export interface CommodityTotal {
  commodityName: string
  unitId: string
  unitName: string
  totalQuantity: number
  donorCount: number
}

// ---------- Backup format ----------

export const BACKUP_SCHEMA_VERSION = 1
export const APP_NAME = 'Ganesh Navarathri Manager'

export type BackupExportType = 'full' | 'single-year'

export interface YearProfileBundle {
  profile: YearProfile
  donations: Donation[]
  expectedDonations: ExpectedDonation[]
  expenses: Expense[]
  expectedExpenses: ExpectedExpense[]
  auctions: Auction[]
}

export interface BackupFile {
  appName: typeof APP_NAME
  appVersion: string
  backupVersion: number
  exportType: BackupExportType
  exportedAt: IsoTimestamp
  years: YearProfileBundle[]
  settings: {
    categories: Category[]
    units: Unit[]
    appSettings: Omit<AppSettings, 'id'>
  }
}
