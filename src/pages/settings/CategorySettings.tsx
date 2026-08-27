import { useState } from 'react'
import { useCategories } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  deleteCategory,
  insertCategory,
  isCategoryInUse,
  renameCategory,
  reorderCategories,
  setCategoryActive,
} from '@/db/repositories/categories'
import type { Category, CategoryKind } from '@/types'

function CategoryList({ kind, title }: { kind: CategoryKind; title: string }) {
  const categories = useCategories(kind)
  const { showToast } = useToast()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Category | null>(null)

  if (!categories) return null

  async function handleAdd() {
    if (!newName.trim()) return
    await insertCategory(kind, newName)
    setNewName('')
    showToast(`Category "${newName.trim()}" added`)
  }

  async function handleSaveRename() {
    if (!editing || !editing.name.trim()) return
    await renameCategory(editing.id, editing.name)
    setEditing(null)
    showToast('Category renamed')
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categories!.length) return
    const reordered = [...categories!]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    reorderCategories(reordered.map((c) => c.id))
  }

  async function handleDeleteOrDeactivate(category: Category) {
    const inUse = await isCategoryInUse(category.id)
    if (inUse) {
      setDeactivateTarget(category)
    } else {
      await deleteCategory(category.id)
      showToast('Category deleted')
    }
  }

  return (
    <div className="settings-subsection">
      <h3>{title}</h3>
      <ul className="manage-list">
        {categories.map((c, i) => (
          <li key={c.id} className={`manage-list__item ${!c.active ? 'manage-list__item--inactive' : ''}`}>
            {editing?.id === c.id ? (
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                autoFocus
              />
            ) : (
              <span className="manage-list__label">
                {c.name} {!c.active && <span className="badge">Inactive</span>} {c.isDefault && <span className="text-muted">(default)</span>}
              </span>
            )}
            <div className="row-actions">
              <button type="button" className="icon-button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="icon-button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === categories.length - 1}>
                ↓
              </button>
              {editing?.id === c.id ? (
                <button type="button" className="link-button" onClick={handleSaveRename}>
                  Save
                </button>
              ) : (
                <button type="button" className="link-button" onClick={() => setEditing({ id: c.id, name: c.name })}>
                  Rename
                </button>
              )}
              <button type="button" className="link-button" onClick={() => setCategoryActive(c.id, !c.active)}>
                {c.active ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="link-button link-button--danger" onClick={() => handleDeleteOrDeactivate(c)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="inline-form">
        <input
          type="text"
          placeholder={`New ${title.toLowerCase()} category`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button type="button" className="button button--secondary" onClick={handleAdd}>
          + Add
        </button>
      </div>

      {deactivateTarget && (
        <ConfirmDialog
          title="Category In Use"
          description={`"${deactivateTarget.name}" is used by existing records, so deleting it would break their history. It will be deactivated instead — existing records keep this category, but it won't appear for new entries.`}
          confirmLabel="Deactivate Category"
          onConfirm={async () => {
            await setCategoryActive(deactivateTarget.id, false)
            setDeactivateTarget(null)
            showToast('Category deactivated (existing records unaffected)')
          }}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  )
}

export function CategorySettings() {
  return (
    <div className="settings-section">
      <h2>Categories</h2>
      <p className="page__note">
        Categories used by existing records can't be permanently deleted — they're deactivated instead, so past
        donations and expenses always keep their original category.
      </p>
      <CategoryList kind="donation" title="Donation Categories" />
      <CategoryList kind="expense" title="Expense Categories" />
    </div>
  )
}
