import { useState } from 'react'
import { useDriveBackupReminder } from '@/hooks/useDriveBackupReminder'
import { useToast } from '@/context/ToastContext'
import { backupFileName, downloadJsonFile, exportFullBackup } from '@/services/backupExport'
import { uploadBackupToDrive } from '@/lib/googleDrive'
import { recordDriveBackupCompleted } from '@/db/repositories/settings'

type BackupKind = 'local' | 'drive' | 'both'

/** Nags (dismissibly, once per session) to back up once the configured interval has elapsed,
 *  with one-click actions right on the banner — no need to go find Settings first. Never
 *  renders at all when Drive isn't configured for this deployment, or a backup was made
 *  recently enough. Disappears on its own once a backup succeeds (the reminder clock it reads
 *  is reactive, so there's no separate "mark as done" step needed). */
export function DriveBackupReminderBanner() {
  const { shouldRemind, intervalDays, daysSinceLastBackup } = useDriveBackupReminder()
  const { showToast } = useToast()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState<BackupKind | null>(null)

  if (!shouldRemind || dismissed) return null

  const message =
    daysSinceLastBackup === null
      ? "You haven't backed up yet."
      : `It's been ${daysSinceLastBackup} day${daysSinceLastBackup === 1 ? '' : 's'} since your last backup (reminder set to every ${intervalDays} day${intervalDays === 1 ? '' : 's'}).`

  async function handleBackup(kind: BackupKind) {
    setBusy(kind)
    try {
      const backup = await exportFullBackup()
      if (kind === 'local' || kind === 'both') {
        downloadJsonFile(backup, backupFileName(backup))
      }
      if (kind === 'drive' || kind === 'both') {
        await uploadBackupToDrive(backupFileName(backup), JSON.stringify(backup, null, 2))
      }
      await recordDriveBackupCompleted()
      showToast('Backup complete — entire database backed up')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed. Please try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="backup-reminder-banner" role="status">
      <span>{message}</span>
      <div className="backup-reminder-banner__actions">
        <button type="button" className="button button--secondary" onClick={() => handleBackup('local')} disabled={busy !== null}>
          {busy === 'local' ? 'Backing up…' : 'Back Up Locally'}
        </button>
        <button type="button" className="button button--secondary" onClick={() => handleBackup('drive')} disabled={busy !== null}>
          {busy === 'drive' ? 'Backing up…' : 'Back Up to Drive'}
        </button>
        <button type="button" className="button button--primary" onClick={() => handleBackup('both')} disabled={busy !== null}>
          {busy === 'both' ? 'Backing up…' : 'Back Up Both'}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss reminder"
          onClick={() => setDismissed(true)}
          disabled={busy !== null}
        >
          ×
        </button>
      </div>
    </div>
  )
}
