// Renders the configurable WhatsApp share message. Placeholders are replaced with plain-text
// substitution only (no eval/Function, no template compilation) so a template stored in
// settings — including one that arrived via an imported backup — can never execute code.
import type { Donation } from '@/types'
import { formatCurrency, formatNumber } from './currency'
import { formatDisplayDate } from './date'

export const DEFAULT_MONETARY_TEMPLATE = `🙏 Donation Received 🙏

Name: {{donorName}}
Type: {{donationType}}
Amount: {{amount}}
Category: {{category}}
Date: {{date}}

Thank you for your generous contribution. 🙏`

export const DEFAULT_COMMODITY_TEMPLATE = `🙏 Donation Received 🙏

Name: {{donorName}}
Donation: {{commodityName}}
Quantity: {{quantity}} {{unit}}
Category: {{category}}
Date: {{date}}

Thank you for your generous contribution. 🙏`

export const WHATSAPP_PLACEHOLDERS = [
  'donorName',
  'donationType',
  'amount',
  'commodityName',
  'quantity',
  'unit',
  'date',
  'category',
  'notes',
  'year',
] as const

export interface WhatsAppContext {
  donorName: string
  donationType: 'Monetary' | 'Commodity'
  amount?: number
  commodityName?: string
  quantity?: number
  unit?: string
  date: string
  category: string
  notes?: string
  year: number
}

export function renderWhatsAppTemplate(template: string, ctx: WhatsAppContext): string {
  const values: Record<string, string> = {
    donorName: ctx.donorName || '',
    donationType: ctx.donationType,
    amount: ctx.amount !== undefined ? formatCurrency(ctx.amount) : '',
    commodityName: ctx.commodityName || '',
    quantity: ctx.quantity !== undefined ? formatNumber(ctx.quantity) : '',
    unit: ctx.unit || '',
    date: formatDisplayDate(ctx.date),
    category: ctx.category || '',
    notes: ctx.notes || '',
    year: String(ctx.year),
  }
  return template.replace(/{{\s*(\w+)\s*}}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  )
}

export function buildWhatsAppContext(
  donation: Pick<Donation, 'donorName' | 'type' | 'amount' | 'commodityName' | 'quantity' | 'date' | 'notes'>,
  categoryName: string,
  unitName: string | undefined,
  year: number,
): WhatsAppContext {
  return {
    donorName: donation.donorName,
    donationType: donation.type === 'monetary' ? 'Monetary' : 'Commodity',
    amount: donation.amount,
    commodityName: donation.commodityName,
    quantity: donation.quantity,
    unit: unitName,
    date: donation.date,
    category: categoryName,
    notes: donation.notes,
    year,
  }
}
