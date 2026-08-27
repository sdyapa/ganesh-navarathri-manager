import { describe, expect, it } from 'vitest'
import { formatCurrency, formatNumber, parseAmountInput } from '@/lib/currency'

describe('currency formatting (en-IN)', () => {
  it('formats amounts using Indian digit grouping', () => {
    expect(formatCurrency(150000)).toBe('₹1,50,000')
    expect(formatCurrency(5000)).toBe('₹5,000')
    expect(formatCurrency(12550000)).toBe('₹1,25,50,000')
  })

  it('treats missing/invalid amounts as ₹0 rather than throwing', () => {
    expect(formatCurrency(undefined)).toBe('₹0')
    expect(formatCurrency(NaN)).toBe('₹0')
  })

  it('formats plain numbers (for quantities) with Indian grouping and no currency symbol', () => {
    expect(formatNumber(1500)).toBe('1,500')
    expect(formatNumber(1.5)).toBe('1.5')
  })

  it('parses user-typed amount strings, stripping currency symbols and separators', () => {
    expect(parseAmountInput('₹1,50,000')).toBe(150000)
    expect(parseAmountInput('5000')).toBe(5000)
    expect(Number.isNaN(parseAmountInput('abc'))).toBe(true)
  })
})
