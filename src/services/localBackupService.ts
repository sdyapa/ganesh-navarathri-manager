// Orchestrates the silent, no-click full-database backup that runs once on every app launch
// (see components/layout/LaunchBackupRunner.tsx for where it's triggered) and the "pick a
// backup folder" Settings action. Composes the existing export helpers in backupExport.ts —
// no export logic is duplicated here.
import { exportFullBackup, backupFileName, downloadJsonFile } from '@/services/backupExport'
import { getAppSettings, recordLocalBackupCompleted, setLocalBackupDirectory } from '@/db/repositories/settings'
import {
  getLocalBackupDirectoryHandle,
  saveLocalBackupDirectoryHandle,
  clearLocalBackupDirectoryHandle,
} from '@/db/repositories/localBackupHandle'
import { pickLocalBackupDirectory, writeBackupToDirectory } from '@/lib/localBackup'

/** Runs once per app launch. Writes a full-database backup either into the user's picked
 *  directory (if configured and still granted) or via a plain browser download to Downloads
 *  (every other case: directory support disabled, permission lost, or never configured). Never
 *  throws — a backup that fails for any reason must never block the app from loading. */
export async function runLaunchBackup(): Promise<void> {
  try {
    const settings = await getAppSettings()
    if (!settings.localBackup.enabled) return

    const backup = await exportFullBackup()
    const filename = backupFileName(backup)

    if (settings.localBackup.destination === 'directory') {
      const handle = await getLocalBackupDirectoryHandle()
      if (handle && (await writeBackupToDirectory(handle, filename, JSON.stringify(backup, null, 2)))) {
        await recordLocalBackupCompleted()
        return
      }
      // Handle missing, stale, or permission revoked — fall back to Downloads this one time
      // rather than silently skipping the backup the user asked for on every launch.
    }
    downloadJsonFile(backup, filename)
    await recordLocalBackupCompleted()
  } catch {
    // A background backup must never surface an error to the user or block app boot.
  }
}

/** Opens the native folder picker (Settings → Data Management) and, on success, persists both
 *  the handle and the setting pointing at it. Returns the picked folder's name, or null if the
 *  user cancelled or the browser doesn't support it. */
export async function chooseLocalBackupDirectory(): Promise<string | null> {
  const picked = await pickLocalBackupDirectory()
  if (!picked) return null
  await saveLocalBackupDirectoryHandle(picked.handle)
  await setLocalBackupDirectory(picked.name)
  return picked.name
}

/** Switches local backup back to the Downloads folder and forgets the picked directory. */
export async function switchLocalBackupToDownloads(): Promise<void> {
  await clearLocalBackupDirectoryHandle()
  await setLocalBackupDirectory(null)
}
