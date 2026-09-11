import { db } from '@/db/db'
import { nowIso } from '@/lib/date'
import {
  DEFAULT_ACTION_DISPLAY_MODE,
  DEFAULT_DASHBOARD_TASK_PREVIEW_COUNT,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_THEME_PREFERENCE,
  buildDefaultDriveBackupReminder,
  buildDefaultLocalBackupSettings,
  buildDefaultWhatsAppTemplates,
} from '@/db/defaults'
import type { ActionDisplayMode, AppSettings, ThemePreference, WhatsAppTemplates } from '@/types'

/** Backfills fields added after a settings doc was first created — a database created before
 *  a new AppSettings field existed still has an old-shaped record, since Dexie doesn't enforce
 *  a value's shape beyond the primary key. Exported so the raw useLiveQuery hook in
 *  useYearData.ts can apply the same backfill without a second DB round-trip. */
export function withAppSettingsDefaults(settings: AppSettings): AppSettings {
  return {
    ...settings,
    displayName: settings.displayName ?? DEFAULT_DISPLAY_NAME,
    whatsappTemplates: settings.whatsappTemplates ?? buildDefaultWhatsAppTemplates(),
    actionDisplayMode: settings.actionDisplayMode ?? DEFAULT_ACTION_DISPLAY_MODE,
    themePreference: settings.themePreference ?? DEFAULT_THEME_PREFERENCE,
    dashboardTaskPreviewCount: settings.dashboardTaskPreviewCount ?? DEFAULT_DASHBOARD_TASK_PREVIEW_COUNT,
    driveBackupReminder: settings.driveBackupReminder ?? buildDefaultDriveBackupReminder(),
    localBackup: settings.localBackup ?? buildDefaultLocalBackupSettings(),
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  const existing = await db.appSettings.get('global')
  if (existing) return withAppSettingsDefaults(existing)
  const created: AppSettings = {
    id: 'global',
    displayName: DEFAULT_DISPLAY_NAME,
    whatsappTemplates: buildDefaultWhatsAppTemplates(),
    actionDisplayMode: DEFAULT_ACTION_DISPLAY_MODE,
    themePreference: DEFAULT_THEME_PREFERENCE,
    dashboardTaskPreviewCount: DEFAULT_DASHBOARD_TASK_PREVIEW_COUNT,
    driveBackupReminder: buildDefaultDriveBackupReminder(),
    localBackup: buildDefaultLocalBackupSettings(),
    updatedAt: nowIso(),
  }
  await db.appSettings.put(created)
  return created
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, displayName: displayName.trim(), updatedAt: nowIso() })
}

export async function updateActionDisplayMode(mode: ActionDisplayMode): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, actionDisplayMode: mode, updatedAt: nowIso() })
}

export async function updateThemePreference(preference: ThemePreference): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, themePreference: preference, updatedAt: nowIso() })
}

export async function updateDashboardTaskPreviewCount(count: number): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, dashboardTaskPreviewCount: count, updatedAt: nowIso() })
}

export async function updateWhatsAppTemplates(templates: WhatsAppTemplates): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, whatsappTemplates: templates, updatedAt: nowIso() })
}

export async function updateDriveReminderIntervalDays(intervalDays: number): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({
    ...current,
    driveBackupReminder: { ...current.driveBackupReminder, intervalDays },
    updatedAt: nowIso(),
  })
}

/** Called after every successful Google Drive backup upload so the reminder can reset its clock. */
export async function recordDriveBackupCompleted(): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({
    ...current,
    driveBackupReminder: { ...current.driveBackupReminder, lastBackupAt: nowIso() },
    updatedAt: nowIso(),
  })
}

export async function updateLocalBackupEnabled(enabled: boolean): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({ ...current, localBackup: { ...current.localBackup, enabled }, updatedAt: nowIso() })
}

/** Called after every successful on-launch local backup write, whichever destination it landed
 *  in — see services/localBackupService.ts. */
export async function recordLocalBackupCompleted(): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({
    ...current,
    localBackup: { ...current.localBackup, lastLocalBackupAt: nowIso() },
    updatedAt: nowIso(),
  })
}

/** Sets destination + directoryName together — picking a folder flips destination to
 *  'directory'; passing null (folder cleared, or "Use Downloads instead") flips it back. The
 *  actual FileSystemDirectoryHandle lives in its own table (localBackupHandle.ts), not here. */
export async function setLocalBackupDirectory(name: string | null): Promise<void> {
  const current = await getAppSettings()
  await db.appSettings.put({
    ...current,
    localBackup: { ...current.localBackup, destination: name ? 'directory' : 'downloads', directoryName: name },
    updatedAt: nowIso(),
  })
}
