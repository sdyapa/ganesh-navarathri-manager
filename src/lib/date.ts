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

/** Shifts a date-only string by whole years, preserving month/day — e.g. "2026-09-20" + 1 ->
 *  "2027-09-20". Used by Task copy-forward (copyForwardService.ts) so a task's due date lands
 *  on the same festival day next year rather than defaulting to today's date, which wouldn't
 *  make sense for a date-driven reminder the way it does for a donation/expense amount. Falls
 *  back to the 28th for a Feb 29 source date landing on a non-leap year, same as native `Date`
 *  arithmetic would via overflow, but explicit here rather than silently rolling into March. */
export function addYears(dateOnly: string, years: number): string {
  const { year, month, day } = parseParts(dateOnly)
  const targetYear = year + years
  const daysInTargetMonth = new Date(targetYear, month, 0).getDate()
  return fromLocalParts(targetYear, month, Math.min(day, daysInTargetMonth))
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

/** "2026-09-11-1743" — local date + 24h time, filename-safe (no colons/spaces). Used for
 *  exported file names (backups, PDF/PNG reports) so exporting more than once in the same day
 *  produces a distinct file each time instead of relying on the browser to silently append
 *  "(1)", "(2)", etc. `iso` is a full timestamp (has an explicit time/offset), not a date-only
 *  string, so parsing it with `new Date()` is safe here — unlike the "YYYY-MM-DD" pitfall this
 *  file's other helpers guard against. */
export function formatFileTimestamp(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${hh}${min}`
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

/** Whole days elapsed between two ISO timestamps (not date-only values — this is for
 *  bookkeeping timestamps like "last backup at", where timezone rounding doesn't matter). */
export function daysBetweenTimestamps(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}
