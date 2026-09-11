// Copies recurring records (e.g. "Priest Charges" every year, or "Book priest" every festival)
// into a future year — the source record itself is never modified. Donations/Expenses copy as
// pending Expected records with the current amount as a starting point, adjusted once the real
// figure for that year is known. Tasks copy as fresh pending to-dos instead, since a task has no
// "expected" concept — see copyTasksToYear below for why its due date shifts by a year rather
// than resetting to today.
import { getExpense } from '@/db/repositories/expenses'
import { insertExpectedExpense } from '@/db/repositories/expectedExpenses'
import { getDonation } from '@/db/repositories/donations'
import { insertExpectedDonation } from '@/db/repositories/expectedDonations'
import { getTask, insertTask } from '@/db/repositories/tasks'
import { addYears, todayDateOnly } from '@/lib/date'

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

/** Copies Tasks into a future year as fresh, unchecked to-dos (checklist items included, all
 *  reset to unchecked — a copy is a new occurrence of the task, not a continuation of last
 *  year's progress) — e.g. "Book priest" or "Buy pooja items" recurring every festival. Unlike
 *  Donations/Expenses (which have no inherent date meaning and default to today so the user can
 *  retype the real one), a Task's `dueDate` shifts by exactly one year per target year so it
 *  lands on the same festival day automatically rather than needing to be re-picked by hand. */
export async function copyTasksToYear(taskIds: string[], targetYearId: string, sourceYear: number, targetYear: number): Promise<number> {
  const yearShift = targetYear - sourceYear
  let count = 0
  for (const id of taskIds) {
    const task = await getTask(id)
    if (!task) continue
    await insertTask(targetYearId, {
      title: task.title,
      dueDate: addYears(task.dueDate, yearShift),
      notes: task.notes,
      checklistItems: task.checklist.map((item) => item.label),
    })
    count += 1
  }
  return count
}
