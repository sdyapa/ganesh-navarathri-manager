import { useAppSettings } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { updateActionDisplayMode, updateThemePreference } from '@/db/repositories/settings'
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

  if (!settings) return null

  async function handleActionDisplayMode(mode: ActionDisplayMode) {
    await updateActionDisplayMode(mode)
    showToast('Action button style updated')
  }

  async function handleTheme(preference: ThemePreference) {
    await updateThemePreference(preference)
    showToast('Theme updated')
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
    </div>
  )
}
