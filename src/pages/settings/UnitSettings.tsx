import { useState } from 'react'
import { useUnits } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ActionButton } from '@/components/common/ActionButton'
import {
  deleteUnit,
  insertUnit,
  isUnitInUse,
  renameUnit,
  reorderUnits,
  restoreDefaultUnits,
  setUnitActive,
} from '@/db/repositories/units'
import { EDIT_ICON, DELETE_ICON } from '@/lib/actionIcons'
import type { Unit } from '@/types'

export function UnitSettings() {
  const units = useUnits()
  const { showToast } = useToast()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Unit | null>(null)

  if (!units) return null

  async function handleAdd() {
    if (!newName.trim()) return
    await insertUnit(newName)
    setNewName('')
    showToast(`Unit "${newName.trim()}" added`)
  }

  async function handleSaveRename() {
    if (!editing || !editing.name.trim()) return
    await renameUnit(editing.id, editing.name)
    setEditing(null)
    showToast('Unit renamed')
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= units!.length) return
    const reordered = [...units!]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    reorderUnits(reordered.map((u) => u.id))
  }

  async function handleDeleteOrDeactivate(unit: Unit) {
    const inUse = await isUnitInUse(unit.id)
    if (inUse) {
      setDeactivateTarget(unit)
    } else {
      await deleteUnit(unit.id)
      showToast('Unit deleted')
    }
  }

  async function handleRestoreDefaults() {
    const restored = await restoreDefaultUnits()
    showToast(restored.length ? `Restored: ${restored.join(', ')}` : 'All default units are already present.')
  }

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>Units</h2>
        <button type="button" className="link-button" onClick={handleRestoreDefaults}>
          Restore Default Units
        </button>
      </div>
      <p className="page__note">Units used by existing commodity donations are deactivated rather than deleted, so history stays intact.</p>
      <ul className="manage-list">
        {units.map((u, i) => (
          <li key={u.id} className={`manage-list__item ${!u.active ? 'manage-list__item--inactive' : ''}`}>
            {editing?.id === u.id ? (
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ id: u.id, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                autoFocus
              />
            ) : (
              <span className="manage-list__label">
                {u.name} {!u.active && <span className="badge">Inactive</span>} {u.isDefault && <span className="text-muted">(default)</span>}
              </span>
            )}
            <div className="row-actions">
              <button type="button" className="icon-button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="icon-button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === units.length - 1}>
                ↓
              </button>
              {editing?.id === u.id ? (
                <button type="button" className="link-button" onClick={handleSaveRename}>
                  Save
                </button>
              ) : (
                <ActionButton icon={EDIT_ICON} label="Rename" onClick={() => setEditing({ id: u.id, name: u.name })} />
              )}
              <button type="button" className="link-button" onClick={() => setUnitActive(u.id, !u.active)}>
                {u.active ? 'Deactivate' : 'Activate'}
              </button>
              <ActionButton icon={DELETE_ICON} label="Delete" danger onClick={() => handleDeleteOrDeactivate(u)} />
            </div>
          </li>
        ))}
      </ul>
      <div className="inline-form">
        <input
          type="text"
          placeholder="New unit (e.g. dozen)"
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
          title="Unit In Use"
          description={`"${deactivateTarget.name}" is used by existing commodity donations, so it will be deactivated instead of deleted — existing records keep this unit, but it won't appear for new entries.`}
          confirmLabel="Deactivate Unit"
          onConfirm={async () => {
            await setUnitActive(deactivateTarget.id, false)
            setDeactivateTarget(null)
            showToast('Unit deactivated (existing records unaffected)')
          }}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  )
}
