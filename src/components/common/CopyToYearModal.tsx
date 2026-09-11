import { useState } from 'react'
import { Modal } from './Modal'
import { FormField } from './FormField'
import type { YearProfile } from '@/types'

const NEXT_YEAR_VALUE = '__next__'

interface CopyToYearModalProps {
  title: string
  /** e.g. "5 expenses" — shown in the body copy. */
  itemLabel: string
  /** Overrides the default "...as pending Expected records..." body copy — used by callers
   *  (e.g. Tasks) where that wording doesn't apply. */
  description?: string
  sourceYear: YearProfile
  years: YearProfile[]
  busy: boolean
  /** Receives '__next__' (auto-create/resolve next year) or an existing year's id. */
  onConfirm: (targetYearSelection: string) => void
  onClose: () => void
}

/** Target-year picker shared by every "copy forward" action (Donations/Expenses to Expected,
 *  Tasks to a fresh to-do list) — pins a "Next Year" option first (auto-created if it doesn't
 *  exist yet, mirroring the same pattern already used for auction-pledge conversion), and
 *  otherwise lists any other existing year so the user can target something further out if
 *  they've already created it. */
export function CopyToYearModal({ title, itemLabel, description, sourceYear, years, busy, onConfirm, onClose }: CopyToYearModalProps) {
  const nextYearNumber = sourceYear.year + 1
  const existingNextYear = years.find((y) => y.year === nextYearNumber)
  const otherYears = years.filter((y) => y.id !== sourceYear.id && y.id !== existingNextYear?.id).sort((a, b) => a.year - b.year)

  const [targetYearSelection, setTargetYearSelection] = useState(existingNextYear?.id ?? NEXT_YEAR_VALUE)

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={() => onConfirm(targetYearSelection)} disabled={busy}>
            {busy ? 'Copying…' : 'Copy'}
          </button>
        </>
      }
    >
      <p className="page__note">
        {description ??
          `This creates ${itemLabel} as pending Expected records in the target year, using today's amounts as a starting point — you can adjust them there once the real figure is known.`}
      </p>
      <FormField label="Target Year" htmlFor="copy-target-year" required>
        <select id="copy-target-year" value={targetYearSelection} onChange={(e) => setTargetYearSelection(e.target.value)}>
          {!existingNextYear && (
            <option value={NEXT_YEAR_VALUE}>Next Year — Ganesh Navarathri {nextYearNumber} (will be created)</option>
          )}
          {existingNextYear && <option value={existingNextYear.id}>{existingNextYear.name}</option>}
          {otherYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </FormField>
    </Modal>
  )
}

export { NEXT_YEAR_VALUE }
