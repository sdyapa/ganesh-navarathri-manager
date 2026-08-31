// Copies recurring Actual records (e.g. "Priest Charges" every year) into a future year as
// pending Expected records — the user picks a starting amount (this year's, or last year's)
// and adjusts it once the real figure for that year is known, rather than retyping the whole
// entry from scratch every festival. The source record itself is never modified.
import { getExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense } from '@/db/repositories/expectedExpenses'
import { getDonation } from '@/db/repositories/donations'
import { insertExpectedDonation } from '@/db/repositories/expectedDonations'
import { todayDateOnly } from '@/lib/date'

export async function copyExpensesToExpected(expenseIds: string[], targetYearId: string): Promise<number> {
  let count = 0
  for (const id of expenseIds) {
    const expense = await getExpense(id)
    if (!expense) continue
    await insertExpectedExpense(targetYearId, {
      description: expense.description,
      amount: expense.amount,
      date: todayDateOnly(),
      categoryId: expense.categoryId,
      notes: expense.notes,
      vendorName: expense.vendorName,
    })
    count += 1
  }
  return count
}

export async function copyDonationsToExpected(donationIds: string[], targetYearId: string): Promise<number> {
  let count = 0
  for (const id of donationIds) {
    const donation = await getDonation(id)
    if (!donation) continue
    await insertExpectedDonation(targetYearId, {
      donorName: donation.donorName,
      type: donation.type,
      date: todayDateOnly(),
      categoryId: donation.categoryId,
      notes: donation.notes,
      amount: donation.type === 'monetary' ? donation.amount : undefined,
      commodityName: donation.type === 'commodity' ? donation.commodityName : undefined,
      quantity: donation.type === 'commodity' ? donation.quantity : undefined,
      unitId: donation.type === 'commodity' ? donation.unitId : undefined,
    })
    count += 1
  }
  return count
}
