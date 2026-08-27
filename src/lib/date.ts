// Date-only helpers.
//
// Financial records store dates as plain "YYYY-MM-DD" strings, never as Date objects and
// never through UTC-based parsing (`new Date("2026-08-27")` or `date-fns/parseISO`). Both of
// those parse the string as UTC midnight; formatting the result back in a timezone *behind*
// UTC (most of the Americas) then displays the previous day. Every helper below builds Date
// objects only via the (year, monthIndex, day) local-components constructor, which never
// reinterprets the components through a timezone — so 27-Aug-2026 can never become
// 26-Aug-2026 no matter where the browser is.

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value)
  if (!match) return false
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const dt = new Date(year, month - 1, day)
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day
}

function parseParts(dateOnly: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY_RE.exec(dateOnly)
  if (!match) throw new Error(`Invalid date-only value: "${dateOnly}"`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** Local "today" as a date-only string. Never uses toISOString() (which is UTC-based). */
export function todayDateOnly(): string {
  const now = new Date()
  return fromLocalParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function fromLocalParts(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Builds a local-timezone Date for display/comparison purposes only — never serialize this back. */
export function toLocalDate(dateOnly: string): Date {
  const { year, month, day } = parseParts(dateOnly)
  return new Date(year, month - 1, day)
}

/** "27-Aug-2026" */
export function formatDisplayDate(dateOnly: string): string {
  if (!dateOnly || !isValidDateOnly(dateOnly)) return '—'
  const { year, month, day } = parseParts(dateOnly)
  return `${String(day).padStart(2, '0')}-${MONTH_ABBR[month - 1]}-${year}`
}

/** "27 Aug 2026, Thursday" — used in confirmation dialogs for extra clarity. */
export function formatDisplayDateLong(dateOnly: string): string {
  if (!dateOnly || !isValidDateOnly(dateOnly)) return '—'
  const d = toLocalDate(dateOnly)
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'long' })
  return `${formatDisplayDate(dateOnly)} (${weekday})`
}

export function compareDateOnly(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isDateInRange(date: string, from?: string, to?: string): boolean {
  if (from && compareDateOnly(date, from) < 0) return false
  if (to && compareDateOnly(date, to) > 0) return false
  return true
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}
