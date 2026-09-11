import { describe, expect, it } from 'vitest'
import {
  addYears,
  compareDateOnly,
  daysBetweenTimestamps,
  formatDisplayDate,
  formatFileTimestamp,
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

  it('daysBetweenTimestamps counts whole days elapsed', () => {
    expect(daysBetweenTimestamps('2026-08-20T10:00:00.000Z', '2026-08-27T10:00:00.000Z')).toBe(7)
    expect(daysBetweenTimestamps('2026-08-20T10:00:00.000Z', '2026-08-20T18:00:00.000Z')).toBe(0)
    expect(daysBetweenTimestamps('2026-08-20T10:00:00.000Z', '2026-08-20T10:00:00.000Z')).toBe(0)
  })

  it('formatFileTimestamp produces a filename-safe, zero-padded local date+time with no separators GitHub/OS filenames dislike', () => {
    const d = new Date(2026, 8, 11, 7, 5) // 11-Sep-2026, 07:05 local — month is 0-indexed
    const stamp = formatFileTimestamp(d.toISOString())
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/)
    expect(stamp).not.toContain(':')
  })

  it('formatFileTimestamp produces a distinct value for two exports made minutes apart on the same day', () => {
    const first = formatFileTimestamp(new Date(2026, 8, 11, 9, 0).toISOString())
    const second = formatFileTimestamp(new Date(2026, 8, 11, 9, 30).toISOString())
    expect(first).not.toBe(second)
  })

  it('addYears shifts the year while preserving month and day', () => {
    expect(addYears('2026-09-20', 1)).toBe('2027-09-20')
    expect(addYears('2026-01-05', 3)).toBe('2029-01-05')
  })

  it('addYears clamps Feb 29 to Feb 28 when the target year is not a leap year', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29') // 2028 is also a leap year
  })

  it('addYears supports a zero shift (no-op) and negative shifts', () => {
    expect(addYears('2026-09-20', 0)).toBe('2026-09-20')
    expect(addYears('2027-09-20', -1)).toBe('2026-09-20')
  })
})
