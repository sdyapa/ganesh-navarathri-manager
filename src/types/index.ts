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
  /** Set when this pledge was generated from an Auction win (see conversionService's
   *  convertAuctionToExpectedDonation) — the auction winner typically pays the following year,
   *  not immediately, so the auction becomes a pending pledge here rather than an actual Donation. */
  sourceAuctionId?: string | null
}

export interface Expense extends BaseRecord {
  description: string
  amount: number
  /** Optional — Expense historically had no person/entity field at all, only free-text
   *  description, so this must stay optional for every pre-existing record to remain valid. */
  vendorName?: string
  sourceExpectedExpenseId?: string | null
}

export interface ExpectedExpense extends BaseRecord {
  description: string
  amount: number
  vendorName?: string
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
  /** Set once this auction win has been converted into a pending Expected Donation for next
   *  year (see conversionService's convertAuctionToExpectedDonation). */
  convertedToExpectedDonationId?: string | null
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

export type ProfileKind = 'person' | 'vendor'

/** A reusable, cross-year name registry for autocompletion — 'person' covers both donors and
 *  auction participants (the same real people commonly fill both roles across years), 'vendor'
 *  covers who an expense was paid to. Unlike Category/Unit, no other record stores a foreign
 *  key to a Profile — donor/vendor/person fields stay plain free text (an autocomplete
 *  suggestion, not a strict picker), so there's no referential integrity to protect and no
 *  active/isDefault/in-use tracking is needed: deleting a Profile is always simply safe. */
export interface Profile {
  id: string
  kind: ProfileKind
  name: string
  order: number
}

export interface WhatsAppTemplates {
  monetary: string
  commodity: string
}

export interface GoogleDriveState {
  connected: boolean
  accountEmail?: string
}

/** Local-only preference (never included in export/import backups — a device's own reminder
 *  cadence and backup history shouldn't be overwritten by restoring someone else's data). */
export interface DriveBackupReminderSettings {
  intervalDays: number
  lastBackupAt: IsoTimestamp | null
}

export interface AppSettings {
  id: 'global'
  /** Customizable display name shown in the sidebar/top bar — lets a committee brand the app
   *  as their own (e.g. a specific temple/mandal name) instead of the generic default. Named
   *  "displayName" (not "appName") specifically to avoid colliding with the fixed `appName`
   *  literal on BackupFile below, which identifies the backup *format*, not this preference. */
  displayName: string
  whatsappTemplates: WhatsAppTemplates
  driveBackupReminder: DriveBackupReminderSettings
  updatedAt: IsoTimestamp
}

export interface FinancialSummary {
  yearProfileId: string
  openingBalance: number
  totalMonetaryDonations: number
  /** Reported for visibility only — deliberately excluded from closingBalance. An auction win
   *  is a pledge, not cash in hand; the winner pays the following year (see
   *  conversionService's convertAuctionToExpectedDonation). */
  totalAuctionProceeds: number
  totalExpenses: number
  /** = openingBalance + totalMonetaryDonations - totalExpenses. Deliberately excludes
   *  totalAuctionProceeds — see its doc comment above. */
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
    profiles: Profile[]
    // Only the portable preferences travel in a backup. driveBackupReminder is deliberately
    // excluded — it's a per-device fact (this device's last backup time, its reminder cadence)
    // that restoring someone else's data shouldn't overwrite.
    appSettings: Pick<AppSettings, 'displayName' | 'whatsappTemplates' | 'updatedAt'>
  }
}
