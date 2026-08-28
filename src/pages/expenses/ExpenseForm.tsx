import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/common/Modal'
import { FormField } from '@/components/common/FormField'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { expenseInputSchema, type ExpenseInput } from '@/lib/validation'
import { todayDateOnly } from '@/lib/date'
import type { Category, Expense, ExpectedExpense } from '@/types'

export interface ExpenseFormValues {
  description: string
  amount: string
  date: string
  categoryId: string
  notes: string
}

export function defaultExpenseFormValues(categories: Category[]): ExpenseFormValues {
  return { description: '', amount: '', date: todayDateOnly(), categoryId: categories[0]?.id ?? '', notes: '' }
}

export function expenseToFormValues(e: Expense | ExpectedExpense, overrideDate?: string): ExpenseFormValues {
  return {
    description: e.description,
    amount: String(e.amount),
    date: overrideDate ?? e.date,
    categoryId: e.categoryId,
    notes: e.notes ?? '',
  }
}

interface ExpenseFormProps {
  title: string
  submitLabel: string
  initialValues: ExpenseFormValues
  categories: Category[]
  onSubmit: (input: ExpenseInput) => Promise<void> | void
  onClose: () => void
}

export function ExpenseForm({ title, submitLabel, initialValues, categories, onSubmit, onClose }: ExpenseFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const { requestClose, confirmDialog } = useCloseGuard(values, initialValues, onClose)
  const activeCategories = categories.filter((c) => c.active || c.id === values.categoryId)

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const parsed = expenseInputSchema.safeParse({
      description: values.description,
      amount: values.amount === '' ? undefined : Number(values.amount),
      date: values.date,
      categoryId: values.categoryId,
      notes: values.notes || undefined,
    })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <Modal
      title={title}
      onClose={requestClose}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={requestClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form="expense-form" className="button button--primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Description" htmlFor="description" required error={errors.description}>
          <input
            id="description"
            type="text"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            autoFocus
          />
        </FormField>
        <div className="form-row">
          <FormField label="Amount (₹)" htmlFor="amount" required error={errors.amount}>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </FormField>
          <FormField label="Date" htmlFor="date" required error={errors.date}>
            <input id="date" type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Category" htmlFor="categoryId" required error={errors.categoryId}>
          <select id="categoryId" value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Notes" htmlFor="notes" error={errors.notes}>
          <textarea id="notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>
      </form>
    </Modal>
    {confirmDialog}
    </>
  )
}
