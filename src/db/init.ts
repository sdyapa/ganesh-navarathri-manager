import { db } from '@/db/db'
import { buildDefaultCategories, buildDefaultUnits } from '@/db/defaults'
import { getAppSettings } from '@/db/repositories/settings'
import { insertYearProfile, listYearProfiles } from '@/db/repositories/yearProfiles'
import type { YearProfile } from '@/types'

/**
 * Runs on app boot (and again, defensively, whenever sample data is seeded). Seeds default
 * categories/units/settings if this is a brand-new browser profile, and ensures at least one
 * YearProfile exists (defaulting to the current calendar year) so the app never opens to a
 * "no year selected" dead end.
 *
 * This can legitimately be called more than once in quick succession — React 18 StrictMode
 * double-invokes mount effects in development, and nothing stops two browser tabs from both
 * hitting an empty database on first load. Two concurrent, uncoordinated calls can each see an
 * empty count() and both insert a full set of defaults — exactly the "every category and unit
 * appears twice" bug this guards against, two ways:
 *
 *  1. An in-memory "already running" guard for same-tab races (StrictMode, or any other
 *     accidental double-call within one page load) — the second caller just awaits the first
 *     call's result instead of starting its own independent check-then-seed sequence. This is
 *     the one that actually matters in practice, and it's deterministic regardless of the
 *     underlying IndexedDB engine's exact transaction-interleaving behavior.
 *  2. Wrapping the work in a single Dexie transaction, which is the correct defense for the
 *     cross-tab case an in-memory guard can't help with (two separate tabs have separate JS
 *     memory) — real IndexedDB serializes read-write transactions that touch the same object
 *     stores, so a second *tab's* transaction only starts once the first tab's has committed.
 */
let initPromise: Promise<YearProfile[]> | null = null

export function ensureAppInitialized(): Promise<YearProfile[]> {
  if (!initPromise) {
    initPromise = runInitialization().finally(() => {
      initPromise = null
    })
  }
  return initPromise
}

async function runInitialization(): Promise<YearProfile[]> {
  return db.transaction('rw', [db.appSettings, db.categories, db.units, db.yearProfiles], async () => {
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
  })
}
