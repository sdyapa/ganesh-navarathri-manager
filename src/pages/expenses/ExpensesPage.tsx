import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SectionTabs } from '@/components/common/SectionTabs'
import { useYearContext } from '@/context/YearContext'
import { useCategories, useExpenses } from '@/hooks/useYearData'
import { usePagination } from '@/hooks/usePagination'
import { useToast } from '@/context/ToastContext'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter, DateRangeFilter } from '@/components/common/Filters'
import { Pagination } from '@/components/common/Pagination'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FieldDiffList } from '@/components/common/FieldDiffList'
import { SummaryList } from '@/components/common/SummaryList'
import { ExportButtons } from '@/components/common/ExportButtons'
import { ExpenseForm, defaultExpenseFormValues, expenseToFormValues } from './ExpenseForm'
import { insertExpense, updateExpense, deleteExpense } from '@/db/repositories/expenses'
import { formatCurrency, formatCurrencyForPdf } from '@/lib/currency'
import { formatDisplayDate, isDateInRange } from '@/lib/date'
import { matchesSearch } from '@/lib/tableUtils'
import { diffFields } from '@/lib/diff'
import { buildPdfReport, pdfFileName } from '@/lib/export/pdf'
import { buildExpensesTable } from '@/lib/export/reportBuilders'
import { exportTableReportAsPng, pngFileName } from '@/lib/export/png'
import { getAppSettings } from '@/db/repositories/settings'
import type { ExpenseInput } from '@/lib/validation'
import type { Expense } from '@/types'

type ModalState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; expense: Expense }

