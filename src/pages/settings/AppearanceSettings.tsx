import { useEffect, useState } from 'react'
import { useAppSettings } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { updateActionDisplayMode, updateDashboardTaskPreviewCount, updateThemePreference } from '@/db/repositories/settings'
import { dashboardTaskPreviewCountSchema } from '@/lib/validation'
import type { ActionDisplayMode, ThemePreference } from '@/types'

const ACTION_DISPLAY_OPTIONS: Array<{ value: ActionDisplayMode; label: string }> = [
  { value: 'icon', label: 'Icon only' },
  { value: 'text', label: 'Text only' },
  { value: 'both', label: 'Icon + Text' },
]

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function AppearanceSettings() {
  const settings = useAppSettings()
  const { showToast } = useToast()
  const [taskPreviewInput, setTaskPreviewInput] = useState('')
  const [taskPreviewError, setTaskPreviewError] = useState<string | null>(null)

  // Depends on the field itself, not the whole `settings` object — saving the Row Actions or
  // Theme control above updates this same shared settings document, which would otherwise reset
  // an unsaved, just-typed count back to the saved value (see WhatsAppSettings.tsx for the same
  // class of bug and a longer explanation).
  useEffect(() => {
    if (settings) setTaskPreviewInput(String(settings.dashboardTaskPreviewCount))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.dashboardTaskPreviewCount])

  if (!settings) return null

  async function handleActionDisplayMode(mode: ActionDisplayMode) {
    await updateActionDisplayMode(mode)
    showToast('Action button style updated')
  }

  async function handleTheme(preference: ThemePreference) {
    await updateThemePreference(preference)
    showToast('Theme updated')
  }

  async function handleSaveTaskPreviewCount() {
    const parsed = dashboardTaskPreviewCountSchema.safeParse(Number(taskPreviewInput))
    if (!parsed.success) {
      setTaskPreviewError(parsed.error.issues[0].message)
      return
    }
    setTaskPreviewError(null)
    await updateDashboardTaskPreviewCount(parsed.data)
    showToast('Dashboard "Heads Up" count updated')
  }

  return (
    <div className="settings-section">
      <h2>Appearance</h2>

      <div className="settings-subsection">
        <h3>Row Actions</h3>
        <p className="page__note">
          How buttons like Edit, Delete, and Duplicate render throughout the app.
        </p>
        <div className="segmented-control" role="radiogroup" aria-label="Row action display">
          {ACTION_DISPLAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={settings.actionDisplayMode === opt.value}
              className={`segmented-control__option ${settings.actionDisplayMode === opt.value ? 'segmented-control__option--active' : ''}`}
              onClick={() => handleActionDisplayMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Theme</h3>
        <p className="page__note">
          "System" follows your device or browser's own light/dark setting automatically. PDF and PNG exports always
          render the same way regardless of this setting.
        </p>
        <div className="segmented-control" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={settings.themePreference === opt.value}
              className={`segmented-control__option ${settings.themePreference === opt.value ? 'segmented-control__option--active' : ''}`}
              onClick={() => handleTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Dashboard "Heads Up"</h3>
        <p className="page__note">
          How many upcoming pending tasks show in the Dashboard's "Heads Up" preview. Set to 0 to hide the section
          entirely.
        </p>
        <div className="inline-form">
          <label htmlFor="dashboard-task-preview-count">Show</label>
          <input
            id="dashboard-task-preview-count"
            type="number"
            min="0"
            max="20"
            value={taskPreviewInput}
            onChange={(e) => setTaskPreviewInput(e.target.value)}
            style={{ width: 70 }}
          />
          <span>upcoming task(s)</span>
          <button type="button" className="button button--secondary" onClick={handleSaveTaskPreviewCount}>
            Save
          </button>
        </div>
        {taskPreviewError && (
          <p className="form-field__error" role="alert">
            {taskPreviewError}
          </p>
        )}
      </div>
    </div>
  )
}
