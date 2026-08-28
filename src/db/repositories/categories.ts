import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { DEFAULT_DONATION_CATEGORY_NAMES, DEFAULT_EXPENSE_CATEGORY_NAMES } from '@/db/defaults'
import type { Category } from '@/types'

export async function listCategories(kind?: Category['kind']): Promise<Category[]> {
  const all = await db.categories.toArray()
  const filtered = kind ? all.filter((c) => c.kind === kind) : all
  return filtered.sort((a, b) => a.order - b.order)
}

export async function insertCategory(kind: Category['kind'], name: string): Promise<Category> {
  const existing = await listCategories(kind)
  const category: Category = {
    id: generateId(),
    kind,
    name: name.trim(),
    active: true,
    order: existing.length,
    isDefault: false,
  }
  await db.categories.add(category)
  return category
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name: name.trim() })
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  await db.categories.update(id, { active })
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(orderedIds.map((id, index) => db.categories.update(id, { order: index })))
  })
}

/** Whether any record anywhere (any year) currently references this category. Used to decide
 *  whether a delete would break historical data — in that case the UI should deactivate
 *  instead, per the "categories must not break historical records" rule. */
export async function isCategoryInUse(id: string): Promise<boolean> {
  const [d, ed, e, ee] = await Promise.all([
    db.donations.where('categoryId').equals(id).count(),
    db.expectedDonations.where('categoryId').equals(id).count(),
    db.expenses.where('categoryId').equals(id).count(),
    db.expectedExpenses.where('categoryId').equals(id).count(),
  ])
  return d + ed + e + ee > 0
}

/** Hard-delete only when unused; otherwise the caller should deactivate instead. */
export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id)
}

/** Re-adds any of the built-in default categories that are missing entirely, and reactivates
 *  any that exist but were deactivated — a lighter-weight recovery than a full app reset if
 *  someone accidentally deletes/deactivates all their categories. Never duplicates a category
 *  that's already present and active. Returns the names actually restored, if any. */
export async function restoreDefaultCategories(kind: Category['kind']): Promise<string[]> {
  const defaultNames = kind === 'donation' ? DEFAULT_DONATION_CATEGORY_NAMES : DEFAULT_EXPENSE_CATEGORY_NAMES
  const existing = await listCategories(kind)
  const restored: string[] = []

  await db.transaction('rw', db.categories, async () => {
    for (const name of defaultNames) {
      const match = existing.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
      if (!match) {
        await db.categories.add({
          id: generateId(),
          kind,
          name,
          active: true,
          order: existing.length + restored.length,
          isDefault: true,
        })
        restored.push(name)
      } else if (!match.active) {
        await db.categories.update(match.id, { active: true })
        restored.push(name)
      }
    }
  })

  return restored
}
