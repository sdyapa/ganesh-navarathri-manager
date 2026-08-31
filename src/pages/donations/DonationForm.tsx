import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '@/components/common/Modal'
import { FormField } from '@/components/common/FormField'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { useProfiles } from '@/hooks/useYearData'
import { donationInputSchema, type DonationInput } from '@/lib/validation'
import { todayDateOnly } from '@/lib/date'
import type { Category, Donation, DonationType, ExpectedDonation, Unit } from '@/types'

export interface DonationFormValues {
  donorName: string
  type: DonationType
  date: string
  categoryId: string
  notes: string
  amount: string
  commodityName: string
  quantity: string
  unitId: string
}

export function defaultDonationFormValues(categories: Category[], units: Unit[]): DonationFormValues {
  return {
    donorName: '',
    type: 'monetary',
    date: todayDateOnly(),
    categoryId: categories[0]?.id ?? '',
    notes: '',
    amount: '',
    commodityName: '',
    quantity: '',
    unitId: units[0]?.id ?? '',
  }
}

export function donationToFormValues(d: Donation | ExpectedDonation, overrideDate?: string): DonationFormValues {
  return {
    donorName: d.donorName,
    type: d.type,
    date: overrideDate ?? d.date,
    categoryId: d.categoryId,
    notes: d.notes ?? '',
    amount: d.amount !== undefined ? String(d.amount) : '',
    commodityName: d.commodityName ?? '',
    quantity: d.quantity !== undefined ? String(d.quantity) : '',
    unitId: d.unitId ?? '',
  }
}

interface DonationFormProps {
  title: string
  submitLabel: string
  /** Optional context shown above the form fields — e.g. which year a conversion will land
   *  in. Omitted by plain Add/Edit Donation usage. */
  description?: ReactNode
  initialValues: DonationFormValues
  categories: Category[]
  units: Unit[]
  onSubmit: (input: DonationInput) => Promise<void> | void
  onClose: () => void
}

export function DonationForm({ title, submitLabel, description, initialValues, categories, units, onSubmit, onClose }: DonationFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const { requestClose, confirmDialog } = useCloseGuard(values, initialValues, onClose)
  const donorProfiles = useProfiles('person')
  const donorListId = useId()

  const activeCategories = categories.filter((c) => c.active || c.id === values.categoryId)
  const activeUnits = units.filter((u) => u.active || u.id === values.unitId)

  const set = <K extends keyof DonationFormValues>(key: K, value: DonationFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const parsed = donationInputSchema.safeParse({
      donorName: values.donorName,
      type: values.type,
      date: values.date,
      categoryId: values.categoryId,
      notes: values.notes || undefined,
      amount: values.amount === '' ? undefined : Number(values.amount),
      commodityName: values.commodityName || undefined,
      quantity: values.quantity === '' ? undefined : Number(values.quantity),
      unitId: values.unitId || undefined,
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
          <button type="submit" form="donation-form" className="button button--primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id="donation-form" onSubmit={handleSubmit} noValidate>
        {description && <p className="page__note">{description}</p>}
        <FormField label="Donor Name" htmlFor="donorName" required error={errors.donorName}>
          <input
            id="donorName"
            type="text"
            list={donorListId}
            value={values.donorName}
            onChange={(e) => set('donorName', e.target.value)}
            autoFocus
          />
          <datalist id={donorListId}>
            {donorProfiles?.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </FormField>

        <FormField label="Donation Type" htmlFor="type" required>
          <div className="segmented-control" role="radiogroup" aria-label="Donation type">
            {(['monetary', 'commodity'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={values.type === t}
                className={`segmented-control__option ${values.type === t ? 'segmented-control__option--active' : ''}`}
                onClick={() => set('type', t)}
              >
                {t === 'monetary' ? 'Monetary' : 'Commodity'}
              </button>
            ))}
          </div>
        </FormField>

        {values.type === 'monetary' ? (
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
        ) : (
          <>
            <FormField label="Commodity Name" htmlFor="commodityName" required error={errors.commodityName}>
              <input
                id="commodityName"
                type="text"
                placeholder="e.g. Rice"
                value={values.commodityName}
                onChange={(e) => set('commodityName', e.target.value)}
              />
            </FormField>
            <div className="form-row">
              <FormField label="Quantity" htmlFor="quantity" required error={errors.quantity}>
                <input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={values.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                />
              </FormField>
              <FormField label="Unit" htmlFor="unitId" required error={errors.unitId}>
                <select id="unitId" value={values.unitId} onChange={(e) => set('unitId', e.target.value)}>
                  {activeUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </>
        )}

        <div className="form-row">
          <FormField label="Date" htmlFor="date" required error={errors.date}>
            <input id="date" type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />
          </FormField>
          <FormField label="Category" htmlFor="categoryId" required error={errors.categoryId}>
            <select id="categoryId" value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
