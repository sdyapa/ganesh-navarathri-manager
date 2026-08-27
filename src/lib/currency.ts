// Currency is always stored as a plain JS number (rupees, with paise as a decimal fraction).
// Formatting to the ₹1,50,000-style Indian grouping happens only at display/export time.

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const inrNumberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number | undefined | null): string {
  const value = Number.isFinite(amount) ? (amount as number) : 0
  return inrFormatter.format(value)
}

export function formatNumber(value: number | undefined | null): string {
  const v = Number.isFinite(value) ? (value as number) : 0
  return inrNumberFormatter.format(v)
}

export function parseAmountInput(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}
