import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useCategories, useExpectedExpenses } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SummaryList } from '@/components/common/SummaryList'
import { ExpenseForm, defaultExpenseFormValues, expenseToFormValues } from './ExpenseForm'
import {
  insertExpectedExpense,
  updateExpectedExpense,
  deleteExpectedExpense,
} from '@/db/repositories/expectedExpenses'
import { moveExpectedExpenseToExpense } from '@/services/conversionService'
import { formatCurrency } from '@/lib/currency'
import { formatDisplayDate, todayDateOnly } from '@/lib/date'
import { matchesSearch } from '@/lib/tableUtils'
import type { ExpenseInput } from '@/lib/validation'
import type { ExpectedExpense } from '@/types'

type ModalState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; record: ExpectedExpense }
  | { mode: 'move'; record: ExpectedExpense }

export function ExpectedExpensesPage() {
  const { currentYearId } = useYearContext()
  const records = useExpectedExpenses(currentYearId)
  const categories = useCategories('expense')
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [deleteTarget, setDeleteTarget] = useState<ExpectedExpense | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const filtered = useMemo(() => {
    if (!records) return []
    return records
      .filter((e) => (statusFilter ? e.status === statusFilter : true))
      .filter((e) => matchesSearch([e.description, e.notes], search))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [records, statusFilter, search])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || records === undefined || categories === undefined) {
    return <p className="page-loading">Loading expected expenses…</p>
  }

  async function handleAdd(input: ExpenseInput) {
    await insertExpectedExpense(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Expected expense added')
  }

  async function handleEdit(record: ExpectedExpense, input: ExpenseInput) {
    await updateExpectedExpense(record.id, input)
    setModal({ mode: 'closed' })
    showToast('Expected expense updated')
  }

  async function handleMove(record: ExpectedExpense, input: ExpenseInput) {
    setBusy(true)
    try {
      await moveExpectedExpenseToExpense(record.id, currentYearId!, input)
      setModal({ mode: 'closed' })
      showToast('Moved to actual expenses successfully')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteExpectedExpense(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Expected expense deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  const columns: Array<DataTableColumn<ExpectedExpense>> = [
    { key: 'date', header: 'Expected Date', render: (e) => formatDisplayDate(e.date) },
    { key: 'description', header: 'Description', render: (e) => e.description },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => formatCurrency(e.amount) },
    { key: 'category', header: 'Category', render: (e) => categoryName(e.categoryId) },
    { key: 'status', header: 'Status', render: (e) => (e.status === 'converted' ? <span className="badge badge--success">Moved</span> : <span className="badge">Pending</span>) },
    {
      key: 'actions',
      header: 'Actions',
      render: (e) =>
        e.status === 'pending' ? (
          <div className="row-actions">
            <button type="button" className="link-button" onClick={() => setModal({ mode: 'move', record: e })}>
              Move to Expenses
            </button>
            <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', record: e })}>
              Edit
            </button>
            <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(e)}>
              Delete
            </button>
          </div>
        ) : (
          <span className="text-muted">Already moved</span>
        ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Expected Expenses</h1>
          <p className="page__subtitle">
            <Link to="/expenses">Actual Expenses</Link> · <Link to="/expenses/expected">Expected Expenses</Link>
          </p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Expected Expense
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState
          title="No expected expenses yet"
          description="Plan ahead by tracking expenses you know you'll need to pay."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Expected Expense
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search description, notes…" />
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'converted', label: 'Moved' },
              ]}
            />
          </FilterBar>

          {filtered.length === 0 ? (
            <EmptyState title="No matching records" description="Try adjusting your search or filters." />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={pageItems}
                rowKey={(e) => e.id}
                renderCard={(e) => (
                  <>
                    <div className="record-card__top">
                      <strong>{e.description}</strong>
                      {e.status === 'converted' ? <span className="badge badge--success">Moved</span> : <span className="badge">Pending</span>}
                    </div>
                    <div className="record-card__amount">{formatCurrency(e.amount)}</div>
                    <div className="record-card__meta">
                      Expected {formatDisplayDate(e.date)} · {categoryName(e.categoryId)}
                    </div>
                    {e.status === 'pending' && (
                      <div className="row-actions">
                        <button type="button" className="link-button" onClick={() => setModal({ mode: 'move', record: e })}>
                          Move to Expenses
                        </button>
                        <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', record: e })}>
                          Edit
                        </button>
                        <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(e)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              />
              <Pagination page={page} totalPages={totalPages} hasNext={hasNext} hasPrev={hasPrev} onNext={next} onPrev={prev} />
            </>
          )}
        </>
      )}

      {modal.mode === 'add' && (
        <ExpenseForm
          title="Add Expected Expense"
          submitLabel="Save"
          initialValues={defaultExpenseFormValues(categories)}
          categories={categories}
          onSubmit={handleAdd}
          onClose={() => {
            setModal({ mode: 'closed' })
            searchParams.delete('add')
            setSearchParams(searchParams, { replace: true })
          }}
        />
      )}

      {modal.mode === 'edit' && (
        <ExpenseForm
          title="Edit Expected Expense"
          submitLabel="Save Changes"
          initialValues={expenseToFormValues(modal.record)}
          categories={categories}
          onSubmit={(input) => handleEdit(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'move' && (
        <ExpenseForm
          title="Move to Expenses"
          submitLabel={busy ? 'Moving…' : 'Confirm & Create Expense'}
          initialValues={expenseToFormValues(modal.record, todayDateOnly())}
          categories={categories}
          onSubmit={(input) => handleMove(modal.record, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Expected Expense?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Description', value: deleteTarget.description },
                { label: 'Amount', value: formatCurrency(deleteTarget.amount) },
                { label: 'Expected Date', value: formatDisplayDate(deleteTarget.date) },
                { label: 'Category', value: categoryName(deleteTarget.categoryId) },
              ]}
            />
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={busy}
        />
      )}
    </div>
  )
}
