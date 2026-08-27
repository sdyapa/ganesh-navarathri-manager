import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import { nowIso } from '@/lib/date'
import type { Expense } from '@/types'
import type { ExpenseInput } from '@/lib/validation'

export async function listExpensesForYear(yearProfileId: string): Promise<Expense[]> {
  return db.expenses.where('yearProfileId').equals(yearProfileId).toArray()
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  return db.expenses.get(id)
}

export async function insertExpense(
  yearProfileId: string,
  input: ExpenseInput,
  sourceExpectedExpenseId?: string | null,
): Promise<Expense> {
  const now = nowIso()
  const expense: Expense = {
    id: generateId(),
    yearProfileId,
    description: input.description.trim(),
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    sourceExpectedExpenseId: sourceExpectedExpenseId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await db.expenses.add(expense)
  return expense
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  await db.expenses.update(id, {
    description: input.description.trim(),
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso(),
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id)
}
