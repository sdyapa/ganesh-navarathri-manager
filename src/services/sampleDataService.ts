// Demo data generator — only ever runs when the user explicitly asks for it from Settings ›
// Data Management. Never invoked automatically, so a real user's database is never polluted
// with fake financial records (spec "Sample Data / Demo Mode").
import { ensureAppInitialized } from '@/db/init'
import { listCategories } from '@/db/repositories/categories'
import { listUnits } from '@/db/repositories/units'
import { insertDonation } from '@/db/repositories/donations'
import { insertExpectedDonation } from '@/db/repositories/expectedDonations'
import { insertExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense } from '@/db/repositories/expectedExpenses'
import { insertAuction } from '@/db/repositories/auctions'
import { createYearProfile } from '@/services/yearService'
import { fromLocalParts, toLocalDate, todayDateOnly } from '@/lib/date'
import type { Category, Unit } from '@/types'

function byName(categories: Category[], name: string): Category {
  const found = categories.find((c) => c.name === name)
  if (!found) throw new Error(`Expected default category "${name}" to exist`)
  return found
}
function unitByName(units: Unit[], name: string): Unit {
  const found = units.find((u) => u.name === name)
  if (!found) throw new Error(`Expected default unit "${name}" to exist`)
  return found
}

const NAMES = ['Ramesh', 'Suresh', 'Lakshmi', 'Priya', 'Anand', 'Kavita', 'Venkatesh', 'Deepa', 'Ganesh', 'Meena']

function dateOffset(base: string, days: number): string {
  const d = toLocalDate(base)
  d.setDate(d.getDate() + days)
  return fromLocalParts(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export async function seedSampleData(): Promise<{ yearsCreated: string[] }> {
  await ensureAppInitialized()
  const categories = await listCategories()
  const units = await listUnits()
  const donationCats = {
    chanda: byName(categories, 'Chanda'),
    annadanam: byName(categories, 'Annadanam'),
    auction: byName(categories, 'Auction'),
  }
  const expenseCats = {
    pooja: byName(categories, 'Pooja Items'),
    annadanam: byName(categories, 'Annadanam'),
    activities: byName(categories, 'Activities'),
    setup: byName(categories, 'Initial Setup'),
    nimajjanam: byName(categories, 'Nimajjanam'),
  }
  const kg = unitByName(units, 'kg')
  const litre = unitByName(units, 'litre')

  const currentYear = new Date().getFullYear()
  const prevYear = currentYear - 1
  const prevProfile = await createYearProfile({
    year: prevYear,
    name: `Ganesh Navarathri ${prevYear} (Sample)`,
    carryForward: false,
  })
  const start = `${prevYear}-08-20`

  for (let i = 0; i < 12; i++) {
    await insertDonation(prevProfile.id, {
      donorName: NAMES[i % NAMES.length],
      type: 'monetary',
      amount: 1000 + i * 750,
      date: dateOffset(start, i),
      categoryId: donationCats.chanda.id,
      notes: undefined,
    })
  }
  await insertDonation(prevProfile.id, {
    donorName: 'Ramesh',
    type: 'commodity',
    commodityName: 'Rice',
    quantity: 50,
    unitId: kg.id,
    date: dateOffset(start, 3),
    categoryId: donationCats.annadanam.id,
    notes: '50 kg rice bags',
  })
  await insertDonation(prevProfile.id, {
    donorName: 'Lakshmi',
    type: 'commodity',
    commodityName: 'Cooking Oil',
    quantity: 10,
    unitId: litre.id,
    date: dateOffset(start, 4),
    categoryId: donationCats.annadanam.id,
  })
  await insertAuction(prevProfile.id, { item: 'Laddu Box', person: 'Venkatesh', amount: 3500, date: dateOffset(start, 8) })
  await insertAuction(prevProfile.id, { item: 'Coconut Garland', person: 'Anand', amount: 1200, date: dateOffset(start, 8) })
  await insertExpense(prevProfile.id, { description: 'Flowers and pooja items', amount: 8500, date: dateOffset(start, 1), categoryId: expenseCats.pooja.id })
  await insertExpense(prevProfile.id, { description: 'Rice and provisions for Annadanam', amount: 32000, date: dateOffset(start, 5), categoryId: expenseCats.annadanam.id })
  await insertExpense(prevProfile.id, { description: 'Cultural program artists', amount: 15000, date: dateOffset(start, 6), categoryId: expenseCats.activities.id })
  await insertExpense(prevProfile.id, { description: 'Pandal and lighting setup', amount: 22000, date: dateOffset(start, 0), categoryId: expenseCats.setup.id })
  await insertExpense(prevProfile.id, { description: 'Visarjan procession arrangements', amount: 9000, date: dateOffset(start, 10), categoryId: expenseCats.nimajjanam.id })

  const currentProfile = await createYearProfile({
    year: currentYear,
    name: `Ganesh Navarathri ${currentYear} (Sample)`,
    carryForward: true,
    carryForwardFromYearId: prevProfile.id,
  })
  const start2 = `${currentYear}-08-20`
  for (let i = 0; i < 9; i++) {
    await insertDonation(currentProfile.id, {
      donorName: NAMES[(i + 3) % NAMES.length],
      type: 'monetary',
      amount: 1500 + i * 900,
      date: dateOffset(start2, i),
      categoryId: donationCats.chanda.id,
    })
  }
  await insertAuction(currentProfile.id, { item: 'Modak Basket', person: 'Deepa', amount: 2800, date: dateOffset(start2, 7) })
  await insertExpense(currentProfile.id, { description: 'Decoration and flowers', amount: 11000, date: dateOffset(start2, 1), categoryId: expenseCats.pooja.id })
  await insertExpense(currentProfile.id, { description: 'Prasadam ingredients', amount: 27000, date: dateOffset(start2, 4), categoryId: expenseCats.annadanam.id })
  await insertExpectedDonation(currentProfile.id, {
    donorName: 'Ganesh',
    type: 'monetary',
    amount: 10000,
    date: todayDateOnly(),
    categoryId: donationCats.chanda.id,
    notes: 'Promised during house visit',
  })
  await insertExpectedDonation(currentProfile.id, {
    donorName: 'Meena',
    type: 'commodity',
    commodityName: 'Rice',
    quantity: 25,
    unitId: kg.id,
    date: todayDateOnly(),
    categoryId: donationCats.annadanam.id,
  })
  await insertExpectedExpense(currentProfile.id, {
    description: 'Fireworks for visarjan',
    amount: 6000,
    date: todayDateOnly(),
    categoryId: expenseCats.nimajjanam.id,
  })

  return { yearsCreated: [prevProfile.name, currentProfile.name] }
}
