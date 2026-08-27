import { db } from '@/db/db'
import { generateId } from '@/lib/id'
import type { Unit } from '@/types'

export async function listUnits(): Promise<Unit[]> {
  const all = await db.units.toArray()
  return all.sort((a, b) => a.order - b.order)
}

export async function insertUnit(name: string): Promise<Unit> {
  const existing = await listUnits()
  const unit: Unit = { id: generateId(), name: name.trim(), active: true, order: existing.length, isDefault: false }
  await db.units.add(unit)
  return unit
}

export async function renameUnit(id: string, name: string): Promise<void> {
  await db.units.update(id, { name: name.trim() })
}

export async function setUnitActive(id: string, active: boolean): Promise<void> {
  await db.units.update(id, { active })
}

export async function reorderUnits(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.units, async () => {
    await Promise.all(orderedIds.map((id, index) => db.units.update(id, { order: index })))
  })
}

export async function isUnitInUse(id: string): Promise<boolean> {
  const [d, ed] = await Promise.all([
    db.donations.where('unitId').equals(id).count(),
    db.expectedDonations.where('unitId').equals(id).count(),
  ])
  return d + ed > 0
}

export async function deleteUnit(id: string): Promise<void> {
  await db.units.delete(id)
}
