export function matchesSearch(haystacks: Array<string | undefined>, query: string): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return haystacks.some((h) => (h ?? '').toLowerCase().includes(q))
}

export type SortDirection = 'asc' | 'desc'

export function sortByKey<T>(rows: T[], key: keyof T, direction: SortDirection): T[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    return String(av ?? '').localeCompare(String(bv ?? ''))
  })
  if (direction === 'desc') sorted.reverse()
  return sorted
}
