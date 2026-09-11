import { describe, expect, it } from 'vitest'
import { matchesSearch, sortByKey } from '@/lib/tableUtils'

describe('sortByKey', () => {
  it('sorts numbers ascending and descending', () => {
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }]
    expect(sortByKey(rows, 'n', 'asc').map((r) => r.n)).toEqual([1, 2, 3])
    expect(sortByKey(rows, 'n', 'desc').map((r) => r.n)).toEqual([3, 2, 1])
  })

  it('sorts strings ascending and descending', () => {
    const rows = [{ s: 'banana' }, { s: 'apple' }, { s: 'cherry' }]
    expect(sortByKey(rows, 's', 'asc').map((r) => r.s)).toEqual(['apple', 'banana', 'cherry'])
    expect(sortByKey(rows, 's', 'desc').map((r) => r.s)).toEqual(['cherry', 'banana', 'apple'])
  })

  it('regression: "Newest first" keeps the most-recently-added same-date entry on top, not the oldest', () => {
    // This is the exact bug a user hit: adding a second expense for today used to make it show
    // up SECOND instead of first under "Date (Newest first)". Root cause was sorting ascending
    // (stable, so insertion order preserved among ties) then reversing the WHOLE array for
    // 'desc' — the reverse also flipped the tie order, putting the older same-day entry first.
    const rows = [
      { id: 'first-added', date: '2026-09-11' },
      { id: 'second-added', date: '2026-09-11' },
    ]
    const newestFirst = sortByKey(rows, 'date', 'desc')
    expect(newestFirst.map((r) => r.id)).toEqual(['first-added', 'second-added'])
  })

  it('does not mutate the input array', () => {
    const rows = [{ n: 3 }, { n: 1 }]
    const original = [...rows]
    sortByKey(rows, 'n', 'asc')
    expect(rows).toEqual(original)
  })
})

describe('matchesSearch', () => {
  it('matches case-insensitively across multiple haystacks', () => {
    expect(matchesSearch(['Ramesh', 'Rice'], 'rice')).toBe(true)
    expect(matchesSearch(['Ramesh', 'Rice'], 'RAMESH')).toBe(true)
    expect(matchesSearch(['Ramesh', 'Rice'], 'oil')).toBe(false)
  })

  it('treats an empty/blank query as matching everything', () => {
    expect(matchesSearch(['anything'], '')).toBe(true)
    expect(matchesSearch(['anything'], '   ')).toBe(true)
  })

  it('tolerates undefined haystack entries', () => {
    expect(matchesSearch([undefined, 'Rice'], 'rice')).toBe(true)
    expect(matchesSearch([undefined, undefined], 'rice')).toBe(false)
  })
})
