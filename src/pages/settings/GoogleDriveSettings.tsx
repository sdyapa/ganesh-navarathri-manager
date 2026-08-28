import { useEffect, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { useToast } from '@/context/ToastContext'
import { useAppSettings } from '@/hooks/useYearData'
import { Modal } from '@/components/common/Modal'
import { SummaryList } from '@/components/common/SummaryList'
import { exportFullBackup, exportYearBackup, backupFileName } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile, type BackupInspection, type ImportMode } from '@/services/backupImport'
import { recordDriveBackupCompleted, updateDriveReminderIntervalDays } from '@/db/repositories/settings'
import { driveReminderIntervalSchema } from '@/lib/validation'
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  downloadBackupFromDrive,
  getConnectedAccountEmail,
  isGoogleDriveConfigured,
  isGoogleDriveConnected,
  listDriveBackups,
  uploadBackupToDrive,
  type DriveBackupFile,
} from '@/lib/googleDrive'
import { formatTimestamp } from '@/lib/date'

export function GoogleDriveSettings() {
  const configured = isGoogleDriveConfigured()
  const { years, currentYear } = useYearContext()
  const { showToast } = useToast()
  const appSettings = useAppSettings()

  const [connected, setConnected] = useState(isGoogleDriveConnected())
  const [connectedEmail, setConnectedEmail] = useState(getConnectedAccountEmail())
  const [busy, setBusy] = useState(false)
  const [backups, setBackups] = useState<DriveBackupFile[] | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<DriveBackupFile | null>(null)
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('add-new')
  const [specificYearId, setSpecificYearId] = useState(currentYear?.id ?? '')
  const [reminderInput, setReminderInput] = useState('')
  const [reminderError, setReminderError] = useState<string | null>(null)

  // Depends on the interval value itself, not the whole `appSettings` object — clicking any
  // of the backup buttons on this page updates `lastBackupAt` in the same shared settings
  // document, which would otherwise reset an unsaved, just-typed interval back to the saved
  // value (see WhatsAppSettings.tsx for the same class of bug and a longer explanation).
  useEffect(() => {
    if (appSettings) setReminderInput(String(appSettings.driveBackupReminder.intervalDays))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings?.driveBackupReminder.intervalDays])

  async function handleSaveReminderInterval() {
    const parsed = driveReminderIntervalSchema.safeParse(Number(reminderInput))
    if (!parsed.success) {
      setReminderError(parsed.error.issues[0].message)
      return
    }
    setReminderError(null)
    await updateDriveReminderIntervalDays(parsed.data)
    showToast('Backup reminder updated')
  }

  async function handleConnect() {
    setBusy(true)
    try {
      await connectGoogleDrive()
      setConnected(true)
      setConnectedEmail(getConnectedAccountEmail())
      showToast('Connected to Google Drive')
      await refreshBackups()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not connect to Google Drive', 'error')
    } finally {
      setBusy(false)
    }
  }

  function handleDisconnect() {
    disconnectGoogleDrive()
    setConnected(false)
    setConnectedEmail(undefined)
    setBackups(null)
    showToast('Disconnected from Google Drive', 'info')
  }

  async function refreshBackups() {
    setBusy(true)
    try {
      setBackups(await listDriveBackups())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load backups from Google Drive', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleBackup(kind: 'current' | 'specific' | 'full') {
    setBusy(true)
    try {
      const backup =
        kind === 'full' ? await exportFullBackup() : await exportYearBackup(kind === 'current' ? currentYear!.id : specificYearId)
      await uploadBackupToDrive(backupFileName(backup), JSON.stringify(backup, null, 2))
      await recordDriveBackupCompleted()
      showToast('Backup uploaded to Google Drive')
      await refreshBackups()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup to Google Drive failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleSelectRestore(file: DriveBackupFile) {
    setBusy(true)
    try {
      const content = await downloadBackupFromDrive(file.id)
      const result = await inspectBackupFile(content)
      if (!result.valid) {
        showToast(result.error, 'error')
        return
      }
      setInspection(result)
      setRestoreTarget(file)
      setImportMode('add-new')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read this backup', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmRestore() {
    if (!inspection?.valid) return
    setBusy(true)
    try {
      await applyBackupImport(inspection.backup, importMode)
      showToast('Restore complete')
      setInspection(null)
      setRestoreTarget(null)
    } catch {
      showToast('Restore failed. No changes were made.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      <h2>Google Drive Backup</h2>

      {!configured ? (
        <div className="notice notice--warning">
          <p>
            Google Drive backup is not configured for this deployment. An administrator needs to create a Google
            Cloud OAuth Client ID and add it to the app's build configuration.
          </p>
        </div>
      ) : !connected ? (
        <button type="button" className="button button--primary" onClick={handleConnect} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      ) : (
        <>
          <p className="page__note">
            {connectedEmail ? (
              <>
                Connected as <strong>{connectedEmail}</strong>.
              </>
            ) : (
              'Connected to Google Drive.'
            )}
          </p>
          <div className="settings-section__actions">
            <button type="button" className="button button--secondary" onClick={() => handleBackup('current')} disabled={busy}>
              Backup Current Year
            </button>
            <select value={specificYearId} onChange={(e) => setSpecificYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
            <button type="button" className="button button--secondary" onClick={() => handleBackup('specific')} disabled={busy}>
              Backup Selected Year
            </button>
            <button type="button" className="button button--secondary" onClick={() => handleBackup('full')} disabled={busy}>
              Backup Entire Database
            </button>
            <button type="button" className="button button--ghost" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>

          <div className="settings-subsection">
            <div className="settings-section__header">
              <h3>Available Backups</h3>
              <button type="button" className="link-button" onClick={refreshBackups} disabled={busy}>
                Refresh
              </button>
            </div>
            {!backups ? (
              <p className="text-muted">Click Refresh to load your Drive backups.</p>
            ) : backups.length === 0 ? (
              <p className="text-muted">No backups found in Google Drive yet.</p>
            ) : (
              <ul className="manage-list">
                {backups.map((b) => (
                  <li key={b.id} className="manage-list__item">
                    <span className="manage-list__label">
                      {b.name}
                      <span className="text-muted"> — {formatTimestamp(b.createdTime)}</span>
                    </span>
                    <button type="button" className="link-button" onClick={() => handleSelectRestore(b)} disabled={busy}>
                      Restore…
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {configured && appSettings && (
        <div className="settings-subsection">
          <h3>Backup Reminder</h3>
          <p className="page__note">
            {appSettings.driveBackupReminder.lastBackupAt
              ? `Last backup: ${formatTimestamp(appSettings.driveBackupReminder.lastBackupAt)}`
              : 'You have not backed up to Google Drive yet.'}
          </p>
          <div className="inline-form">
            <label htmlFor="drive-reminder-days">Remind me every</label>
            <input
              id="drive-reminder-days"
              type="number"
              min="1"
              max="365"
              value={reminderInput}
              onChange={(e) => setReminderInput(e.target.value)}
              style={{ width: 70 }}
            />
            <span>day(s)</span>
            <button type="button" className="button button--secondary" onClick={handleSaveReminderInterval}>
              Save
            </button>
          </div>
          {reminderError && (
            <p className="form-field__error" role="alert">
              {reminderError}
            </p>
          )}
        </div>
      )}

      <details className="settings-subsection">
        <summary>Google Cloud setup instructions (for administrators)</summary>
        <ol className="setup-steps">
          <li>Create a project in the Google Cloud Console.</li>
          <li>Enable the "Google Drive API" for that project.</li>
          <li>Configure the OAuth consent screen (External or Internal, as appropriate).</li>
          <li>Create an OAuth 2.0 Client ID of type "Web application".</li>
          <li>
            Under "Authorized JavaScript origins", add your GitHub Pages origin, e.g.{' '}
            <code>https://&lt;username&gt;.github.io</code>.
          </li>
          <li>Copy the generated Client ID.</li>
          <li>
            Set it as the <code>VITE_GOOGLE_CLIENT_ID</code> environment variable when building the app (see README).
          </li>
        </ol>
        <p className="page__note">
          No client secret is ever required or used — this app only uses the public Client ID with Google Identity
          Services' browser token flow, and only requests the narrow "drive.file" scope (access only to files this
          app itself creates) plus a read-only "who am I" scope used solely to show which account is connected.
        </p>
        <div className="notice notice--warning">
          <p>
            <strong>Heads up:</strong> unless you complete Google's app verification process (which requires a
            privacy policy and domain ownership proof), people connecting will see an "unverified app" warning on
            Google's consent screen. This is normal for a self-hosted tool and doesn't affect security — it just
            requires clicking "Advanced" → "Go to (app name), unsafe" to proceed. Verification is a separate,
            optional step for administrators who want that warning removed for their users.
          </p>
        </div>
      </details>

      {inspection?.valid && restoreTarget && (
        <Modal
          title="Restore from Google Drive"
          onClose={() => {
            setInspection(null)
            setRestoreTarget(null)
          }}
          footer={
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setInspection(null)
                  setRestoreTarget(null)
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleConfirmRestore} disabled={busy}>
                {busy ? 'Restoring…' : 'Restore'}
              </button>
            </>
          }
        >
          <SummaryList
            rows={[
              { label: 'File', value: restoreTarget.name },
              { label: 'Backup Date', value: formatTimestamp(restoreTarget.createdTime) },
              { label: 'Type', value: inspection.summary.exportType === 'full' ? 'Full Database' : 'Single Year' },
              { label: 'Years', value: inspection.summary.years.map((y) => y.year).join(', ') },
              { label: 'Donations', value: String(inspection.summary.totals.donations) },
              { label: 'Expenses', value: String(inspection.summary.totals.expenses) },
              { label: 'Auctions', value: String(inspection.summary.totals.auctions) },
            ]}
          />
          <fieldset className="import-mode-fieldset">
            <legend>Choose how to apply this backup</legend>
            <label className="import-mode-option">
              <input type="radio" name="restore-mode" checked={importMode === 'add-new'} onChange={() => setImportMode('add-new')} />
              <span>Add as new data</span>
            </label>
            <label className="import-mode-option">
              <input type="radio" name="restore-mode" checked={importMode === 'skip-duplicates'} onChange={() => setImportMode('skip-duplicates')} />
              <span>Add, but skip duplicates</span>
            </label>
            {inspection.summary.exportType === 'single-year' && (
              <label className="import-mode-option">
                <input type="radio" name="restore-mode" checked={importMode === 'replace-year'} onChange={() => setImportMode('replace-year')} />
                <span>Replace selected year</span>
              </label>
            )}
            <label className="import-mode-option">
              <input type="radio" name="restore-mode" checked={importMode === 'replace-all'} onChange={() => setImportMode('replace-all')} />
              <span>Replace entire database</span>
            </label>
          </fieldset>
        </Modal>
      )}
    </div>
  )
}
