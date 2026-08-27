export interface FieldChange {
  label: string
  from: string
  to: string
}

/** Compares a fixed list of (label, oldValue, newValue) triples and returns only the ones
 *  that actually changed — used to show "Amount: ₹5,000 → ₹7,000" style edit confirmations
 *  instead of confirming on every save regardless of whether anything meaningful changed. */
export function diffFields(entries: Array<[label: string, from: string, to: string]>): FieldChange[] {
  return entries.filter(([, from, to]) => from !== to).map(([label, from, to]) => ({ label, from, to }))
}
