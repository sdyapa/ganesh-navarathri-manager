// Backup import: inspection (safe, read-only parsing) and application (the actual writes).
// The two are always separate calls — the UI must show the user exactly what a backup
// contains before anything touches the database (spec "Import Safety" / "Never silently
// overwrite existing data").
import { db } from '@/db/db'
import { BACKUP_SCHEMA_VERSION } from '@/types'
import type {
  Auction,
  Category,
  Donation,
  ExpectedDonation,
  ExpectedExpense,
  Expense,
  KeyEvent,
  PoojaAssignment,
  Profile,
  Task,
  Unit,
  YearProfile,
} from '@/types'
import { backupFileSchema, type ParsedBackupFile } from '@/lib/validation'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import { listYearProfiles } from '@/db/repositories/yearProfiles'
import { listCategories } from '@/db/repositories/categories'
import { listUnits } from '@/db/repositories/units'
import { upsertProfileFromName } from '@/db/repositories/profiles'
import { getAppSettings } from '@/db/repositories/settings'

export type ImportMode = 'add-new' | 'skip-duplicates' | 'replace-year' | 'replace-all'

export type BackupInspection =
  | { valid: true; backup: ParsedBackupFile; summary: BackupSummary }
  | { valid: false; error: string }

export interface BackupSummary {
  exportType: ParsedBackupFile['exportType']
  appVersion?: string
  exportedAt: string
  years: Array<{
    year: number
    name: string
    donations: number
    expectedDonations: number
    expenses: number
    expectedExpenses: number
    auctions: number
    tasks: number
    keyEvents: number
    poojaAssignments: number
  }>
  totals: {
    donations: number
    expectedDonations: number
    expenses: number
    expectedExpenses: number
    auctions: number
    tasks: number
    keyEvents: number
    poojaAssignments: number
  }
  categoryCount: number
  unitCount: number
  profileCount: number
  existingLocalYears: number[]
}

export async function inspectBackupFile(raw: unknown): Promise<BackupInspection> {
  let parsed: ParsedBackupFile
  try {
    parsed = backupFileSchema.parse(raw)
  } catch {
    return {
      valid: false,
      error:
        'This file could not be recognized as a Ganesh Navarathri Manager backup. It may be corrupted, edited incorrectly, or from a different application.',
    }
  }

  if (parsed.backupVersion > BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `This backup was created by a newer version of the app (schema v${parsed.backupVersion}, this app supports up to v${BACKUP_SCHEMA_VERSION}). Please update the app before importing it.`,
    }
  }

  if (parsed.years.length === 0) {
    return { valid: false, error: 'This backup does not contain any year data.' }
  }

  const localProfiles = await listYearProfiles()

  const summary: BackupSummary = {
    exportType: parsed.exportType,
    appVersion: parsed.appVersion,
    exportedAt: parsed.exportedAt,
    years: parsed.years.map((y) => ({
      year: y.profile.year,
      name: y.profile.name,
      donations: y.donations.length,
      expectedDonations: y.expectedDonations.length,
      expenses: y.expenses.length,
      expectedExpenses: y.expectedExpenses.length,
      auctions: y.auctions.length,
      tasks: y.tasks.length,
      keyEvents: y.keyEvents.length,
      poojaAssignments: y.poojaAssignments.length,
    })),
    totals: parsed.years.reduce(
      (acc, y) => ({
        donations: acc.donations + y.donations.length,
        expectedDonations: acc.expectedDonations + y.expectedDonations.length,
        expenses: acc.expenses + y.expenses.length,
        expectedExpenses: acc.expectedExpenses + y.expectedExpenses.length,
        auctions: acc.auctions + y.auctions.length,
        tasks: acc.tasks + y.tasks.length,
        keyEvents: acc.keyEvents + y.keyEvents.length,
        poojaAssignments: acc.poojaAssignments + y.poojaAssignments.length,
      }),
      { donations: 0, expectedDonations: 0, expenses: 0, expectedExpenses: 0, auctions: 0, tasks: 0, keyEvents: 0, poojaAssignments: 0 },
    ),
    categoryCount: parsed.settings.categories.length,
    unitCount: parsed.settings.units.length,
    profileCount: parsed.settings.profiles.length,
    existingLocalYears: localProfiles.map((p) => p.year),
  }

  return { valid: true, backup: parsed, summary }
}

