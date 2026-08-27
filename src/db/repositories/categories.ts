import { db } from '@/db/db'
import { generateId } from '@/lib/id'
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
