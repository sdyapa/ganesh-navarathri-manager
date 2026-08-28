import { useMemo } from 'react'
import { useAppSettings } from '@/hooks/useYearData'
import { isGoogleDriveConfigured } from '@/lib/googleDrive'
import { daysBetweenTimestamps, nowIso } from '@/lib/date'

export interface DriveBackupReminderState {
  /** False until settings have loaded, Drive is configured, and the interval has elapsed. */
  shouldRemind: boolean
  intervalDays: number
  lastBackupAt: string | null
  /** Whole days since the last backup, or null if a backup has never been made. */
  daysSinceLastBackup: number | null
}

/** Drives the "back up to Google Drive" nag banner. Never fires when Drive isn't configured
 *  for this deployment — there's nothing the user could do about a reminder for a feature
 *  that isn't available. */
export function useDriveBackupReminder(): DriveBackupReminderState {
  const settings = useAppSettings()

  return useMemo(() => {
    const fallback: DriveBackupReminderState = {
      shouldRemind: false,
      intervalDays: 1,
      lastBackupAt: null,
      daysSinceLastBackup: null,
    }
    if (!settings || !isGoogleDriveConfigured()) return fallback

    const { intervalDays, lastBackupAt } = settings.driveBackupReminder
    const daysSinceLastBackup = lastBackupAt ? daysBetweenTimestamps(lastBackupAt, nowIso()) : null
    const shouldRemind = daysSinceLastBackup === null || daysSinceLastBackup >= intervalDays

    return { shouldRemind, intervalDays, lastBackupAt, daysSinceLastBackup }
  }, [settings])
}