export function ExpensesPage() {
  const { currentYearId, currentYear } = useYearContext()
  const expenses = useExpenses(currentYearId)
  const categories = useCategories('expense')
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [pendingEdit, setPendingEdit] = useState<{ expense: Expense; input: ExpenseInput } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const filtered = useMemo(() => {
    if (!expenses) return []
    return expenses
      .filter((e) => (categoryFilter ? e.categoryId === categoryFilter : true))
      .filter((e) => isDateInRange(e.date, dateFrom || undefined, dateTo || undefined))
      .filter((e) => matchesSearch([e.description, e.notes, categoryName(e.categoryId)], search))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, categoryFilter, dateFrom, dateTo, search, categories])

  const { pageItems, page, totalPages, hasNext, hasPrev, next, prev } = usePagination(filtered, 25)

  if (!currentYearId || expenses === undefined || categories === undefined) {
    return <p className="page-loading">Loading expenses…</p>
  }

  async function handleAdd(input: ExpenseInput) {
    await insertExpense(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Expense added successfully')
  }

  function handleEditSubmit(original: Expense, input: ExpenseInput) {
    const changes = diffFields([
      ['Description', original.description, input.description],
      ['Vendor', original.vendorName ?? '', input.vendorName ?? ''],
      ['Amount', formatCurrency(original.amount), formatCurrency(input.amount)],
      ['Category', categoryName(original.categoryId), categoryName(input.categoryId)],
      ['Date', formatDisplayDate(original.date), formatDisplayDate(input.date)],
      ['Notes', original.notes ?? '', input.notes ?? ''],
    ])
    if (changes.length === 0) {
      setModal({ mode: 'closed' })
      return
    }
    setPendingEdit({ expense: original, input })
  }

  async function confirmEdit() {
    if (!pendingEdit) return
    setBusy(true)
    try {
      await updateExpense(pendingEdit.expense.id, pendingEdit.input)
      setPendingEdit(null)
      setModal({ mode: 'closed' })
      showToast('Expense updated successfully')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteExpense(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Expense deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportPdf() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      const total = filtered.reduce((s, e) => s + e.amount, 0)
      const doc = await buildPdfReport({
        yearName: currentYear.name,
        reportTitle: 'Expenses Report',
        appName: displayName,
        summaryLines: [`Total Expenses: ${formatCurrencyForPdf(total)}`, `Total Records: ${filtered.length}`],
        table: buildExpensesTable(filtered, categories!),
      })
      doc.save(pdfFileName(currentYear.name, 'Expenses Report'))
    } catch {
      showToast('Could not generate PDF. Please try again.', 'error')
    }
  }

  async function handleExportPng() {
    if (!currentYear) return
    try {
      const { displayName } = await getAppSettings()
      const total = filtered.reduce((s, e) => s + e.amount, 0)
      await exportTableReportAsPng(pngFileName(currentYear.name, 'Expenses Report'), {
        appName: displayName,
        reportTitle: 'Expenses Report',
        yearName: currentYear.name,
        summaryLines: [`Total Expenses: ${formatCurrency(total)}`, `Total Records: ${filtered.length}`],
        tables: [{ table: buildExpensesTable(filtered, categories!, formatCurrency) }],
      })
    } catch {
      showToast('Could not generate image. Please try again.', 'error')
    }
  }

  const columns: Array<DataTableColumn<Expense>> = [
    { key: 'date', header: 'Date', render: (e) => formatDisplayDate(e.date) },
    { key: 'description', header: 'Description', render: (e) => e.description },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => formatCurrency(e.amount) },
    { key: 'category', header: 'Category', render: (e) => categoryName(e.categoryId) },
    { key: 'notes', header: 'Notes', render: (e) => e.notes ?? '—' },
    {
      key: 'actions',
      header: 'Actions',
      render: (e) => (
        <div className="row-actions">
          <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', expense: e })}>
            Edit
          </button>
          <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(e)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="page">
      <div className="page__header">
        <h1>Expenses</h1>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Expense
        </button>
      </div>

      <SectionTabs
        tabs={[
          { to: '/expenses', label: 'Actual Expenses', end: true },
          { to: '/expenses/expected', label: 'Expected Expenses' },
        ]}
      />

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Add your first expense to start tracking Ganesh Navarathri spending."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Expense
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search description, notes…" />
            <SelectFilter
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </FilterBar>

          <ExportButtons onExportPdf={handleExportPdf} onExportPng={handleExportPng} />

          {filtered.length === 0 ? (
            <EmptyState title="No matching expenses" description="Try adjusting your search or filters." />
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
                    </div>
                    <div className="record-card__amount">{formatCurrency(e.amount)}</div>
                    <div className="record-card__meta">
                      {formatDisplayDate(e.date)} · {categoryName(e.categoryId)}
                    </div>
                    {e.notes && <div className="record-card__notes">{e.notes}</div>}
                    <div className="row-actions">
                      <button type="button" className="link-button" onClick={() => setModal({ mode: 'edit', expense: e })}>
                        Edit
                      </button>
                      <button type="button" className="link-button link-button--danger" onClick={() => setDeleteTarget(e)}>
                        Delete
                      </button>
                    </div>
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
          title="Add Expense"
          submitLabel="Save Expense"
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
          title="Edit Expense"
          submitLabel="Save Changes"
          initialValues={expenseToFormValues(modal.expense)}
          categories={categories}
          onSubmit={(input) => handleEditSubmit(modal.expense, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {pendingEdit && (
        <ConfirmDialog
          title="Confirm Changes"
          summary={
            <FieldDiffList
              changes={diffFields([
                ['Description', pendingEdit.expense.description, pendingEdit.input.description],
                ['Vendor', pendingEdit.expense.vendorName ?? '', pendingEdit.input.vendorName ?? ''],
                ['Amount', formatCurrency(pendingEdit.expense.amount), formatCurrency(pendingEdit.input.amount)],
                ['Category', categoryName(pendingEdit.expense.categoryId), categoryName(pendingEdit.input.categoryId)],
                ['Date', formatDisplayDate(pendingEdit.expense.date), formatDisplayDate(pendingEdit.input.date)],
              ])}
            />
          }
          confirmLabel="Save Changes"
          onConfirm={confirmEdit}
          onCancel={() => setPendingEdit(null)}
          busy={busy}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Expense?"
          description="This record will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Description', value: deleteTarget.description },
                { label: 'Amount', value: formatCurrency(deleteTarget.amount) },
                { label: 'Category', value: categoryName(deleteTarget.categoryId) },
                { label: 'Date', value: formatDisplayDate(deleteTarget.date) },
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
