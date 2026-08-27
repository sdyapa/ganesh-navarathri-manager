import { useEffect, useMemo, useState } from 'react'

export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [totalPages, page])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  return {
    page,
    totalPages,
    pageItems,
    setPage,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    next: () => setPage((p) => Math.min(totalPages, p + 1)),
    prev: () => setPage((p) => Math.max(1, p - 1)),
  }
}
