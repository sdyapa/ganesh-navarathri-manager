// Core domain types. Dates are stored as "YYYY-MM-DD" strings (date-only, no time/timezone
// component) so a value entered as 27-Aug-2026 can never shift to 26-Aug-2026 because of a
// UTC conversion. Timestamps (createdAt/updatedAt) are ISO-8601 strings in UTC — those are
// bookkeeping metadata, not the financial date, so timezone shifting them is harmless.

export type DateOnly = string // "YYYY-MM-DD"
export type IsoTimestamp = string // new Date().toISOString()

export type DonationType = 'monetary' | 'commodity'
/** 'partially-paid' only ever applies to ExpectedDonation (see its installmentDonationIds doc
 *  comment) — ExpectedExpense shares this type but never sets that value, since expenses aren't
 *  paid in tracked installments the way donation pledges can be. */
export type ExpectedStatus = 'pending' | 'partially-paid' | 'converted'
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
  /** Set once converted, pointing at the resulting Donation. For a pledge paid in installments
   *  (see installmentDonationIds below), this is only set once the LAST installment brings the
   *  running total to the full pledge amount — it then points at that final installment's
   *  Donation, same as a one-shot conversion always has. */
  convertedDonationId?: string | null
  /** Set when this pledge was generated from an Auction win (see conversionService's
   *  convertAuctionToExpectedDonation) — the auction winner typically pays the following year,
   *  not immediately, so the auction becomes a pending pledge here rather than an actual Donation. */
  sourceAuctionId?: string | null
  /** IDs of every actual Donation created against this pledge via recordPartialPayment
   *  (conversionService.ts) — a pledge can be paid in more than one installment instead of all
   *  at once. Each installment is still a real, auditable Donation record the moment it's
   *  received (contributing to the actual closing balance immediately, exactly like a one-shot
   *  conversion does) rather than a running counter with no underlying transaction trail —
   *  "amount collected so far" is always `sum of these Donations' amounts`, never stored
   *  redundantly. Only meaningful for monetary pledges; a commodity donation is never partial
   *  (you either received the sack of rice or you didn't). Undefined/empty for a pledge that
   *  was never paid in installments — status still distinguishes 'pending' from 'converted' in
   *  that case exactly as before this field existed. */
  installmentDonationIds?: string[]
}

