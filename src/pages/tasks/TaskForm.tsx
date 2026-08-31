import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/common/Modal'
import { FormField } from '@/components/common/FormField'
import { useCloseGuard } from '@/hooks/useCloseGuard'
import { taskInputSchema, type TaskInput } from '@/lib/validation'
import { todayDateOnly } from '@/lib/date'
import type { Task } from '@/types'

export interface TaskFormValues {
  title: string
  dueDate: string
  notes: string
  /** One item per line — only shown/used when creating a task; editing a task never touches
   *  its checklist (that's managed item-by-item from the task card). */
  checklistText: string
}

export function defaultTaskFormValues(): TaskFormValues {
  return { title: '', dueDate: todayDateOnly(), notes: '', checklistText: '' }
}

export function taskToFormValues(t: Task): TaskFormValues {
  return { title: t.title, dueDate: t.dueDate, notes: t.notes ?? '', checklistText: '' }
}

interface TaskFormProps {
  title: string
  submitLabel: string
  initialValues: TaskFormValues
  /** Shows the "Checklist items" textarea — only for Add, never for Edit. */
  showChecklistInput?: boolean
  onSubmit: (input: TaskInput) => Promise<void> | void
  onClose: () => void
}

export function TaskForm({ title, submitLabel, initialValues, showChecklistInput, onSubmit, onClose }: TaskFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const { requestClose, confirmDialog } = useCloseGuard(values, initialValues, onClose)

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const parsed = taskInputSchema.safeParse({
      title: values.title,
      dueDate: values.dueDate,
      notes: values.notes || undefined,
      checklistItems: showChecklistInput
        ? values.checklistText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
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
            <button type="submit" form="task-form" className="button button--primary" disabled={submitting}>
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </>
        }
      >
        <form id="task-form" onSubmit={handleSubmit} noValidate>
          <FormField label="Title" htmlFor="title" required error={errors.title}>
            <input id="title" type="text" value={values.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          </FormField>
          <FormField label="Due Date" htmlFor="dueDate" required error={errors.dueDate}>
            <input id="dueDate" type="date" value={values.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </FormField>
          <FormField label="Notes" htmlFor="notes" error={errors.notes}>
            <textarea id="notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
          </FormField>
          {showChecklistInput && (
            <FormField
              label="Checklist Items"
              htmlFor="checklistText"
              hint="Optional — one item per line, e.g. a 'Pooja items list'. More can be added later from the task itself."
            >
              <textarea
                id="checklistText"
                rows={4}
                value={values.checklistText}
                onChange={(e) => set('checklistText', e.target.value)}
              />
            </FormField>
          )}
        </form>
      </Modal>
      {confirmDialog}
    </>
  )
}
