import { useState } from 'react'
import { useProfiles } from '@/hooks/useYearData'
import { useToast } from '@/context/ToastContext'
import { deleteProfile, renameProfile, reorderProfiles, upsertProfileFromName } from '@/db/repositories/profiles'
import type { Profile, ProfileKind } from '@/types'

interface ProfileListProps {
  kind: ProfileKind
  title: string
  description: string
  placeholder: string
}

function ProfileList({ kind, title, description, placeholder }: ProfileListProps) {
  const profiles = useProfiles(kind)
  const { showToast } = useToast()
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  if (!profiles) return null

  async function handleSaveRename() {
    if (!editing || !editing.name.trim()) return
    await renameProfile(editing.id, editing.name)
    setEditing(null)
    showToast(`${title.slice(0, -1)} renamed`)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= profiles!.length) return
    const reordered = [...profiles!]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    reorderProfiles(reordered.map((p) => p.id))
  }

  async function handleDelete(profile: Profile) {
    await deleteProfile(profile.id)
    showToast(`"${profile.name}" removed`)
  }

  return (
    <div className="settings-subsection">
      <h3>{title}</h3>
      <p className="page__note">{description}</p>
      {profiles.length === 0 ? (
        <p className="text-muted">
          None saved yet — names typed into {kind === 'person' ? 'Donor/Person' : 'Vendor'} fields are added here
          automatically as you use them, or add one directly below.
        </p>
      ) : (
        <ul className="manage-list">
          {profiles.map((p, i) => (
            <li key={p.id} className="manage-list__item">
              {editing?.id === p.id ? (
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                  autoFocus
                />
              ) : (
                <span className="manage-list__label">{p.name}</span>
              )}
              <div className="row-actions">
                <button type="button" className="icon-button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button type="button" className="icon-button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === profiles.length - 1}>
                  ↓
                </button>
                {editing?.id === p.id ? (
                  <button type="button" className="link-button" onClick={handleSaveRename}>
                    Save
                  </button>
                ) : (
                  <button type="button" className="link-button" onClick={() => setEditing({ id: p.id, name: p.name })}>
                    Rename
                  </button>
                )}
                <button type="button" className="link-button link-button--danger" onClick={() => handleDelete(p)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddProfileForm kind={kind} placeholder={placeholder} />
    </div>
  )
}

function AddProfileForm({ kind, placeholder }: { kind: ProfileKind; placeholder: string }) {
  const [newName, setNewName] = useState('')
  const { showToast } = useToast()

  async function handleAdd() {
    if (!newName.trim()) return
    await upsertProfileFromName(kind, newName)
    showToast(`"${newName.trim()}" added`)
    setNewName('')
  }

  return (
    <div className="inline-form">
      <input
        type="text"
        placeholder={placeholder}
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button type="button" className="button button--secondary" onClick={handleAdd}>
        + Add
      </button>
    </div>
  )
}

export function ProfileSettings() {
  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>People &amp; Vendors</h2>
      </div>
      <p className="page__note">
        Saved names suggest as you type in Donor, Auction Person, and Vendor fields, so you don't need to retype them
        every year. Names are added here automatically the first time you use them — this page is just for
        reviewing, correcting, or removing them.
      </p>
      <ProfileList
        kind="person"
        title="People"
        description="Shared across Donor and Auction Participant fields — the same person often shows up in both roles."
        placeholder="New person name"
      />
      <ProfileList kind="vendor" title="Vendors" description="Used by the Vendor field on Expenses." placeholder="New vendor name" />
    </div>
  )
}
