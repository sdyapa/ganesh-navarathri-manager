import { describe, expect, it } from 'vitest'
import { pluralize } from '@/lib/pluralize'

describe('pluralize', () => {
  it('uses the singular form for exactly 1', () => {
    expect(pluralize(1, 'donation')).toBe('1 donation')
  })

  it('uses the default plural (adds "s") for 0 and for 2+', () => {
    expect(pluralize(0, 'donation')).toBe('0 donations')
    expect(pluralize(2, 'donation')).toBe('2 donations')
  })

  it('accepts an explicit irregular plural form', () => {
    expect(pluralize(1, 'entry', 'entries')).toBe('1 entry')
    expect(pluralize(3, 'entry', 'entries')).toBe('3 entries')
  })
})
