import { useEffect, useState } from 'react'
import { useAppSettings } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { updateDisplayName } from '@/db/repositories/settings'
import { displayNameSchema } from '@/lib/validation'
import { DEFAULT_DISPLAY_NAME } from '@/db/defaults'
import { FormField } from '@/components/common/FormField'

export function GeneralSettings() {
  const settings = useAppSettings()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Depends on the field itself, not the whole `settings` object — see WhatsAppSettings.tsx
  // for why (this is the same shared-document class of bug: any other setting saving
  // elsewhere shouldn't reset an unsaved edit here).
  useEffect(() => {
    if (settings) setName(settings.displayName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.displayName])

  if (!settings) return null

  async function handleSave() {
    const parsed = displayNameSchema.safeParse(name)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError(null)
    await updateDisplayName(parsed.data)
    showToast('App name updated')
  }

  function handleReset() {
    setName(DEFAULT_DISPLAY_NAME)
  }

  return (
    <div className="settings-section">
      <h2>General</h2>
      <div className="settings-subsection">
        <h3>App Name</h3>
        <p className="page__note">
          Shown in the sidebar and the mobile header — rename it to your own committee, temple, or mandal name if
          you'd like. Keep it short so it fits alongside the year switcher on a phone screen.
        </p>
        <FormField label="Display Name" htmlFor="display-name" required error={error ?? undefined}>
          <input id="display-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </FormField>
        <div className="settings-section__actions">
          <button type="button" className="button button--ghost" onClick={handleReset}>
            Reset to Default
          </button>
          <button type="button" className="button button--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
