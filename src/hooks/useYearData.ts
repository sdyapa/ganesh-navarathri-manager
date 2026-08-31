// Thin useLiveQuery wrappers, one per entity, all scoped to the currently selected year. Kept
// in one file since each is a one-line query — components import only the ones they need.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { withAppSettingsDefaults } from '@/db/repositories/settings'

export function useDonations(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.donations.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useExpectedDonations(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.expectedDonations.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useExpenses(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.expenses.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useExpectedExpenses(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.expectedExpenses.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useAuctions(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.auctions.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useTasks(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.tasks.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useKeyEvents(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.keyEvents.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function usePoojaAssignments(yearProfileId: string | undefined) {
  return useLiveQuery(
    () => (yearProfileId ? db.poojaAssignments.where('yearProfileId').equals(yearProfileId).toArray() : []),
    [yearProfileId],
    undefined,
  )
}

export function useCategories(kind?: 'donation' | 'expense') {
  return useLiveQuery(async () => {
    const all = await db.categories.toArray()
    const filtered = kind ? all.filter((c) => c.kind === kind) : all
    return filtered.sort((a, b) => a.order - b.order)
  }, [kind], undefined)
}

export function useUnits() {
  return useLiveQuery(async () => {
    const all = await db.units.toArray()
    return all.sort((a, b) => a.order - b.order)
  }, [], undefined)
}

export function useProfiles(kind?: 'person' | 'vendor') {
  return useLiveQuery(async () => {
    const all = await db.profiles.toArray()
    const filtered = kind ? all.filter((p) => p.kind === kind) : all
    return filtered.sort((a, b) => a.order - b.order)
  }, [kind], undefined)
}

export function useAppSettings() {
  return useLiveQuery(
    async () => {
      const settings = await db.appSettings.get('global')
      return settings ? withAppSettingsDefaults(settings) : undefined
    },
    [],
    undefined,
  )
}
