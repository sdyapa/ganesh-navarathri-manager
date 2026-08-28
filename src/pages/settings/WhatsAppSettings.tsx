import { useEffect, useState } from 'react'
import { useAppSettings } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { updateWhatsAppTemplates } from '@/db/repositories/settings'
import { whatsappTemplatesSchema } from '@/lib/validation'
import {
  DEFAULT_COMMODITY_TEMPLATE,
  DEFAULT_MONETARY_TEMPLATE,
  WHATSAPP_PLACEHOLDERS,
  renderWhatsAppTemplate,
} from '@/lib/whatsapp'

const SAMPLE_CONTEXT_MONETARY = {
  donorName: 'Ramesh',
  donationType: 'Monetary' as const,
  amount: 5000,
  date: '2026-08-27',
  category: 'Chanda',
  notes: 'Sample note',
  year: 2026,
}
const SAMPLE_CONTEXT_COMMODITY = {
  donorName: 'Lakshmi',
  donationType: 'Commodity' as const,
  commodityName: 'Rice',
  quantity: 50,
  unit: 'kg',
  date: '2026-08-27',
  category: 'Annadanam',
  notes: 'Sample note',
  year: 2026,
}

export function WhatsAppSettings() {
  const settings = useAppSettings()
  const { showToast } = useToast()
  const [monetary, setMonetary] = useState('')
  const [commodity, setCommodity] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Deliberately depends on the two template strings themselves, NOT the whole `settings`
  // object. AppSettings is one shared document (templates + the Drive backup reminder state),
  // so `settings` gets a new reference on every write to either — including a backup
  // completing from the reminder banner, which is visible on this very page. Depending on the
  // object would silently discard an unsaved in-progress edit whenever that happened.
  useEffect(() => {
    if (settings) {
      setMonetary(settings.whatsappTemplates.monetary)
      setCommodity(settings.whatsappTemplates.commodity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.whatsappTemplates.monetary, settings?.whatsappTemplates.commodity])

  if (!settings) return null

  async function handleSave() {
    const parsed = whatsappTemplatesSchema.safeParse({ monetary, commodity })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setErrors(errs)
      return
    }
    setErrors({})
    await updateWhatsAppTemplates(parsed.data)
    showToast('WhatsApp templates saved')
  }

  function handleReset() {
    setMonetary(DEFAULT_MONETARY_TEMPLATE)
    setCommodity(DEFAULT_COMMODITY_TEMPLATE)
  }

  return (
    <div className="settings-section">
      <h2>WhatsApp Message Templates</h2>
      <p className="page__note">
        Available placeholders: {WHATSAPP_PLACEHOLDERS.map((p) => `{{${p}}}`).join(', ')}
      </p>

      <div className="whatsapp-editor-grid">
        <div>
          <h3>Monetary Donation Template</h3>
          <textarea rows={9} value={monetary} onChange={(e) => setMonetary(e.target.value)} />
          {errors.monetary && (
            <p className="form-field__error" role="alert">
              {errors.monetary}
            </p>
          )}
          <h4>Preview</h4>
          <pre className="whatsapp-preview">{renderWhatsAppTemplate(monetary, SAMPLE_CONTEXT_MONETARY)}</pre>
        </div>
        <div>
          <h3>Commodity Donation Template</h3>
          <textarea rows={9} value={commodity} onChange={(e) => setCommodity(e.target.value)} />
          {errors.commodity && (
            <p className="form-field__error" role="alert">
              {errors.commodity}
            </p>
          )}
          <h4>Preview</h4>
          <pre className="whatsapp-preview">{renderWhatsAppTemplate(commodity, SAMPLE_CONTEXT_COMMODITY)}</pre>
        </div>
      </div>

      <div className="settings-section__actions">
        <button type="button" className="button button--ghost" onClick={handleReset}>
          Reset to Default
        </button>
        <button type="button" className="button button--primary" onClick={handleSave}>
          Save Templates
        </button>
      </div>
    </div>
  )
}
