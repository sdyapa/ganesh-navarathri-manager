import { useCallback } from 'react'
import { useAppSettings, useCategories, useUnits } from '@/hooks/useYearData'
import { useYearContext } from '@/context/YearContext'
import { buildWhatsAppContext, renderWhatsAppTemplate } from '@/lib/whatsapp'
import { copyToClipboard } from '@/lib/clipboard'
import { useToast } from '@/context/ToastContext'
import type { Donation } from '@/types'

export function useWhatsAppShare() {
  const settings = useAppSettings()
  const categories = useCategories('donation')
  const units = useUnits()
  const { currentYear } = useYearContext()
  const { showToast } = useToast()

  const buildMessage = useCallback(
    (donation: Pick<Donation, 'donorName' | 'type' | 'amount' | 'commodityName' | 'quantity' | 'date' | 'notes' | 'categoryId' | 'unitId'>) => {
      const template = donation.type === 'monetary' ? settings?.whatsappTemplates.monetary : settings?.whatsappTemplates.commodity
      if (!template) return ''
      const categoryName = categories?.find((c) => c.id === donation.categoryId)?.name ?? 'Uncategorized'
      const unitName = donation.unitId ? units?.find((u) => u.id === donation.unitId)?.name : undefined
      const ctx = buildWhatsAppContext(donation, categoryName, unitName, currentYear?.year ?? new Date().getFullYear())
      return renderWhatsAppTemplate(template, ctx)
    },
    [settings, categories, units, currentYear],
  )

  const shareDonation = useCallback(
    async (donation: Parameters<typeof buildMessage>[0]) => {
      const message = buildMessage(donation)
      if (!message) {
        showToast('WhatsApp template is not configured yet.', 'error')
        return
      }
      const ok = await copyToClipboard(message)
      showToast(ok ? 'Copied to clipboard' : 'Could not access clipboard — copy manually from Settings.', ok ? 'success' : 'error')
    },
    [buildMessage, showToast],
  )

  return { buildMessage, shareDonation, ready: !!settings && !!categories && !!units }
}
