import { db } from '@/db/db'
import { nowIso } from '@/lib/date'
import { buildDefaultWhatsAppTemplates } from '@/db/defaults'
import type { AppSettings, WhatsAppTemplates } from '@/types'

export async function getAppSettings(): Promise<AppSettings> {
  const existing = await db.appSettings.get('global')
  if (existing) return existing
  const created: AppSettings = {
    id: 'global',
    whatsappTemplates: buildDefaultWhatsAppTemplates(),
    updatedAt: nowIso(),
  }
  await db.appSettings.put(created)
  return created
}

export async function updateWhatsAppTemplates(templates: WhatsAppTemplates): Promise<void> {
  await db.appSettings.put({ id: 'global', whatsappTemplates: templates, updatedAt: nowIso() })
}
