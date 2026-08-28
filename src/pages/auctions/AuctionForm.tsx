import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/common/Modal'
import { FormField } from '@/components/common/FormField'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { auctionInputSchema, type AuctionInput } from '@/lib/validation'
import { todayDateOnly } from '@/lib/date'
import type { Auction } from '@/types'

export interface AuctionFormValues {
  item: string
  person: string
  amount: string
  date: string
  notes: string
}

export function defaultAuctionFormValues(): AuctionFormValues {
  return { item: '', person: '', amount: '', date: todayDateOnly(), notes: '' }
}

export function auctionToFormValues(a: Auction): AuctionFormValues {
  return { item: a.item, person: a.person, amount: String(a.amount), date: a.date, notes: a.notes ?? '' }
}

interface AuctionFormProps {
  title: string
  submitLabel: string
  initialValues: AuctionFormValues
  onSubmit: (input: AuctionInput) => Promise<void> | void
  onClose: () => void
}

export function AuctionForm({ title, submitLabel, initialValues, onSubmit, onClose }: AuctionFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const { requestClose, confirmDialog } = useCloseGuard(values, initialValues, onClose)

  const set = <K extends keyof AuctionFormValues>(key: K, value: AuctionFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const parsed = auctionInputSchema.safeParse({
      item: values.item,
      person: values.person,
      amount: values.amount === '' ? undefined : Number(values.amount),
      date: values.date,
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
          <button type="submit" form="auction-form" className="button button--primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="auction-form" onSubmit={handleSubmit} noValidate>
        <FormField label="Item" htmlFor="item" required error={errors.item}>
          <input id="item" type="text" value={values.item} onChange={(e) => set('item', e.target.value)} autoFocus />
        </FormField>
        <FormField label="Person" htmlFor="person" required error={errors.person}>
          <input id="person" type="text" value={values.person} onChange={(e) => set('person', e.target.value)} />
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
        <FormField label="Notes" htmlFor="notes" error={errors.notes}>
          <textarea id="notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>
      </form>
    </Modal>
    {confirmDialog}
    </>
  )
}
