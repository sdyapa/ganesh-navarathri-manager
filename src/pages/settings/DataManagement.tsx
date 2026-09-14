import { useRef, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { useToast } from '@/context/ToastContext'
import { useAppSettings } from '@/hooks/useYearData'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Modal } from '@/components/common/Modal'
import { SummaryList } from '@/components/common/SummaryList'
import { exportFullBackup, exportYearBackup, downloadJsonFile, backupFileName } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile, type BackupInspection, type ImportMode } from '@/services/backupImport'
import { chooseLocalBackupDirectory, switchLocalBackupToDownloads } from '@/services/localBackupService'
import { getResetImpact, resetApplication } from '@/services/resetService'
import { seedSampleData } from '@/services/sampleDataService'
import { detectOwnRepo, fetchBackupFromGitHub, listGitHubBackupFiles, type GitHubBackupFile } from '@/lib/githubImport'
import { isDirectoryPickerSupported } from '@/lib/localBackup'
import { updateLocalBackupEnabled } from '@/db/repositories/settings'
import { formatTimestamp } from '@/lib/date'
import { pluralize } from '@/lib/pluralize'

export function DataManagement() {
  const { years, currentYear, setCurrentYearId } = useYearContext()
  const { showToast } = useToast()
  const appSettings = useAppSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localBackupBusy, setLocalBackupBusy] = useState(false)

  const [specificYearId, setSpecificYearId] = useState(currentYear?.id ?? '')
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('add-new')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [githubFetchBusy, setGithubFetchBusy] = useState(false)
  const detectedRepo = useRef(detectOwnRepo()).current
  const [githubOwner, setGithubOwner] = useState(detectedRepo?.owner ?? '')
  const [githubRepo, setGithubRepo] = useState(detectedRepo?.repo ?? '')
  const [githubBranch, setGithubBranch] = useState('master')
  const [githubFiles, setGithubFiles] = useState<GitHubBackupFile[] | null>(null)
  const [githubBrowseBusy, setGithubBrowseBusy] = useState(false)
  const [githubBrowseError, setGithubBrowseError] = useState<string | null>(null)

  const [showSampleConfirm, setShowSampleConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetImpact, setResetImpact] = useState<Awaited<ReturnType<typeof getResetImpact>> | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleExportCurrent() {
    if (!currentYear) return
    const backup = await exportYearBackup(currentYear.id)
    downloadJsonFile(backup, backupFileName(backup))
    showToast('Current year exported')
  }

  async function handleExportSpecific() {
    if (!specificYearId) return
    const backup = await exportYearBackup(specificYearId)
    downloadJsonFile(backup, backupFileName(backup))
    showToast('Year exported')
  }

  async function handleExportFull() {
    const backup = await exportFullBackup()
    downloadJsonFile(backup, backupFileName(backup))
    showToast('Full database exported')
  }

  async function handleToggleLocalBackup(enabled: boolean) {
    await updateLocalBackupEnabled(enabled)
    showToast(enabled ? 'Automatic backup on launch enabled' : 'Automatic backup on launch disabled', 'info')
  }

  async function handleChooseLocalBackupDirectory() {
    setLocalBackupBusy(true)
    try {
      const name = await chooseLocalBackupDirectory()
      if (name) showToast(`Backups will now save to "${name}"`)
    } finally {
      setLocalBackupBusy(false)
    }
  }

  async function handleUseDownloadsForLocalBackup() {
    setLocalBackupBusy(true)
    try {
      await switchLocalBackupToDownloads()
      showToast('Backups will now save to your Downloads folder', 'info')
    } finally {
      setLocalBackupBusy(false)
    }
  }

  async function inspectAndStage(parsed: unknown) {
    const result = await inspectBackupFile(parsed)
    if (!result.valid) {
      setImportError(result.error)
      setInspection(null)
    } else {
      setImportError(null)
      setInspection(result)
      setImportMode('add-new')
    }
  }

  function handleFileChosen(file: File) {
    setImportError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await inspectAndStage(JSON.parse(String(reader.result)))
      } catch {
        setImportError('This file is not valid JSON and could not be read as a backup.')
        setInspection(null)
      }
    }
    reader.onerror = () => setImportError('Could not read the selected file.')
    reader.readAsText(file)
  }

  async function handleImportFromGitHubUrl() {
    if (!githubUrl.trim()) return
    setImportError(null)
    setGithubFetchBusy(true)
    try {
      const result = await fetchBackupFromGitHub(githubUrl)
      if (!result.ok) {
        setImportError(result.error)
        setInspection(null)
        return
      }
      await inspectAndStage(result.data)
    } finally {
      setGithubFetchBusy(false)
    }
  }

  async function handleBrowseGitHub() {
    if (!githubOwner.trim() || !githubRepo.trim()) return
    setGithubBrowseError(null)
    setGithubFiles(null)
    setGithubBrowseBusy(true)
    try {
      const files = await listGitHubBackupFiles(githubOwner.trim(), githubRepo.trim(), githubBranch.trim() || 'master')
      setGithubFiles(files)
      if (files.length === 0) setGithubBrowseError('No .json files found under backups/ in that repo/branch.')
    } catch (err) {
      setGithubBrowseError(err instanceof Error ? err.message : 'Could not list files from GitHub.')
    } finally {
      setGithubBrowseBusy(false)
    }
  }

  async function handleImportFromGitHubFile(file: GitHubBackupFile) {
    setImportError(null)
    setGithubFetchBusy(true)
    try {
      const result = await fetchBackupFromGitHub(file.downloadUrl)
      if (!result.ok) {
        setImportError(result.error)
        setInspection(null)
        return
      }
      await inspectAndStage(result.data)
    } finally {
      setGithubFetchBusy(false)
    }
  }

  async function handleConfirmImport() {
    if (!inspection?.valid) return
    setImportBusy(true)
    try {
      const result = await applyBackupImport(inspection.backup, importMode)
      setInspection(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      const total =
        result.inserted.donations +
        result.inserted.expenses +
        result.inserted.expectedDonations +
        result.inserted.expectedExpenses +
        result.inserted.auctions +
        result.inserted.tasks +
        result.inserted.keyEvents +
        result.inserted.poojaAssignments
      showToast(
        `Import complete: ${pluralize(total, 'record')} added${result.skippedDuplicates ? `, ${pluralize(result.skippedDuplicates, 'duplicate')} skipped` : ''}.`,
      )
    } catch {
      showToast('Import failed. No changes were made — please check the backup file.', 'error')
    } finally {
      setImportBusy(false)
    }
  }

  async function handleSeedSample() {
    setBusy(true)
    try {
      const { yearsCreated, yearsReused } = await seedSampleData()
      const parts: string[] = []
      if (yearsCreated.length) parts.push(`created ${yearsCreated.join(', ')}`)
      if (yearsReused.length) parts.push(`added sample records into existing ${yearsReused.join(', ')}`)
      showToast(`Sample data ready — ${parts.join('; ')}.`)
      setShowSampleConfirm(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load sample data.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openResetConfirm() {
    setResetImpact(await getResetImpact())
    setShowResetConfirm(true)
  }

  async function handleReset() {
    setBusy(true)
    try {
      const profiles = await resetApplication()
      setShowResetConfirm(false)
      if (profiles[0]) setCurrentYearId(profiles[0].id)
      showToast('Application has been reset to a clean state', 'info')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      <h2>Data Management</h2>

      {appSettings && (
        <div className="settings-subsection">
          <h3>Local Backup on Launch</h3>
          <p className="page__note">
            When enabled, a full-database backup is saved automatically every time the app opens — no need to
            remember to export manually.
          </p>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={appSettings.localBackup.enabled}
              onChange={(e) => handleToggleLocalBackup(e.target.checked)}
            />
            Automatically back up on every launch
          </label>

          {isDirectoryPickerSupported() ? (
            <div className="settings-section__actions">
              <p className="page__note">
                Currently saving to:{' '}
                <strong>
                  {appSettings.localBackup.destination === 'directory' && appSettings.localBackup.directoryName
                    ? appSettings.localBackup.directoryName
                    : 'Downloads folder'}
                </strong>
              </p>
              <button type="button" className="button button--secondary" onClick={handleChooseLocalBackupDirectory} disabled={localBackupBusy}>
                {appSettings.localBackup.destination === 'directory' ? 'Change folder…' : 'Choose a folder…'}
              </button>
              {appSettings.localBackup.destination === 'directory' && (
                <button type="button" className="button button--ghost" onClick={handleUseDownloadsForLocalBackup} disabled={localBackupBusy}>
                  Use Downloads instead
                </button>
              )}
            </div>
          ) : (
            <p className="page__note">
              Your browser can only save automatic backups to the default Downloads folder — picking a custom folder
              isn't supported here.
            </p>
          )}

          <p className="page__note">
            {appSettings.localBackup.lastLocalBackupAt
              ? `Last automatic backup: ${formatTimestamp(appSettings.localBackup.lastLocalBackupAt)}`
              : 'Not yet backed up automatically.'}
          </p>
        </div>
      )}

      <div className="settings-subsection">
        <h3>Export</h3>
        <div className="settings-section__actions">
          <button type="button" className="button button--secondary" onClick={handleExportCurrent} disabled={!currentYear}>
            Export Current Year
          </button>
        </div>
        <div className="inline-form">
          <select value={specificYearId} onChange={(e) => setSpecificYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <button type="button" className="button button--secondary" onClick={handleExportSpecific}>
            Export Selected Year
          </button>
        </div>
        <div className="settings-section__actions">
          <button type="button" className="button button--secondary" onClick={handleExportFull}>
            Export Entire Database
          </button>
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Import</h3>
        <p className="page__note">
          Backups are automatically detected as a single year or a full database — you don't need to specify which.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
        />

        {importError && (
          <p className="form-field__error" role="alert">
            {importError}
          </p>
        )}
      </div>

      <div className="settings-subsection">
        <h3>Import from GitHub</h3>
        <p className="page__note">
          Browse the backups already committed to a public GitHub repo (e.g. this app's own <code>backups/</code>
          archive) and pick one to import — no need to download and re-upload it, which is especially handy on a
          phone.
        </p>
        <div className="inline-form">
          <input
            type="text"
            placeholder="owner"
            value={githubOwner}
            onChange={(e) => setGithubOwner(e.target.value)}
            aria-label="GitHub owner"
          />
          <input
            type="text"
            placeholder="repo"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            aria-label="GitHub repository"
          />
          <input
            type="text"
            placeholder="branch"
            value={githubBranch}
            onChange={(e) => setGithubBranch(e.target.value)}
            aria-label="Branch"
          />
          <button type="button" className="button button--secondary" onClick={handleBrowseGitHub} disabled={githubBrowseBusy || !githubOwner.trim() || !githubRepo.trim()}>
            {githubBrowseBusy ? 'Loading…' : 'Browse backups/'}
          </button>
        </div>
        {detectedRepo && (
          <p className="page__note">
            Detected this deployment's own repo (<code>{detectedRepo.owner}/{detectedRepo.repo}</code>) automatically
            — change the fields above only to browse a different repo.
          </p>
        )}

        {githubBrowseError && (
          <p className="form-field__error" role="alert">
            {githubBrowseError}
          </p>
        )}

        {githubFiles && githubFiles.length > 0 && (
          <ul className="manage-list">
            {githubFiles.map((f) => (
              <li key={f.path} className="manage-list__item">
                <span className="manage-list__label">
                  {f.path}
                  <span className="text-muted"> — {(f.size / 1024).toFixed(1)} KB</span>
                </span>
                <button type="button" className="link-button" onClick={() => handleImportFromGitHubFile(f)} disabled={githubFetchBusy}>
                  {githubFetchBusy ? 'Fetching…' : 'Import…'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary>Or paste a direct file link instead</summary>
          <div className="inline-form" style={{ marginTop: 'var(--space-2)' }}>
            <input
              type="url"
              className="input--grow"
              placeholder="https://github.com/<owner>/<repo>/blob/master/backups/2026/…json"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImportFromGitHubUrl()}
            />
            <button type="button" className="button button--secondary" onClick={handleImportFromGitHubUrl} disabled={githubFetchBusy || !githubUrl.trim()}>
              {githubFetchBusy ? 'Fetching…' : 'Fetch & Import'}
            </button>
          </div>
        </details>
      </div>

      <div className="settings-subsection">
        <h3>Sample Data</h3>
        <p className="page__note">
          Populate the app with realistic demo donations, expenses, and auctions across two sample years — useful for
          exploring features. This adds real records to your database; use Reset App afterwards if you want to remove
          them.
        </p>
        <button type="button" className="button button--ghost" onClick={() => setShowSampleConfirm(true)}>
          Load Sample Data
        </button>
      </div>

      <div className="settings-subsection settings-subsection--danger">
        <h3>Reset Application</h3>
        <p className="page__note">
          Permanently deletes every year, donation, expense, auction, and setting, then starts fresh with default
          categories and units. This cannot be undone.
        </p>
        <button type="button" className="button button--danger" onClick={openResetConfirm}>
          Reset App
        </button>
      </div>

      {inspection?.valid && (
        <Modal
          title="Backup Detected"
          onClose={() => setInspection(null)}
          footer={
            <>
              <button type="button" className="button button--ghost" onClick={() => setInspection(null)} disabled={importBusy}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleConfirmImport} disabled={importBusy}>
                {importBusy ? 'Importing…' : 'Import'}
              </button>
            </>
          }
        >
          <SummaryList
            rows={[
              { label: 'Type', value: inspection.summary.exportType === 'full' ? 'Full Database' : 'Single Year' },
              { label: 'App Version', value: inspection.summary.appVersion ?? 'Unknown' },
              { label: 'Years', value: inspection.summary.years.map((y) => y.year).join(', ') },
              { label: 'Donations', value: String(inspection.summary.totals.donations) },
              { label: 'Expected Donations', value: String(inspection.summary.totals.expectedDonations) },
              { label: 'Expenses', value: String(inspection.summary.totals.expenses) },
              { label: 'Expected Expenses', value: String(inspection.summary.totals.expectedExpenses) },
              { label: 'Auctions', value: String(inspection.summary.totals.auctions) },
              { label: 'Tasks', value: String(inspection.summary.totals.tasks) },
              { label: 'Key Events', value: String(inspection.summary.totals.keyEvents) },
              { label: 'Pooja Roster Entries', value: String(inspection.summary.totals.poojaAssignments) },
              { label: 'Inventory Items', value: String(inspection.summary.totals.inventoryItems) },
              { label: 'Categories Included', value: String(inspection.summary.categoryCount) },
              { label: 'Units Included', value: String(inspection.summary.unitCount) },
              { label: 'People/Vendors Included', value: String(inspection.summary.profileCount) },
            ]}
          />

          <fieldset className="import-mode-fieldset">
            <legend>Choose how to apply this backup</legend>
            <label className="import-mode-option">
              <input type="radio" name="import-mode" checked={importMode === 'add-new'} onChange={() => setImportMode('add-new')} />
              <span>
                <strong>Add as new data</strong> — inserts every record. If a year already exists locally, records are
                added into it (duplicates possible).
              </span>
            </label>
            <label className="import-mode-option">
              <input type="radio" name="import-mode" checked={importMode === 'skip-duplicates'} onChange={() => setImportMode('skip-duplicates')} />
              <span>
                <strong>Add, but skip duplicates</strong> — same as above, but records that look identical to an
                existing one are skipped.
              </span>
            </label>
            {inspection.summary.exportType === 'single-year' && (
              <label className="import-mode-option">
                <input type="radio" name="import-mode" checked={importMode === 'replace-year'} onChange={() => setImportMode('replace-year')} />
                <span>
                  <strong>Replace selected year</strong> — deletes all existing records for that year number and
                  replaces them with the backup's data.
                </span>
              </label>
            )}
            <label className="import-mode-option">
              <input type="radio" name="import-mode" checked={importMode === 'replace-all'} onChange={() => setImportMode('replace-all')} />
              <span>
                <strong>Replace entire database</strong> — deletes ALL existing years, records, and settings, then
                restores exactly what's in this backup.
              </span>
            </label>
          </fieldset>
          {(importMode === 'replace-year' || importMode === 'replace-all') && (
            <p className="form-field__error" role="alert">
              This will permanently delete existing data as described above. This cannot be undone.
            </p>
          )}
        </Modal>
      )}

      {showSampleConfirm && (
        <ConfirmDialog
          title="Load Sample Data?"
          description="This adds realistic demo donations, expenses, and auctions for the current year and the previous year. A year that doesn't exist yet is created fresh; a year that already exists (e.g. the current year, which always exists by default) has the sample records added into it — but only if it's still empty, so real data is never mixed with fake data."
          confirmLabel="Load Sample Data"
          onConfirm={handleSeedSample}
          onCancel={() => setShowSampleConfirm(false)}
          busy={busy}
        />
      )}

      {showResetConfirm && resetImpact && (
        <ConfirmDialog
          title="Reset Application?"
          description="Everything below will be permanently deleted. This cannot be undone."
          summary={
            <SummaryList
              rows={[
                { label: 'Years', value: String(resetImpact.years) },
                { label: 'Donations', value: String(resetImpact.donations) },
                { label: 'Expected Donations', value: String(resetImpact.expectedDonations) },
                { label: 'Expenses', value: String(resetImpact.expenses) },
                { label: 'Expected Expenses', value: String(resetImpact.expectedExpenses) },
                { label: 'Auctions', value: String(resetImpact.auctions) },
                { label: 'Tasks', value: String(resetImpact.tasks) },
                { label: 'Key Events', value: String(resetImpact.keyEvents) },
                { label: 'Pooja Roster Entries', value: String(resetImpact.poojaAssignments) },
                { label: 'Inventory Items', value: String(resetImpact.inventoryItems) },
              ]}
            />
          }
          confirmLabel="Reset Everything"
          danger
          requireTypedConfirmation="RESET"
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
          busy={busy}
        />
      )}
    </div>
  )
}
