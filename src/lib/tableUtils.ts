export function matchesSearch(haystacks: Array<string | undefined>, query: string): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(q))
}

export type SortDirection = 'asc' | 'desc'

/** Sorts by a single key, tie-broken by each row's own array position so that, e.g., two
 *  expenses added on the same date keep the newer one on top under "Date (Newest first)".
 *
 *  This used to sort ascending and then .reverse() the whole array for 'desc' — Array.sort is
 *  stable, so the ascending pass preserved insertion order among same-date rows, but .reverse()
 *  then inverted that tie order too, putting the OLDER of two same-day entries on top instead
 *  of the newer one. Comparing directly with the sign flipped for 'desc' (instead of sorting
 *  ascending and reversing) keeps insertion order as the tiebreak in both directions. */
export function sortByKey<T>(rows: T[], key: keyof T, direction: SortDirection): T[] {
  const sign = direction === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign
  })
}
