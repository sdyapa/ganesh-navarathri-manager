import { useId, useState, type FormEvent } from 'react'
import { Modal } from '@/components/common/Modal'
import { FormField } from '@/components/common/FormField'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { useProfiles } from '@/hooks/useYearData'
import { inventoryItemInputSchema, type InventoryItemInput } from '@/lib/validation'
import { todayDateOnly } from '@/lib/date'
import type { InventoryItem } from '@/types'

export interface InventoryFormValues {
  itemName: string
  quantity: string
  keptWith: string
  notes: string
  storedDate: string
}

export function defaultInventoryFormValues(): InventoryFormValues {
  return { itemName: '', quantity: '', keptWith: '', notes: '', storedDate: todayDateOnly() }
}

export function inventoryItemToFormValues(i: InventoryItem, overrideStoredDate?: string): InventoryFormValues {
  return {
    itemName: i.itemName,
    quantity: i.quantity !== undefined ? String(i.quantity) : '',
    keptWith: i.keptWith,
    notes: i.notes ?? '',
    storedDate: overrideStoredDate ?? i.storedDate,
  }
}

interface InventoryFormProps {
  title: string
  submitLabel: string
  initialValues: InventoryFormValues
  onSubmit: (input: InventoryItemInput) => Promise<void> | void
  onClose: () => void
}

export function InventoryForm({ title, submitLabel, initialValues, onSubmit, onClose }: InventoryFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const { requestClose, confirmDialog } = useCloseGuard(values, initialValues, onClose)
  const keptWithProfiles = useProfiles('person')
  const keptWithListId = useId()

  const set = <K extends keyof InventoryFormValues>(key: K, value: InventoryFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const parsed = inventoryItemInputSchema.safeParse({
      itemName: values.itemName,
      quantity: values.quantity === '' ? undefined : Number(values.quantity),
      keptWith: values.keptWith,
      notes: values.notes || undefined,
      storedDate: values.storedDate,
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
            <button type="submit" form="inventory-form" className="button button--primary" disabled={submitting}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </>
        }
      >
        <form id="inventory-form" onSubmit={handleSubmit} noValidate>
          <FormField label="Item Name" htmlFor="itemName" required error={errors.itemName}>
            <input
              id="itemName"
              type="text"
              placeholder="e.g. Speaker, Amplifier, Carpets"
              value={values.itemName}
              onChange={(e) => set('itemName', e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Quantity" htmlFor="quantity" error={errors.quantity} hint="Optional">
            <input
              id="quantity"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={values.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </FormField>
          <FormField label="Kept With" htmlFor="keptWith" required error={errors.keptWith}>
            <input
              id="keptWith"
              type="text"
              list={keptWithListId}
              value={values.keptWith}
              onChange={(e) => set('keptWith', e.target.value)}
            />
            <datalist id={keptWithListId}>
              {keptWithProfiles?.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </FormField>
          <FormField label="Stored Date" htmlFor="storedDate" required error={errors.storedDate}>
            <input id="storedDate" type="date" value={values.storedDate} onChange={(e) => set('storedDate', e.target.value)} />
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
