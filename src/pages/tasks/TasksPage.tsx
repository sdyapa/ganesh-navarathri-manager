import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useYearContext } from '@/context/YearContext'
import { useTasks } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { EmptyState } from '@/components/common/EmptyState'
import { FilterBar, SearchInput, SelectFilter, SortControl } from '@/components/common/Filters'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SummaryList } from '@/components/common/SummaryList'
import { ActionButton } from '@/components/common/ActionButton'
import { CopyToYearModal, NEXT_YEAR_VALUE } from '@/components/common/CopyToYearModal'
import { TaskForm, defaultTaskFormValues, taskToFormValues } from './TaskForm'
import {
  insertTask,
  updateTask,
  deleteTask,
  setTaskDone,
  addChecklistItem,
  toggleChecklistItem,
  removeChecklistItem,
} from '@/db/repositories/tasks'
import { copyTasksToYear } from '@/services/copyForwardService'
import { getOrCreateNextYearProfile } from '@/services/yearService'
import { formatDisplayDate } from '@/lib/date'
import { matchesSearch, sortByKey, type SortDirection } from '@/lib/tableUtils'
import { pluralize } from '@/lib/pluralize'
import { EDIT_ICON, DELETE_ICON, DONE_ICON, UNDO_DONE_ICON } from '@/lib/actionIcons'
import type { TaskInput } from '@/lib/validation'
import type { Task } from '@/types'

type ModalState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; task: Task } | { mode: 'copy' }

const SORT_OPTIONS = [
  { value: 'dueDate-asc', label: 'Due Date (Soonest first)' },
  { value: 'dueDate-desc', label: 'Due Date (Latest first)' },
  { value: 'title-asc', label: 'Title (A–Z)' },
]