export interface Expense extends BaseRecord {
  description: string
  amount: number
  /** Optional — Expense historically had no person/entity field at all, only free-text
   *  description, so this must stay optional for every pre-existing record to remain valid. */
  vendorName?: string
  sourceExpectedExpenseId?: string | null
  /** Free-text label for grouping split payments (advance/part/final) to the same vendor in
   *  the Expenses list view — purely visual, deliberately not referenced by calculations,
   *  reportBuilders, pdf.ts, or png.ts, so totals/reports/exports are unaffected. Not present
   *  on ExpectedExpense — grouping split payments only makes sense once they're actual. */
  paymentGroup?: string
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

export interface TaskChecklistItem {
  id: string
  label: string
  done: boolean
}

/** A TODO with a due date (e.g. "Book priest by 10-Sep") — year-scoped like everything else in
 *  the app, since a task only means something for one specific festival occurrence. checklist
 *  is stored as an embedded array rather than its own table: it's never queried independently
 *  of its task, so a separate table would just be complexity with no benefit. */
export interface Task {
  id: string
  yearProfileId: string
  title: string
  dueDate: DateOnly
  notes?: string
  done: boolean
  checklist: TaskChecklistItem[]
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

/** A named, dated festival milestone (Annadanam, Nimajjanam/idol immersion, Kumkumarchana,
 *  etc.) — freely named rather than a fixed enum, since which of these apply (and when) varies
 *  year to year. */
export interface KeyEvent {
  id: string
  yearProfileId: string
  name: string
  date: DateOnly
  notes?: string
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

/** Which family/families performed pooja on a given day, up to immersion day — one entry per
 *  day. familyNames is plain free text (e.g. "Sharma family, Reddy family") rather than a
 *  multi-select of Profiles: supporting one-or-more names for a field filled in once a day for
 *  a few weeks a year isn't worth a dedicated multi-tag/multi-autocomplete input. */
export interface PoojaAssignment {
  id: string
  yearProfileId: string
  date: DateOnly
  familyNames: string
  notes?: string
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
}

export type InventoryItemStatus = 'stored' | 'returned'

/** Equipment/property (speaker, amplifier, carpets, lights, etc.) kept at a committee member's
 *  home between festivals — year-scoped like Tasks, since "who's holding what" is tracked fresh
 *  each season even if the same physical item recurs. `keptWith` reuses the Profile registry
 *  (kind 'person') for autocomplete, the same way Donor/Auction-participant names do, rather
 *  than a fresh free-text field with no suggestion list. */
export interface InventoryItem {
  id: string
  yearProfileId: string
  itemName: string
  quantity?: number
  keptWith: string
  notes?: string
  status: InventoryItemStatus
  storedDate: DateOnly
  returnedDate?: DateOnly | null
  /** Set when this item was carried forward from a prior year's still-'stored' item via
   *  Copy to Next Year (see copyForwardService.ts's copyInventoryItemsToYear) — this is a
   *  reconciliation checklist, not a blind duplicate: only still-outstanding items are ever
   *  eligible to copy, so the new year's card can show "Carried from {source year}" and get
   *  explicitly checked off ('Mark Returned') once the physical item actually comes back,
   *  making anything left unchecked by season's end a visible "not yet returned" list. The
   *  source item in the prior year is left untouched by copying — only a separate "Mark
   *  Returned" action changes it. */
  sourceInventoryItemId?: string | null
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
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

/** Local-only preference (never included in export/import backups — see DriveBackupReminderSettings
 *  above for why). Drives the silent, no-click full-database backup that runs on every app
 *  launch (see services/localBackupService.ts). */
export interface LocalBackupSettings {
  /** Whether the on-launch backup runs at all. Defaults to true. */
  enabled: boolean
  /** 'downloads' — every browser's plain download flow, always lands in the Downloads folder
   *  and can't be redirected. 'directory' — a user-picked folder via the File System Access API
   *  (desktop Chrome/Edge only; unsupported everywhere else, including every mobile browser and
   *  Firefox/Safari). The actual `FileSystemDirectoryHandle` lives in its own Dexie table
   *  (db/repositories/localBackupHandle.ts), never here — it isn't the kind of value this
   *  JSON-serialized settings document should carry. */
  destination: 'downloads' | 'directory'
  /** Cosmetic label for the picked folder, shown in Settings — e.g. "Backups". Null when
   *  destination is 'downloads'. */
  directoryName: string | null
  lastLocalBackupAt: IsoTimestamp | null
}

/** The single row in Dexie's `localBackupHandle` table — kept separate from AppSettings because
 *  a FileSystemDirectoryHandle shouldn't live inside a document that flows through
 *  JSON.stringify on every backup export (see backupExport.ts's downloadJsonFile). Never
 *  imported outside db/ itself; use db/repositories/localBackupHandle.ts. */
export interface LocalBackupHandleRecord {
  id: 'directory'
  handle: FileSystemDirectoryHandle
}

/** How row actions (Edit, Delete, Duplicate, Move to Expenses, etc.) render everywhere in the
 *  app — 'text' matches the app's original appearance exactly, so this is the default and
 *  nothing changes visually until a user opts into icons from Settings. */
export type ActionDisplayMode = 'icon' | 'text' | 'both'

/** 'system' follows the device/browser's own light/dark preference live; 'light'/'dark' pin an
 *  explicit choice regardless of the device. See useTheme.ts for how this resolves. */
export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppSettings {
  id: 'global'
  /** Customizable display name shown in the sidebar/top bar — lets a committee brand the app
   *  as their own (e.g. a specific temple/mandal name) instead of the generic default. Named
   *  "displayName" (not "appName") specifically to avoid colliding with the fixed `appName`
   *  literal on BackupFile below, which identifies the backup *format*, not this preference. */
  displayName: string
  whatsappTemplates: WhatsAppTemplates
  actionDisplayMode: ActionDisplayMode
  themePreference: ThemePreference
  /** How many upcoming (pending) tasks show in the Dashboard's "Heads Up" preview — see
   *  Dashboard.tsx. Defaults to 3; a committee with a busier task list can raise it. */
  dashboardTaskPreviewCount: number
  driveBackupReminder: DriveBackupReminderSettings
  localBackup: LocalBackupSettings
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
  tasks: Task[]
  keyEvents: KeyEvent[]
  poojaAssignments: PoojaAssignment[]
  inventoryItems: InventoryItem[]
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
    appSettings: Pick<
      AppSettings,
      'displayName' | 'whatsappTemplates' | 'actionDisplayMode' | 'themePreference' | 'dashboardTaskPreviewCount' | 'updatedAt'
    >
  }
}
