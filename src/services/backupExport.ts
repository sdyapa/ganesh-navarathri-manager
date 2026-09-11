import { APP_VERSION } from '@/appVersion'
import { BACKUP_SCHEMA_VERSION, APP_NAME } from '@/types'
import type { BackupFile, YearProfileBundle } from '@/types'
import { listDonationsForYear } from '@/db/repositories/donations'
import { listExpectedDonationsForYear } from '@/db/repositories/expectedDonations'
import { listExpensesForYear } from '@/db/repositories/expenses'
import { listExpectedExpensesForYear } from '@/db/repositories/expectedExpenses'
import { listAuctionsForYear } from '@/db/repositories/auctions'
import { getYearProfile, listYearProfiles } from '@/db/repositories/yearProfiles'
import { listCategories } from '@/db/repositories/categories'
import { listUnits } from '@/db/repositories/units'
import { listProfiles } from '@/db/repositories/profiles'
import { listTasksForYear } from '@/db/repositories/tasks'
import { listKeyEventsForYear } from '@/db/repositories/keyEvents'
import { listPoojaAssignmentsForYear } from '@/db/repositories/poojaAssignments'
import { getAppSettings } from '@/db/repositories/settings'
import { nowIso, formatFileTimestamp } from '@/lib/date'

async function buildYearBundle(yearProfileId: string): Promise<YearProfileBundle> {
  const profile = await getYearProfile(yearProfileId)
  if (!profile) throw new Error('Year profile not found')
  const [donations, expectedDonations, expenses, expectedExpenses, auctions, tasks, keyEvents, poojaAssignments] = await Promise.all([
    listDonationsForYear(yearProfileId),
    listExpectedDonationsForYear(yearProfileId),
    listExpensesForYear(yearProfileId),
    listExpectedExpensesForYear(yearProfileId),
    listAuctionsForYear(yearProfileId),
    listTasksForYear(yearProfileId),
    listKeyEventsForYear(yearProfileId),
    listPoojaAssignmentsForYear(yearProfileId),
  ])
  return { profile, donations, expectedDonations, expenses, expectedExpenses, auctions, tasks, keyEvents, poojaAssignments }
}

async function buildSettingsBlock() {
  const [categories, units, profiles, appSettings] = await Promise.all([
    listCategories(),
    listUnits(),
    listProfiles(),
    getAppSettings(),
  ])
  return {
    categories,
    units,
    profiles,
    appSettings: {
      displayName: appSettings.displayName,
      whatsappTemplates: appSettings.whatsappTemplates,
      actionDisplayMode: appSettings.actionDisplayMode,
      themePreference: appSettings.themePreference,
      dashboardTaskPreviewCount: appSettings.dashboardTaskPreviewCount,
      updatedAt: appSettings.updatedAt,
    },
  }
}

export async function exportYearBackup(yearProfileId: string): Promise<BackupFile> {
  const bundle = await buildYearBundle(yearProfileId)
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    backupVersion: BACKUP_SCHEMA_VERSION,
    exportType: 'single-year',
    exportedAt: nowIso(),
    years: [bundle],
    settings: await buildSettingsBlock(),
  }
}

export async function exportFullBackup(): Promise<BackupFile> {
  const profiles = await listYearProfiles()
  const years = await Promise.all(profiles.map((p) => buildYearBundle(p.id)))
  return {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    backupVersion: BACKUP_SCHEMA_VERSION,
    exportType: 'full',
    exportedAt: nowIso(),
    years,
    settings: await buildSettingsBlock(),
  }
}

/** Includes the time (not just the date) so exporting more than once in the same day — e.g.
 *  once mid-season, again after immersion — produces a distinct file each time instead of
 *  silently colliding on name. */
export function backupFileName(backup: BackupFile): string {
  const stamp = formatFileTimestamp(backup.exportedAt)
  if (backup.exportType === 'single-year' && backup.years.length === 1) {
    return `ganesh-navarathri-${backup.years[0].profile.year}-backup-${stamp}.json`
  }
  return `ganesh-navarathri-full-backup-${stamp}.json`
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
