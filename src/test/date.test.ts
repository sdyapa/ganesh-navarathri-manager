import { describe, expect, it } from 'vitest'
import {
  compareDateOnly,
  formatDisplayDate,
  fromLocalParts,
  isDateInRange,
  isValidDateOnly,
  toLocalDate,
  todayDateOnly,
} from '@/lib/date'

describe('date-only handling (timezone safety)', () => {
  it('formats without shifting the day, regardless of how it is later re-parsed', () => {
    expect(formatDisplayDate('2026-08-27')).toBe('27-Aug-2026')
  })

  it('round-trips through local-components construction without a UTC day shift', () => {
    // This is the exact bug class the spec calls out: new Date("2026-08-27") parses as UTC
    // midnight, which can render as 26-Aug in timezones behind UTC. toLocalDate must never
    // do that — it always builds the Date from explicit (y, m, d) local components.
    const d = toLocalDate('2026-08-27')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August = index 7
    expect(d.getDate()).toBe(27)
  })

  it('fromLocalParts pads single-digit months/days', () => {
    expect(fromLocalParts(2026, 1, 5)).toBe('2026-01-05')
  })

  it('validates well-formed and rejects malformed date-only strings', () => {
    expect(isValidDateOnly('2026-08-27')).toBe(true)
    expect(isValidDateOnly('2026-02-30')).toBe(false) // Feb 30 does not exist
    expect(isValidDateOnly('not-a-date')).toBe(false)
    expect(isValidDateOnly('2026-8-27')).toBe(false) // must be zero-padded
  })

  it('todayDateOnly returns a valid date-only string', () => {
    expect(isValidDateOnly(todayDateOnly())).toBe(true)
  })

  it('compares dates lexicographically (safe because format is fixed-width YYYY-MM-DD)', () => {
    expect(compareDateOnly('2026-08-01', '2026-08-27')).toBeLessThan(0)
    expect(compareDateOnly('2026-08-27', '2026-08-01')).toBeGreaterThan(0)
    expect(compareDateOnly('2026-08-27', '2026-08-27')).toBe(0)
  })

  it('isDateInRange respects open-ended and closed ranges', () => {
    expect(isDateInRange('2026-08-15', '2026-08-01', '2026-08-31')).toBe(true)
    expect(isDateInRange('2026-09-01', '2026-08-01', '2026-08-31')).toBe(false)
    expect(isDateInRange('2026-08-15')).toBe(true)
    expect(isDateInRange('2026-08-15', '2026-08-20')).toBe(false)
  })
})
