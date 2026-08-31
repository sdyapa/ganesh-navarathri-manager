import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import { upsertProfileFromName } from './profiles'
import type { ExpectedExpense } from '@/types'
import type { ExpectedExpenseInput } from '@/lib/validation'

export async function listExpectedExpensesForYear(yearProfileId: string): Promise<ExpectedExpense[]> {
  return db.expectedExpenses.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getExpectedExpense(id: string): Promise<ExpectedExpense | undefined> {
  return db.expectedExpenses.get(id)
}

export async function insertExpectedExpense(
  yearProfileId: string,
  input: ExpectedExpenseInput,
): Promise<ExpectedExpense> {
  const now = nowIso()
  const record: ExpectedExpense = {
    id: generateId(),
    yearProfileId,
    description: input.description.trim(),
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    vendorName: input.vendorName?.trim() || undefined,
    status: 'pending',
    convertedExpenseId: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.expectedExpenses.add(record)
  await upsertProfileFromName('vendor', record.vendorName)
  return record
}

export async function updateExpectedExpense(id: string, input: ExpectedExpenseInput): Promise<void> {
  await db.expectedExpenses.update(id, {
    description: input.description.trim(),
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    vendorName: input.vendorName?.trim() || undefined,
    updatedAt: nowIso(),
  })
  await upsertProfileFromName('vendor', input.vendorName)
}

export async function deleteExpectedExpense(id: string): Promise<void> {
  await db.expectedExpenses.delete(id)
}

export async function markExpectedExpenseConverted(id: string, expenseId: string): Promise<void> {
  await db.expectedExpenses.update(id, {
    status: 'converted',
    convertedExpenseId: expenseId,
    updatedAt: nowIso(),
  })
}
