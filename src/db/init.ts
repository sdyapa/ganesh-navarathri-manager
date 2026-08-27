import { db } from '@/db/db'
import { buildDefaultCategories, buildDefaultUnits } from '@/db/defaults'
import { getAppSettings } from '@/db/repositories/settings'
import { insertYearProfile, listYearProfiles } from '@/db/repositories/yearProfiles'
import type { YearProfile } from '@/types'

/**
 * Runs once on app boot. Seeds default categories/units/settings if this is a brand-new
 * browser profile, and ensures at least one YearProfile exists (defaulting to the current
 * calendar year) so the app never opens to a "no year selected" dead end.
 */
export async function ensureAppInitialized(): Promise<YearProfile[]> {
  await getAppSettings()

  const categoryCount = await db.categories.count()
  if (categoryCount === 0) {
    await db.categories.bulkAdd(buildDefaultCategories())
  }

  const unitCount = await db.units.count()
  if (unitCount === 0) {
    await db.units.bulkAdd(buildDefaultUnits())
  }

  let profiles = await listYearProfiles()
  if (profiles.length === 0) {
    const year = new Date().getFullYear()
    await insertYearProfile({
      year,
      name: `Ganesh Navarathri ${year}`,
      openingBalance: 0,
      carryForward: false,
      carryForwardSourceYearId: null,
    })
    profiles = await listYearProfiles()
  }

  return profiles
}
