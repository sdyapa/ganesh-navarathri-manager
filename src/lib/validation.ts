// All user-entered data is validated here before it reaches the database. Forms and the
// backup importer both go through these schemas so a malformed/malicious backup file can
// never insert an invalid record silently.
import { z } from 'zod'
import { isValidDateOnly } from './date'

const dateOnly = z.string().refine(isValidDateOnly, { message: 'Enter a valid date' })
const nonEmpty = (label: string) => z.string().trim().min(1, `${label} is required`)
const notes = z.string().trim().max(2000, 'Notes are too long (max 2000 characters)').optional()
const positiveAmount = z
  .number({ invalid_type_error: 'Amount is required' })
  .finite('Amount is too large')
  .positive('Amount must be greater than ₹0')
  .max(999_99_99_999, 'Amount is unrealistically large')
const positiveQuantity = z
  .number({ invalid_type_error: 'Quantity is required' })
  .finite('Quantity is too large')
  .positive('Quantity must be greater than 0')

export const donationInputSchema = z
  .object({
    donorName: nonEmpty('Donor name'),
    type: z.enum(['monetary', 'commodity']),
    date: dateOnly,
    categoryId: nonEmpty('Category'),
    notes,
    amount: z.number().optional(),
    commodityName: z.string().trim().optional(),
    quantity: z.number().optional(),
    unitId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'monetary') {
      const parsed = positiveAmount.safeParse(val.amount)
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: parsed.error.issues[0].message })
      }
    } else {
      if (!val.commodityName || val.commodityName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commodityName'], message: 'Commodity name is required' })
      }
      const qty = positiveQuantity.safeParse(val.quantity)
      if (!qty.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: qty.error.issues[0].message })
      }
      if (!val.unitId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitId'], message: 'Unit is required' })
      }
    }
  })

export type DonationInput = z.infer<typeof donationInputSchema>

export const expectedDonationInputSchema = donationInputSchema

export type ExpectedDonationInput = z.infer<typeof expectedDonationInputSchema>

export const expenseInputSchema = z.object({
  description: nonEmpty('Description'),
  amount: positiveAmount,
  date: dateOnly,
  categoryId: nonEmpty('Category'),
  notes,
  vendorName: z.string().trim().max(100, 'Vendor name is too long').optional(),
  // Visual-only grouping label (see Expense.paymentGroup's doc comment) — shared with
  // expectedExpenseInputSchema below since it's the same underlying schema, but the Expected
  // Expense form never renders this field, so it's simply never populated there.
  paymentGroup: z.string().trim().max(100, 'Payment group name is too long').optional(),
})

export type ExpenseInput = z.infer<typeof expenseInputSchema>

export const expectedExpenseInputSchema = expenseInputSchema

export type ExpectedExpenseInput = z.infer<typeof expectedExpenseInputSchema>

export const auctionInputSchema = z.object({
  item: nonEmpty('Item'),
  person: nonEmpty('Person'),
  amount: positiveAmount,
  date: dateOnly,
  notes,
})

export type AuctionInput = z.infer<typeof auctionInputSchema>

export const taskInputSchema = z.object({
  title: nonEmpty('Title'),
  dueDate: dateOnly,
  notes,
  // Only populated on create (parsed from the Add form's one-item-per-line textarea) — editing
  // a task's title/date/notes never touches its checklist, which is managed item-by-item.
  checklistItems: z.array(z.string()).optional().default([]),
})

export type TaskInput = z.infer<typeof taskInputSchema>

export const keyEventInputSchema = z.object({
  name: nonEmpty('Event name'),
  date: dateOnly,
  notes,
})

export type KeyEventInput = z.infer<typeof keyEventInputSchema>

export const poojaAssignmentInputSchema = z.object({
  date: dateOnly,
  familyNames: nonEmpty('Family name(s)'),
  notes,
})

export type PoojaAssignmentInput = z.infer<typeof poojaAssignmentInputSchema>

export const categoryInputSchema = z.object({
  kind: z.enum(['donation', 'expense']),
  name: nonEmpty('Category name').max(60, 'Category name is too long'),
})

export const unitInputSchema = z.object({
  name: nonEmpty('Unit name').max(30, 'Unit name is too long'),
})

export const yearProfileInputSchema = z.object({
  year: z
    .number()
    .int('Year must be a whole number')
    .min(2000, 'Year looks incorrect')
    .max(2200, 'Year looks incorrect'),
  name: nonEmpty('Profile name').max(100, 'Profile name is too long'),
  carryForward: z.boolean(),
})

export const whatsappTemplatesSchema = z.object({
  monetary: z.string().min(1, 'Template cannot be empty').max(2000),
  commodity: z.string().min(1, 'Template cannot be empty').max(2000),
})

export const driveReminderIntervalSchema = z
  .number({ invalid_type_error: 'Enter a number of days' })
  .int('Enter a whole number of days')
  .min(1, 'Must be at least 1 day')
  .max(365, 'Must be 365 days or fewer')

export const dashboardTaskPreviewCountSchema = z
  .number({ invalid_type_error: 'Enter a number' })
  .int('Enter a whole number')
  .min(0, 'Must be 0 or more (0 hides the Heads Up section)')
  .max(20, 'Must be 20 or fewer')

