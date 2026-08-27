interface PaginationProps {
  page: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  onNext: () => void
  onPrev: () => void
}

export function Pagination({ page, totalPages, hasNext, hasPrev, onNext, onPrev }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="pagination">
      <button type="button" className="button button--ghost" onClick={onPrev} disabled={!hasPrev}>
        ← Previous
      </button>
      <span className="pagination__status">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="button button--ghost" onClick={onNext} disabled={!hasNext}>
        Next →
      </button>
    </div>
  )
}
