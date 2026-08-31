import type { ActionDisplayMode, Category, DriveBackupReminderSettings, ThemePreference, Unit } from '@/types'
import { generateId } from '@/lib/id'
import { DEFAULT_COMMODITY_TEMPLATE, DEFAULT_MONETARY_TEMPLATE } from '@/lib/whatsapp'

export const DEFAULT_DRIVE_REMINDER_INTERVAL_DAYS = 1
export const DEFAULT_DISPLAY_NAME = 'Ganesh Navarathri Manager'
export const DEFAULT_ACTION_DISPLAY_MODE: ActionDisplayMode = 'text'
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

export const DEFAULT_DONATION_CATEGORY_NAMES = ['Chanda', 'Annadanam', 'Auction']
export const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  'Pooja Items',
  'Annadanam',
  'Activities',
  'Initial Setup',
  'Nimajjanam',
]
export const DEFAULT_UNIT_NAMES = ['kg', 'g', 'litre', 'ml', 'packets', 'boxes', 'pieces', 'bags']

export function buildDefaultCategories(): Category[] {
  const donation = DEFAULT_DONATION_CATEGORY_NAMES.map((name, i) => makeCategory('donation', name, i))
  const expense = DEFAULT_EXPENSE_CATEGORY_NAMES.map((name, i) => makeCategory('expense', name, i))
  return [...donation, ...expense]
}

function makeCategory(kind: Category['kind'], name: string, order: number): Category {
  return { id: generateId(), kind, name, active: true, order, isDefault: true }
}

export function buildDefaultUnits(): Unit[] {
  return DEFAULT_UNIT_NAMES.map((name, order) => ({
    id: generateId(),
    name,
    active: true,
    order,
    isDefault: true,
  }))
}

export function buildDefaultWhatsAppTemplates() {
  return { monetary: DEFAULT_MONETARY_TEMPLATE, commodity: DEFAULT_COMMODITY_TEMPLATE }
}

export function buildDefaultDriveBackupReminder(): DriveBackupReminderSettings {
  return { intervalDays: DEFAULT_DRIVE_REMINDER_INTERVAL_DAYS, lastBackupAt: null }
}
