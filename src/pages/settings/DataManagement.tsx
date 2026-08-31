import { useRef, useState } from 'react'
import { useYearContext } from '@/context/YearContext'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Modal } from '@/components/common/Modal'
import { SummaryList } from '@/components/common/SummaryList'
import { exportFullBackup, exportYearBackup, downloadJsonFile, backupFileName } from '@/services/backupExport'
import { applyBackupImport, inspectBackupFile, type BackupInspection, type ImportMode } from '@/services/backupImport'
import { getResetImpact, resetApplication } from '@/services/resetService'
import { seedSampleData } from '@/services/sampleDataService'

export function DataManagement() {
  const { years, currentYear, setCurrentYearId } = useYearContext()
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [specificYearId, setSpecificYearId] = useState(currentYear?.id ?? '')
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('add-new')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

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

  function handleFileChosen(file: File) {
    setImportError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const result = await inspectBackupFile(parsed)
        if (!result.valid) {
          setImportError(result.error)
          setInspection(null)
        } else {
          setInspection(result)
          setImportMode('add-new')
        }
      } catch {
        setImportError('This file is not valid JSON and could not be read as a backup.')
        setInspection(null)
      }
    }
    reader.onerror = () => setImportError('Could not read the selected file.')
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (!inspection?.valid) return
    setImportBusy(true)
    try {
      const result = await applyBackupImport(inspection.backup, importMode)
      setInspection(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      const total = result.inserted.donations + result.inserted.expenses + result.inserted.expectedDonations + result.inserted.expectedExpenses + result.inserted.auctions
      showToast(
        `Import complete: ${total} record(s) added${result.skippedDuplicates ? `, ${result.skippedDuplicates} duplicate(s) skipped` : ''}.`,
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