// Kept short deliberately — this renders in the sidebar and a mobile top bar alongside the
// year switcher, so an overly long name defeats the point of making it customizable.
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'App name cannot be empty')
  .max(40, 'Keep it under 40 characters so it fits in the navigation')

// ---------- Backup file structural validation ----------
// `.passthrough()` on nested objects means unknown fields from a *future* app version survive
// a round trip instead of being stripped or rejected — required records are still checked.

const recordBaseSchema = z.object({
  id: z.string().min(1),
  yearProfileId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const backupDonationSchema = recordBaseSchema
  .extend({
    donorName: z.string(),
    type: z.enum(['monetary', 'commodity']),
    date: z.string(),
    categoryId: z.string(),
    notes: z.string().optional(),
    amount: z.number().optional(),
    commodityName: z.string().optional(),
    quantity: z.number().optional(),
    unitId: z.string().optional(),
    sourceExpectedDonationId: z.string().nullable().optional(),
  })
  .passthrough()

export const backupExpectedDonationSchema = backupDonationSchema
  .extend({
    status: z.enum(['pending', 'converted']),
    convertedDonationId: z.string().nullable().optional(),
    sourceAuctionId: z.string().nullable().optional(),
  })
  .passthrough()

export const backupExpenseSchema = recordBaseSchema
  .extend({
    description: z.string(),
    amount: z.number(),
    date: z.string(),
    categoryId: z.string(),
    notes: z.string().optional(),
    vendorName: z.string().optional(),
    sourceExpectedExpenseId: z.string().nullable().optional(),
    paymentGroup: z.string().optional(),
  })
  .passthrough()

export const backupExpectedExpenseSchema = backupExpenseSchema
  .extend({
    status: z.enum(['pending', 'converted']),
    convertedExpenseId: z.string().nullable().optional(),
  })
  .passthrough()

export const backupAuctionSchema = z
  .object({
    id: z.string(),
    yearProfileId: z.string(),
    item: z.string(),
    person: z.string(),
    amount: z.number(),
    date: z.string(),
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    convertedToExpectedDonationId: z.string().nullable().optional(),
  })
  .passthrough()

export const backupTaskChecklistItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    done: z.boolean(),
  })
  .passthrough()

export const backupTaskSchema = z
  .object({
    id: z.string(),
    yearProfileId: z.string(),
    title: z.string(),
    dueDate: z.string(),
    notes: z.string().optional(),
    done: z.boolean(),
    checklist: z.array(backupTaskChecklistItemSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()

export const backupKeyEventSchema = z
  .object({
    id: z.string(),
    yearProfileId: z.string(),
    name: z.string(),
    date: z.string(),
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()

export const backupPoojaAssignmentSchema = z
  .object({
    id: z.string(),
    yearProfileId: z.string(),
    date: z.string(),
    familyNames: z.string(),
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()

export const backupYearProfileSchema = z
  .object({
    id: z.string(),
    year: z.number(),
    name: z.string(),
    openingBalance: z.number(),
    carryForward: z.boolean(),
    carryForwardSourceYearId: z.string().nullable().optional(),
    status: z.enum(['active', 'archived']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()

export const backupCategorySchema = z
  .object({
    id: z.string(),
    kind: z.enum(['donation', 'expense']),
    name: z.string(),
    active: z.boolean(),
    order: z.number(),
    isDefault: z.boolean(),
  })
  .passthrough()

export const backupUnitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
    order: z.number(),
    isDefault: z.boolean(),
  })
  .passthrough()

export const backupProfileSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['person', 'vendor']),
    name: z.string(),
    order: z.number(),
  })
  .passthrough()

export const backupYearBundleSchema = z
  .object({
    profile: backupYearProfileSchema,
    donations: z.array(backupDonationSchema),
    expectedDonations: z.array(backupExpectedDonationSchema),
    expenses: z.array(backupExpenseSchema),
    expectedExpenses: z.array(backupExpectedExpenseSchema),
    auctions: z.array(backupAuctionSchema),
    // .default([]) so a backup exported before this feature existed still validates — see the
    // identical pattern for settings.profiles below.
    tasks: z.array(backupTaskSchema).default([]),
    keyEvents: z.array(backupKeyEventSchema).default([]),
    poojaAssignments: z.array(backupPoojaAssignmentSchema).default([]),
  })
  .passthrough()

export const backupFileSchema = z
  .object({
    appName: z.string(),
    appVersion: z.string().optional(),
    backupVersion: z.number(),
    exportType: z.enum(['full', 'single-year']),
    exportedAt: z.string(),
    years: z.array(backupYearBundleSchema),
    settings: z
      .object({
        categories: z.array(backupCategorySchema).default([]),
        units: z.array(backupUnitSchema).default([]),
        profiles: z.array(backupProfileSchema).default([]),
        appSettings: z
          .object({
            displayName: z.string().optional(),
            whatsappTemplates: z
              .object({ monetary: z.string(), commodity: z.string() })
              .partial()
              .optional(),
            actionDisplayMode: z.enum(['icon', 'text', 'both']).optional(),
            themePreference: z.enum(['system', 'light', 'dark']).optional(),
            dashboardTaskPreviewCount: z.number().optional(),
            updatedAt: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough()

export type ParsedBackupFile = z.infer<typeof backupFileSchema>