export interface ImportResult {
  yearsCreated: number
  yearsMergedInto: number
  inserted: {
    donations: number
    expectedDonations: number
    expenses: number
    expectedExpenses: number
    auctions: number
    tasks: number
    keyEvents: number
    poojaAssignments: number
  }
  skippedDuplicates: number
}

function emptyResult(): ImportResult {
  return {
    yearsCreated: 0,
    yearsMergedInto: 0,
    inserted: {
      donations: 0,
      expectedDonations: 0,
      expenses: 0,
      expectedExpenses: 0,
      auctions: 0,
      tasks: 0,
      keyEvents: 0,
      poojaAssignments: 0,
    },
    skippedDuplicates: 0,
  }
}

class CategoryUnitResolver {
  private categoryCache = new Map<string, string>() // "kind::name" -> local id
  private unitCache = new Map<string, string>() // name -> local id

  static async create(): Promise<CategoryUnitResolver> {
    const r = new CategoryUnitResolver()
    const [categories, units] = await Promise.all([listCategories(), listUnits()])
    for (const c of categories) r.categoryCache.set(`${c.kind}::${c.name.trim().toLowerCase()}`, c.id)
    for (const u of units) r.unitCache.set(u.name.trim().toLowerCase(), u.id)
    return r
  }

  async resolveCategory(kind: Category['kind'], name: string, order: number): Promise<string> {
    const key = `${kind}::${name.trim().toLowerCase()}`
    const existing = this.categoryCache.get(key)
    if (existing) return existing
    const created: Category = { id: generateId(), kind, name: name.trim(), active: true, order, isDefault: false }
    await db.categories.add(created)
    this.categoryCache.set(key, created.id)
    return created.id
  }

  async resolveUnit(name: string, order: number): Promise<string> {
    const key = name.trim().toLowerCase()
    const existing = this.unitCache.get(key)
    if (existing) return existing
    const created: Unit = { id: generateId(), name: name.trim(), active: true, order, isDefault: false }
    await db.units.add(created)
    this.unitCache.set(key, created.id)
    return created.id
  }
}

function donationKey(d: Pick<Donation, 'donorName' | 'type' | 'date' | 'amount' | 'commodityName' | 'quantity'>): string {
  return [d.donorName.trim().toLowerCase(), d.type, d.date, d.amount ?? '', (d.commodityName ?? '').toLowerCase(), d.quantity ?? ''].join(
    '|',
  )
}
function expenseKey(e: Pick<Expense, 'description' | 'date' | 'amount'>): string {
  return [e.description.trim().toLowerCase(), e.date, e.amount].join('|')
}
function auctionKey(a: Pick<Auction, 'item' | 'person' | 'date' | 'amount'>): string {
  return [a.item.trim().toLowerCase(), a.person.trim().toLowerCase(), a.date, a.amount].join('|')
}
function taskKey(t: Pick<Task, 'title' | 'dueDate'>): string {
  return [t.title.trim().toLowerCase(), t.dueDate].join('|')
}
function keyEventKey(k: Pick<KeyEvent, 'name' | 'date'>): string {
  return [k.name.trim().toLowerCase(), k.date].join('|')
}
function poojaAssignmentKey(p: Pick<PoojaAssignment, 'date' | 'familyNames'>): string {
  return [p.date, p.familyNames.trim().toLowerCase()].join('|')
}

/** Applies a validated backup according to the chosen conflict-resolution mode. Always runs
 *  inside a single transaction so a mid-import failure can't leave the database half-written. */