export function TasksPage() {
  const { currentYearId, currentYear, years } = useYearContext()
  const tasks = useTasks(currentYearId)
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [modal, setModal] = useState<ModalState>(searchParams.get('add') ? { mode: 'add' } : { mode: 'closed' })
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [sortOption, setSortOption] = useState('dueDate-asc')
  const [checklistDrafts, setChecklistDrafts] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!tasks) return []
    const [sortField, sortDirection] = sortOption.split('-') as [keyof Task, SortDirection]
    const base = tasks
      .filter((t) => {
        if (statusFilter === 'pending') return !t.done
        if (statusFilter === 'done') return t.done
        return true
      })
      .filter((t) => matchesSearch([t.title, t.notes, ...t.checklist.map((c) => c.label)], search))
    return sortByKey(base, sortField, sortDirection)
  }, [tasks, statusFilter, search, sortOption])

  if (!currentYearId || tasks === undefined) {
    return <p className="page-loading">Loading tasks…</p>
  }

  async function handleAdd(input: TaskInput) {
    await insertTask(currentYearId!, input)
    setModal({ mode: 'closed' })
    searchParams.delete('add')
    setSearchParams(searchParams, { replace: true })
    showToast('Task added')
  }

  async function handleEdit(task: Task, input: TaskInput) {
    await updateTask(task.id, input)
    setModal({ mode: 'closed' })
    showToast('Task updated')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteTask(deleteTarget.id)
      setDeleteTarget(null)
      showToast('Task deleted', 'info')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddChecklistItem(taskId: string) {
    const label = checklistDrafts[taskId]?.trim()
    if (!label) return
    await addChecklistItem(taskId, label)
    setChecklistDrafts((prev) => ({ ...prev, [taskId]: '' }))
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCopyToYear(targetYearSelection: string) {
    if (!currentYearId || !currentYear) return
    setBusy(true)
    try {
      const { targetYearId, targetYearName, targetYearNumber } =
        targetYearSelection === NEXT_YEAR_VALUE
          ? await getOrCreateNextYearProfile(currentYearId).then((r) => ({
              targetYearId: r.profile.id,
              targetYearName: r.profile.name,
              targetYearNumber: r.profile.year,
            }))
          : {
              targetYearId: targetYearSelection,
              targetYearName: years.find((y) => y.id === targetYearSelection)?.name ?? 'target year',
              targetYearNumber: years.find((y) => y.id === targetYearSelection)?.year ?? currentYear.year + 1,
            }
      const count = await copyTasksToYear([...selectedIds], targetYearId, currentYear.year, targetYearNumber)
      setSelectedIds(new Set())
      setModal({ mode: 'closed' })
      showToast(`Copied ${pluralize(count, 'task')} to ${targetYearName}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Tasks</h1>
          <p className="page__subtitle">Upcoming to-dos with due dates — some can carry their own checklist (e.g. a "Pooja items list").</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
          + Add Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Track upcoming to-dos with due dates — e.g. 'Book priest', 'Buy pooja items'."
          action={
            <button type="button" className="button button--primary" onClick={() => setModal({ mode: 'add' })}>
              + Add Task
            </button>
          }
        />
      ) : (
        <>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search title, notes, checklist…" />
            <SelectFilter
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <SortControl value={sortOption} onChange={setSortOption} options={SORT_OPTIONS} />
          </FilterBar>

          {selectedIds.size > 0 && (
            <div className="row-actions">
              <button type="button" className="button button--secondary" onClick={() => setModal({ mode: 'copy' })}>
                Copy {pluralize(selectedIds.size, 'task')} to Next Year
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState title="No matching tasks" description="Try adjusting your filters." />
          ) : (
            <div className="card-list">
              {filtered.map((t) => (
                <div key={t.id} className="record-card">
                  <label className="record-card__select">
                    <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelected(t.id)} />
                    Select
                  </label>
                  <div className="record-card__top">
                    <strong>{t.title}</strong>
                    {t.done ? <span className="badge badge--success">Done</span> : <span className="badge">Pending</span>}
                  </div>
                  <div className="record-card__meta">Due {formatDisplayDate(t.dueDate)}</div>
                  {t.notes && <div className="record-card__notes">{t.notes}</div>}

                  {t.checklist.length > 0 && (
                    <ul className="manage-list">
                      {t.checklist.map((item) => (
                        <li key={item.id} className="manage-list__item">
                          <label className="record-card__select">
                            <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(t.id, item.id)} />
                            <span className={item.done ? 'checklist-item--done' : undefined}>{item.label}</span>
                          </label>
                          <ActionButton icon={DELETE_ICON} label="Remove" danger onClick={() => removeChecklistItem(t.id, item.id)} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="inline-form">
                    <input
                      type="text"
                      placeholder="Add checklist item…"
                      value={checklistDrafts[t.id] ?? ''}
                      onChange={(e) => setChecklistDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem(t.id)}
                    />
                    <button type="button" className="button button--secondary" onClick={() => handleAddChecklistItem(t.id)}>
                      + Add Item
                    </button>
                  </div>

                  <div className="row-actions">
                    <ActionButton
                      icon={t.done ? UNDO_DONE_ICON : DONE_ICON}
                      label={t.done ? 'Mark Pending' : 'Mark Done'}
                      onClick={() => setTaskDone(t.id, !t.done)}
                    />
                    <ActionButton icon={EDIT_ICON} label="Edit" onClick={() => setModal({ mode: 'edit', task: t })} />
                    <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => setDeleteTarget(t)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal.mode === 'add' && (
        <TaskForm
          title="Add Task"
          submitLabel="Save Task"
          initialValues={defaultTaskFormValues()}
          showChecklistInput
          onSubmit={handleAdd}
          onClose={() => {
            setModal({ mode: 'closed' })
            searchParams.delete('add')
            setSearchParams(searchParams, { replace: true })
          }}
        />
      )}

      {modal.mode === 'edit' && (
        <TaskForm
          title="Edit Task"
          submitLabel="Save Changes"
          initialValues={taskToFormValues(modal.task)}
          onSubmit={(input) => handleEdit(modal.task, input)}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {modal.mode === 'copy' && currentYear && (
        <CopyToYearModal
          title="Copy Tasks to Another Year"
          itemLabel={pluralize(selectedIds.size, 'task')}
          description={`This copies ${pluralize(selectedIds.size, 'task')} into the target year as fresh, unchecked to-dos (any checklist items are copied too, unchecked) — the due date shifts by the same number of years so it lands on the equivalent festival day.`}
          sourceYear={currentYear}
          years={years}
          busy={busy}
          onConfirm={handleCopyToYear}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Task?"
          description="This task and its checklist will be permanently deleted."
          summary={
            <SummaryList
              rows={[
                { label: 'Title', value: deleteTarget.title },
                { label: 'Due Date', value: formatDisplayDate(deleteTarget.dueDate) },
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