export async function applyBackupImport(backup: ParsedBackupFile, mode: ImportMode): Promise<ImportResult> {
  const result = emptyResult()

  if (mode === 'replace-all') {
    // driveBackupReminder is a per-device preference/fact, never part of a backup — preserve
    // whatever this device already has instead of letting the import wipe it. displayName and
    // whatsappTemplates fall back to the current values too, purely so an older backup that
    // predates one of these fields doesn't blank it out.
    const currentSettings = await getAppSettings()
    await db.transaction(
      'rw',
      [
        db.yearProfiles,
        db.donations,
        db.expectedDonations,
        db.expenses,
        db.expectedExpenses,
        db.auctions,
        db.categories,
        db.units,
        db.profiles,
        db.tasks,
        db.keyEvents,
        db.poojaAssignments,
        db.appSettings,
      ],
      async () => {
        await Promise.all([
          db.yearProfiles.clear(),
          db.donations.clear(),
          db.expectedDonations.clear(),
          db.expenses.clear(),
          db.expectedExpenses.clear(),
          db.auctions.clear(),
          db.categories.clear(),
          db.units.clear(),
          db.profiles.clear(),
          db.tasks.clear(),
          db.keyEvents.clear(),
          db.poojaAssignments.clear(),
        ])
        await db.categories.bulkAdd(backup.settings.categories as Category[])
        await db.units.bulkAdd(backup.settings.units as Unit[])
        await db.profiles.bulkAdd(backup.settings.profiles as Profile[])
        await db.appSettings.put({
          id: 'global',
          displayName: backup.settings.appSettings?.displayName?.trim() || currentSettings.displayName,
          whatsappTemplates: backup.settings.appSettings?.whatsappTemplates
            ? {
                monetary: backup.settings.appSettings.whatsappTemplates.monetary ?? currentSettings.whatsappTemplates.monetary,
                commodity: backup.settings.appSettings.whatsappTemplates.commodity ?? currentSettings.whatsappTemplates.commodity,
              }
            : currentSettings.whatsappTemplates,
          driveBackupReminder: currentSettings.driveBackupReminder,
          updatedAt: nowIso(),
        })
        for (const bundle of backup.years) {
          await db.yearProfiles.add(bundle.profile as YearProfile)
          await db.donations.bulkAdd(bundle.donations as Donation[])
          await db.expectedDonations.bulkAdd(bundle.expectedDonations as ExpectedDonation[])
          await db.expenses.bulkAdd(bundle.expenses as Expense[])
          await db.expectedExpenses.bulkAdd(bundle.expectedExpenses as ExpectedExpense[])
          await db.auctions.bulkAdd(bundle.auctions as Auction[])
          if (bundle.tasks.length) await db.tasks.bulkAdd(bundle.tasks as Task[])
          if (bundle.keyEvents.length) await db.keyEvents.bulkAdd(bundle.keyEvents as KeyEvent[])
          if (bundle.poojaAssignments.length) await db.poojaAssignments.bulkAdd(bundle.poojaAssignments as PoojaAssignment[])
          result.yearsCreated += 1
          result.inserted.donations += bundle.donations.length
          result.inserted.expectedDonations += bundle.expectedDonations.length
          result.inserted.expenses += bundle.expenses.length
          result.inserted.expectedExpenses += bundle.expectedExpenses.length
          result.inserted.auctions += bundle.auctions.length
          result.inserted.tasks += bundle.tasks.length
          result.inserted.keyEvents += bundle.keyEvents.length
          result.inserted.poojaAssignments += bundle.poojaAssignments.length
        }
      },
    )
    return result
  }

  const resolver = await CategoryUnitResolver.create()
  const backupCategoryNameById = new Map(backup.settings.categories.map((c) => [c.id, c] as const))
  const backupUnitNameById = new Map(backup.settings.units.map((u) => [u.id, u] as const))

  await db.transaction(
    'rw',
    [
      db.yearProfiles,
      db.donations,
      db.expectedDonations,
      db.expenses,
      db.expectedExpenses,
      db.auctions,
      db.categories,
      db.units,
      db.profiles,
      db.tasks,
      db.keyEvents,
      db.poojaAssignments,
    ],
    async () => {
      const localProfiles = await listYearProfiles()

      // Profiles have no foreign-key relationship from any other record (see the Profile
      // type's doc comment), so — unlike categories/units — merging them in is just a
      // case-insensitive upsert by name, no id-remapping resolver needed.
      for (const p of backup.settings.profiles) {
        await upsertProfileFromName(p.kind, p.name)
      }

      for (const bundle of backup.years) {
        let targetYearId: string
        const localExisting = localProfiles.find((p) => p.year === bundle.profile.year)

        if (mode === 'replace-year') {
          if (localExisting) {
            await db.donations.where('yearProfileId').equals(localExisting.id).delete()
            await db.expectedDonations.where('yearProfileId').equals(localExisting.id).delete()
            await db.expenses.where('yearProfileId').equals(localExisting.id).delete()
            await db.expectedExpenses.where('yearProfileId').equals(localExisting.id).delete()
            await db.auctions.where('yearProfileId').equals(localExisting.id).delete()
            await db.tasks.where('yearProfileId').equals(localExisting.id).delete()
            await db.keyEvents.where('yearProfileId').equals(localExisting.id).delete()
            await db.poojaAssignments.where('yearProfileId').equals(localExisting.id).delete()
            targetYearId = localExisting.id
            await db.yearProfiles.update(targetYearId, {
              name: bundle.profile.name,
              openingBalance: bundle.profile.openingBalance,
              carryForward: bundle.profile.carryForward,
              updatedAt: nowIso(),
            })
            result.yearsMergedInto += 1
          } else {
            targetYearId = generateId()
            await db.yearProfiles.add({ ...(bundle.profile as YearProfile), id: targetYearId, updatedAt: nowIso() })
            result.yearsCreated += 1
          }
        } else if (localExisting) {
          targetYearId = localExisting.id
          result.yearsMergedInto += 1
        } else {
          targetYearId = generateId()
          await db.yearProfiles.add({ ...(bundle.profile as YearProfile), id: targetYearId, updatedAt: nowIso() })
          result.yearsCreated += 1
        }

        const dedupe = mode === 'skip-duplicates'
        const existingDonationKeys = dedupe
          ? new Set((await db.donations.where('yearProfileId').equals(targetYearId).toArray()).map(donationKey))
          : null
        const existingExpectedDonationKeys = dedupe
          ? new Set(
              (await db.expectedDonations.where('yearProfileId').equals(targetYearId).toArray()).map(donationKey),
            )
          : null
        const existingExpenseKeys = dedupe
          ? new Set((await db.expenses.where('yearProfileId').equals(targetYearId).toArray()).map(expenseKey))
          : null
        const existingExpectedExpenseKeys = dedupe
          ? new Set(
              (await db.expectedExpenses.where('yearProfileId').equals(targetYearId).toArray()).map(expenseKey),
            )
          : null
        const existingAuctionKeys = dedupe
          ? new Set((await db.auctions.where('yearProfileId').equals(targetYearId).toArray()).map(auctionKey))
          : null
        const existingTaskKeys = dedupe
          ? new Set((await db.tasks.where('yearProfileId').equals(targetYearId).toArray()).map(taskKey))
          : null
        const existingKeyEventKeys = dedupe
          ? new Set((await db.keyEvents.where('yearProfileId').equals(targetYearId).toArray()).map(keyEventKey))
          : null
        const existingPoojaAssignmentKeys = dedupe
          ? new Set((await db.poojaAssignments.where('yearProfileId').equals(targetYearId).toArray()).map(poojaAssignmentKey))
          : null

        for (const d of bundle.donations) {
          const cat = backupCategoryNameById.get(d.categoryId)
          const localCategoryId = cat ? await resolver.resolveCategory('donation', cat.name, cat.order) : d.categoryId
          const unit = d.unitId ? backupUnitNameById.get(d.unitId) : undefined
          const localUnitId = unit ? await resolver.resolveUnit(unit.name, unit.order) : d.unitId
          const record: Donation = {
            ...(d as Donation),
            id: mode === 'replace-year' ? d.id : generateId(),
            yearProfileId: targetYearId,
            categoryId: localCategoryId,
            unitId: localUnitId,
          }
          if (existingDonationKeys?.has(donationKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.donations.add(record)
          await upsertProfileFromName('person', record.donorName)
          result.inserted.donations += 1
        }

        for (const d of bundle.expectedDonations) {
          const cat = backupCategoryNameById.get(d.categoryId)
          const localCategoryId = cat ? await resolver.resolveCategory('donation', cat.name, cat.order) : d.categoryId
          const unit = d.unitId ? backupUnitNameById.get(d.unitId) : undefined
          const localUnitId = unit ? await resolver.resolveUnit(unit.name, unit.order) : d.unitId
          const record: ExpectedDonation = {
            ...(d as ExpectedDonation),
            id: mode === 'replace-year' ? d.id : generateId(),
            yearProfileId: targetYearId,
            categoryId: localCategoryId,
            unitId: localUnitId,
          }
          if (existingExpectedDonationKeys?.has(donationKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.expectedDonations.add(record)
          await upsertProfileFromName('person', record.donorName)
          result.inserted.expectedDonations += 1
        }

        for (const e of bundle.expenses) {
          const cat = backupCategoryNameById.get(e.categoryId)
          const localCategoryId = cat ? await resolver.resolveCategory('expense', cat.name, cat.order) : e.categoryId
          const record: Expense = {
            ...(e as Expense),
            id: mode === 'replace-year' ? e.id : generateId(),
            yearProfileId: targetYearId,
            categoryId: localCategoryId,
          }
          if (existingExpenseKeys?.has(expenseKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.expenses.add(record)
          await upsertProfileFromName('vendor', record.vendorName)
          result.inserted.expenses += 1
        }

        for (const e of bundle.expectedExpenses) {
          const cat = backupCategoryNameById.get(e.categoryId)
          const localCategoryId = cat ? await resolver.resolveCategory('expense', cat.name, cat.order) : e.categoryId
          const record: ExpectedExpense = {
            ...(e as ExpectedExpense),
            id: mode === 'replace-year' ? e.id : generateId(),
            yearProfileId: targetYearId,
            categoryId: localCategoryId,
          }
          if (existingExpectedExpenseKeys?.has(expenseKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.expectedExpenses.add(record)
          await upsertProfileFromName('vendor', record.vendorName)
          result.inserted.expectedExpenses += 1
        }

        for (const a of bundle.auctions) {
          const record: Auction = {
            ...(a as Auction),
            id: mode === 'replace-year' ? a.id : generateId(),
            yearProfileId: targetYearId,
          }
          if (existingAuctionKeys?.has(auctionKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.auctions.add(record)
          await upsertProfileFromName('person', record.person)
          result.inserted.auctions += 1
        }

        for (const t of bundle.tasks) {
          const record: Task = {
            ...(t as Task),
            id: mode === 'replace-year' ? t.id : generateId(),
            yearProfileId: targetYearId,
          }
          if (existingTaskKeys?.has(taskKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.tasks.add(record)
          result.inserted.tasks += 1
        }

        for (const k of bundle.keyEvents) {
          const record: KeyEvent = {
            ...(k as KeyEvent),
            id: mode === 'replace-year' ? k.id : generateId(),
            yearProfileId: targetYearId,
          }
          if (existingKeyEventKeys?.has(keyEventKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.keyEvents.add(record)
          result.inserted.keyEvents += 1
        }

        for (const p of bundle.poojaAssignments) {
          const record: PoojaAssignment = {
            ...(p as PoojaAssignment),
            id: mode === 'replace-year' ? p.id : generateId(),
            yearProfileId: targetYearId,
          }
          if (existingPoojaAssignmentKeys?.has(poojaAssignmentKey(record))) {
            result.skippedDuplicates += 1
            continue
          }
          await db.poojaAssignments.add(record)
          result.inserted.poojaAssignments += 1
        }
      }
    },
  )

  return result
}
