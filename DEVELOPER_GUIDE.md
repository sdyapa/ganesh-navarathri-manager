# Developer Guide

This is the **code-facing** companion to [`README.md`](README.md). The README explains what the
app does for its user; this document explains **which code implements each of those
functionalities**, how the layers fit together, and what to watch for when changing or extending
them. Read the README first if you haven't — this guide assumes you already know what each
feature does and focuses on where it lives and how it works.

## 1. Architecture at a Glance

Everything is a static, client-only React app. There is no backend — IndexedDB (via Dexie) is
the only datastore, and Google Drive is used purely as a REST API from the browser for optional
off-device backup.

Code is layered strictly in one direction — each layer only calls the one(s) below it, never up:

```
pages/ (React components, one folder per feature area)
   │  reads via hooks, writes via services or repositories directly
   ▼
hooks/ (useLiveQuery wrappers — reactive reads)         services/ (cross-cutting orchestration)
   │                                                        │
   └───────────────────┬────────────────────────────────────┘
                        ▼
              db/repositories/*.ts (the ONLY code that touches `db.<table>` directly)
                        ▼
                   db/db.ts (Dexie schema + version history)
                        ▼
                    IndexedDB (browser)
```

- **`src/types/index.ts`** — every domain type and the backup file format. No logic, just
  shapes. Read this file first when you need to know a record's exact fields.
- **`src/db/`** — `db.ts` (Dexie class + schema versions), `defaults.ts` (built-in category/unit
  names), `init.ts` (first-boot seeding), `repositories/*.ts` (one file per entity — plain CRUD
  functions, the only place `import { db } from '@/db/db'` appears outside `db/` itself).
- **`src/services/`** — logic that spans more than one repository or encodes a business rule:
  year carry-forward (`yearService.ts`), Expected↔Actual conversion including undo
  (`conversionService.ts`), copying Actual records into next year's Expected list
  (`copyForwardService.ts`), backup export/import (`backupExport.ts` / `backupImport.ts`),
  full reset (`resetService.ts`), demo data (`sampleDataService.ts`).
- **`src/lib/`** — pure, dependency-free logic: the financial calculation engine
  (`calculations.ts`), zod validation schemas (`validation.ts`), date/currency formatting,
  WhatsApp template rendering, PDF/PNG export builders, the Google Drive REST client, small
  helpers (`id.ts`, `diff.ts`, `sanitize.ts`, `clipboard.ts`, `tableUtils.ts`).
- **`src/hooks/`** — `useYearData.ts` is a thin `useLiveQuery` wrapper per entity (reactive reads
  that auto-refresh on any write, anywhere); `useYearSummary.ts` composes several of those plus
  `calculations.ts` into the numbers the Dashboard/Reports need; the rest are small
  UI-behavior hooks (`useCloseGuard`, `useUnsavedChangesGuard`, `usePagination`,
  `useWhatsAppShare`, `useDriveBackupReminder`).
- **`src/context/`** — `YearContext` (which year is currently selected, app-wide) and
  `ToastContext` (the bottom/top toast notification queue).
- **`src/components/`** — reusable UI with no feature-specific knowledge: `layout/` (shell, nav,
  top bar), `common/` (Modal, ConfirmDialog, DataTable, Filters, forms scaffolding, export
  buttons, etc.).
- **`src/pages/`** — one folder per feature area. Pages are the only place that wires a hook's
  data to a repository/service call in response to a user action — they hold local UI state
  (which modal is open, current filters) but never talk to `db` directly.

## 2. Feature → Code Map

For each user-facing feature (see README §2 for what it does), this table says exactly which
files implement it.

### 2.1 Years & Carry-Forward

| Layer | File(s) |
|---|---|
| Type | `YearProfile` in `types/index.ts` |
| Repository | `db/repositories/yearProfiles.ts` — `insertYearProfile`, `updateYearProfile`, `deleteYearProfileCascade`, `yearExists` |
| Service | `services/yearService.ts` — `createYearProfile` (auto carry-forward at creation), `applyCarryForwardOpeningBalance` (retroactive), `findMostRecentPriorYear`, `getOrCreateNextYearProfile` (used by Auctions and copy-forward, below), `getYearClosingBalance` |
| Hook/Context | `context/YearContext.tsx` — the app-wide "which year is selected" state; every page reads `currentYearId`/`currentYear`/`years` from here |
| Page | `pages/settings/YearSettings.tsx` |
| Tests | `test/integration.test.ts` → `describe('year carry-forward')`, `describe('retroactive carry-forward into an existing year')` |

Carry-forward never *reruns* a calculation later — `createYearProfile` and
`applyCarryForwardOpeningBalance` both **snapshot** `getYearClosingBalance()`'s result into
`YearProfile.openingBalance` at the moment they're called. If the source year's records change
afterward, the already-created year's opening balance does **not** retroactively change — the
user has to re-run "Carry Forward Balance" from Settings if they want it updated.

### 2.2 Donations & Expected Donations (incl. Convert/Undo)

| Layer | File(s) |
|---|---|
| Types | `Donation`, `ExpectedDonation` in `types/index.ts` |
| Repository | `db/repositories/donations.ts`, `db/repositories/expectedDonations.ts` |
| Service | `services/conversionService.ts` — `convertExpectedDonationToDonation` (Expected→Actual), `revertDonationToExpected` (undo) |
| Hook | `hooks/useYearData.ts` → `useDonations`, `useExpectedDonations` |
| Pages | `pages/donations/DonationsPage.tsx` (Actual), `pages/donations/ExpectedDonationsPage.tsx`, `pages/donations/DonationForm.tsx` (shared by both + the convert flow) |
| Validation | `donationInputSchema` / `expectedDonationInputSchema` in `lib/validation.ts` |
| Tests | `describe('expected -> actual conversion')`, `describe('undo a conversion (move back to Expected)')` |

**How conversion actually works** (this shape is intentional, see the comment atop
`conversionService.ts`): converting never mutates the Expected record into an Actual one in
place. `convertExpectedDonationToDonation` creates a brand-new `Donation` (via
`insertDonation`, tagging it `sourceExpectedDonationId`) and then calls
`markExpectedDonationConverted` to set the *source* record's `status: 'converted'` +
`convertedDonationId`. Nothing is ever deleted. **Undo** (`revertDonationToExpected`) is
therefore just running that relationship backwards: it requires `sourceExpectedDonationId` to be
set (a plain, never-converted Actual donation has nothing to revert *to*), deletes the Actual
record, and flips the source back to `status: 'pending'`, `convertedDonationId: null`.

### 2.3 Expenses & Expected Expenses (incl. Move/Undo, Payment Group)

| Layer | File(s) |
|---|---|
| Types | `Expense` (includes `paymentGroup?: string`), `ExpectedExpense` in `types/index.ts` |
| Repository | `db/repositories/expenses.ts`, `db/repositories/expectedExpenses.ts` |
| Service | `services/conversionService.ts` — `moveExpectedExpenseToExpense`, `revertExpenseToExpected` |
| Hook | `hooks/useYearData.ts` → `useExpenses`, `useExpectedExpenses` |
| Pages | `pages/expenses/ExpensesPage.tsx` (Actual — also owns the Payment Group grouped view), `pages/expenses/ExpectedExpensesPage.tsx`, `pages/expenses/ExpenseForm.tsx` |
| Validation | `expenseInputSchema` / `expectedExpenseInputSchema` in `lib/validation.ts` |
| Tests | mirrors §2.2's tests, on the expense side |

**Payment Group** is intentionally shallow: `Expense.paymentGroup` is a free-text field with no
FK, no Dexie index, and no cross-year registry (unlike Donor/Vendor names — see §2.5). It's
populated from a `<datalist>` in `ExpenseForm.tsx` whose options come from
`ExpensesPage.tsx`'s own `paymentGroupOptions` memo (distinct values already used *this year*),
not from a repository. The "Group by Payment Group" toggle on `ExpensesPage.tsx` computes a
`groupedByPaymentGroup` memo from the already-filtered/sorted list and renders it with plain
markup — it **bypasses `DataTable` entirely** rather than teaching `DataTable` a grouping mode,
so every other list page is unaffected. Nothing in `calculations.ts`, `reportBuilders.ts`,
`pdf.ts`, or `png.ts` ever reads `paymentGroup` — that's what keeps it "visual only".

### 2.4 Auctions

| Layer | File(s) |
|---|---|
| Type | `Auction` in `types/index.ts` |
| Repository | `db/repositories/auctions.ts` — `markAuctionConverted` |
| Service | `services/conversionService.ts` — `convertAuctionToExpectedDonation`; `services/yearService.ts` — `getOrCreateNextYearProfile` |
| Hook | `hooks/useYearData.ts` → `useAuctions` |
| Page | `pages/auctions/AuctionsPage.tsx`, `pages/auctions/AuctionForm.tsx` |
| Tests | `describe('auction -> expected donation conversion')` |

An auction win converts into a **pending Expected Donation in *next* year's Year Profile**
(created automatically via `getOrCreateNextYearProfile` if it doesn't exist yet, carrying this
year's closing balance forward into it) — never an immediate Donation. This is the one
conversion flow with no "undo" action (see README §2.4), since it targets a different year than
the source record and reversing it would need to reach across years.

### 2.5 People & Vendors (Profiles)

| Layer | File(s) |
|---|---|
| Type | `Profile`, `ProfileKind` in `types/index.ts` |
| Repository | `db/repositories/profiles.ts` — `listProfiles`, `upsertProfileFromName`, `renameProfile` (cascades — see below), `deleteProfile` (never cascades), `reorderProfiles` |
| Hook | `hooks/useYearData.ts` → `useProfiles(kind)` |
| Page | `pages/settings/ProfileSettings.tsx` |
| Autocomplete wiring | `<datalist>` in `DonationForm.tsx` / `ExpenseForm.tsx`, bound to `useProfiles('person'|'vendor')` |
| Tests | `describe('reusable profiles (People & Vendors)')` |

**Auto-registration**: every `insertDonation`/`insertExpectedDonation`/`insertAuction`/
`insertExpense`/`insertExpectedExpense` call in its respective repository file ends with
`await upsertProfileFromName(kind, name)` — this is how a name typed once shows up as a
suggestion forever after, with zero explicit "add a person" step. `upsertProfileFromName`
dedupes case-insensitively by `(kind, name)`.

**Rename cascades, delete doesn't** — this is the single most important nuance in this file to
understand before touching `profiles.ts`. Donor/vendor/participant name fields are **plain free
text**, not a foreign key to `Profile.id` (that's what makes the `<datalist>`-autocomplete UX
possible without a schema migration tying every record to a Profile). The tradeoff:
`renameProfile` has to actively find-and-replace the old name across every table it can appear
in (`donations`, `expectedDonations`, `auctions.person`, `expenses.vendorName`,
`expectedExpenses.vendorName`), across **every year**, inside one Dexie transaction — see
`renameFieldAcross()` in `profiles.ts`. `deleteProfile`, by contrast, is just `db.profiles.delete
(id)` — historical records keep whatever name they already have, which is fine precisely because
there's no FK to break.

**Backup import auto-registration** — see §2.9 below; this is where the bug fixed on
2026-08-31 lived (replace-all mode's `db.profiles.bulkAdd` only seeded whatever was *explicit*
in the backup, unlike every other import mode).

### 2.6 Copy Actual → Expected (Recurring Items)

| Layer | File(s) |
|---|---|
| Service | `services/copyForwardService.ts` — `copyExpensesToExpected`, `copyDonationsToExpected` |
| Component | `components/common/CopyToYearModal.tsx` (shared year-picker; exports `NEXT_YEAR_VALUE`) |
| DataTable support | `components/common/DataTable.tsx`'s optional `selection` prop (checkboxes) |
| Pages | `ExpensesPage.tsx` / `DonationsPage.tsx` — `selectedIds` state, `toggleSelected`/`toggleSelectAllOnPage`, "Copy N to Expected …" button |
| Tests | `describe('copy Actual records forward to Expected (recurring items)')` |

Each function takes an array of source-record ids and a `targetYearId`, reads each source record
(`getExpense`/`getDonation`), and calls `insertExpectedExpense`/`insertExpectedDonation` with a
**freshly built input** (today's date as the expected date, source amount/category/notes/vendor
carried over) — the source record itself is never touched. `NEXT_YEAR_VALUE` is a sentinel the
modal uses so "copy into next year" can offer a not-yet-created year as an option; the page
resolves it via `getOrCreateNextYearProfile` only once the user actually confirms.

### 2.7 Tasks

| Layer | File(s) |
|---|---|
| Types | `Task`, `TaskChecklistItem` in `types/index.ts` |
| Dexie table | `tasks: 'id, yearProfileId, dueDate, done'` (added in `db.ts` v4) |
| Repository | `db/repositories/tasks.ts` — `insertTask`, `updateTask`, `deleteTask`, `setTaskDone`, `addChecklistItem`/`toggleChecklistItem`/`removeChecklistItem` |
| Hook | `hooks/useYearData.ts` → `useTasks` |
| Page | `pages/tasks/TasksPage.tsx`, `pages/tasks/TaskForm.tsx` |
| Validation | `taskInputSchema` in `lib/validation.ts` (`checklistItems: string[]`, only consumed at creation) |
| Tests | `describe('Tasks and checklists')` |

The checklist is an **embedded array on the `Task` record itself**, not a separate Dexie table —
deliberately, since a checklist item is never queried independently of its parent task. All
three checklist-mutation functions in `tasks.ts` follow the same shape: read the task, produce a
new `checklist` array, `db.tasks.update(id, { checklist, updatedAt })`. `TaskForm.tsx` only
shows the "Checklist Items" textarea when its `showChecklistInput` prop is true (Add mode only —
editing a task never touches its checklist; that's managed live from the task card instead).

### 2.8 Festival Calendar (Key Events & Pooja Roster)

| Layer | File(s) |
|---|---|
| Types | `KeyEvent`, `PoojaAssignment` in `types/index.ts` |
| Dexie tables | `keyEvents: 'id, yearProfileId, date'`, `poojaAssignments: 'id, yearProfileId, date'` (both added in `db.ts` v4) |
| Repository | `db/repositories/keyEvents.ts`, `db/repositories/poojaAssignments.ts` |
| Hook | `hooks/useYearData.ts` → `useKeyEvents`, `usePoojaAssignments` |
| Page | `pages/calendar/CalendarPage.tsx` (tab switcher) → `KeyEventsSection.tsx` / `PoojaRosterSection.tsx` |
| Validation | `keyEventInputSchema`, `poojaAssignmentInputSchema` in `lib/validation.ts` |
| Tests | `describe('festival calendar (Key Events + Pooja Roster)')` |

Both sections use a lighter UI pattern than most pages — no `Modal`-based Add/Edit form, just an
inline add-row + inline per-item edit toggle (same idea as `ProfileSettings.tsx`'s rename UI),
since each record is only 2–3 fields. `PoojaAssignment.familyNames` is one free-text field
(comma-separated), not a multi-select against the Profile registry — a deliberate simplicity
tradeoff (see README §10, Known Limitations).

### 2.9 Backup Export / Import / Reset

This is the most cross-cutting piece of the codebase — touching it means touching four files
together. Get familiar with `backupImport.ts` before changing any record type.

| Layer | File(s) |
|---|---|
| Format | `BackupFile`, `YearProfileBundle`, `BACKUP_SCHEMA_VERSION` in `types/index.ts` |
| Export | `services/backupExport.ts` — `buildYearBundle` (one year's full record set), `exportYearBackup`, `exportFullBackup` |
| Validation | `lib/validation.ts` — `backupFileSchema` and all the `backup*Schema` pieces it's built from |
| Import | `services/backupImport.ts` — `inspectBackupFile` (safe, read-only parse+summarize), `applyBackupImport` (the actual writes, gated by `ImportMode`) |
| Reset | `services/resetService.ts` — `getResetImpact`, `resetApplication` |
| Page | `pages/settings/DataManagement.tsx` |
| Tests | `describe('backup export/import round trip')` + every entity's own "round-trips through a full backup" test |

**`applyBackupImport` has two structurally different code paths** — this is the single easiest
place to introduce a bug when adding a new record type (see the incident note below):

1. **`mode === 'replace-all'`**: clears every table, then `bulkAdd`s everything back —
   categories/units/profiles from `backup.settings.*` verbatim, then each year's records
   straight from its bundle. Fast, but **anything derived rather than explicitly stored** (like
   Profile auto-registration) has to be done *again*, manually, after the bulk-adds — it does
   NOT reuse the per-record insert path that would normally do that derivation.
2. **`'add-new' | 'skip-duplicates' | 'replace-year'`**: one shared loop that resolves/creates
   each target year, then walks every record **one at a time**, remapping category/unit ids via
   `CategoryUnitResolver`, generating a fresh id (except in `replace-year` mode, which keeps the
   original id), checking a dedupe key when `skip-duplicates` is active, and — critically —
   calling `upsertProfileFromName` right after each `db.<table>.add(record)`. This is where
   Profile auto-registration "just happens" for these three modes.

> **Incident (fixed 2026-08-31)**: the real 2025 legacy-Excel-migration backup has no explicit
> `settings.profiles` array (it predates the Profiles feature — `backupFileSchema` defaults it
> to `[]`). Importing it with **"Replace entire database"** left People & Vendors completely
> empty, because path 1 above only ever bulk-adds the explicit (here: empty) list and never
> re-derives from the records it just inserted. Fixed by adding the same per-record
> `upsertProfileFromName` calls to the end of path 1's per-bundle loop. See the regression test
> `'registers profiles from a backup with NO explicit profiles list even under "replace entire
> database" mode'`.

**Adding a new year-scoped entity** (the pattern Tasks/KeyEvents/PoojaAssignments followed, and
what any future one must repeat) means touching, in order:

1. `types/index.ts` — the record type, and add its array to `YearProfileBundle`.
2. `db/db.ts` — a new table in a **new** Dexie `.version(n)` block (never edit an old version
   block once shipped).
3. `db/repositories/<entity>.ts` — plain CRUD, same shape as every existing repository.
4. `lib/validation.ts` — an input schema (form validation) and a `backup<Entity>Schema`
   (`.default([])` on its array in `backupYearBundleSchema` so older backups still validate).
5. `services/backupExport.ts` — add the `list<Entity>ForYear` call to `buildYearBundle`.
6. `services/backupImport.ts` — **both** code paths: the `replace-all` bulk-add block (plus, if
   the entity has a name-bearing field that should feed Profiles, the derivation loop — see the
   incident above) AND the merge-mode per-bundle loop (insert + optional dedupe key).
7. `services/resetService.ts` — add to both `getResetImpact` and `resetApplication`, or the new
   table silently survives a "Reset Application".
8. `hooks/useYearData.ts` — a `use<Entity>` live-query hook.
9. A page/component to actually use it, and a nav entry in `components/layout/navItems.ts` +
   route in `App.tsx` if it's a new top-level section.
10. Tests in `test/integration.test.ts` (and `test/validation.test.ts` if the input schema has
    interesting edge cases).

Skipping step 6's `replace-all` derivation, or step 7 entirely, is exactly how the incident above
happened and how a "Reset Application" could leave orphaned data behind — both are easy to miss
because the other three import modes (and a plain in-app add/edit/delete) work correctly without
that extra step, so nothing looks wrong until someone specifically imports via replace-all or
resets the app.

### 2.10 Dashboard, Reports & the Financial Calculation Engine

| Layer | File(s) |
|---|---|
| Engine | `lib/calculations.ts` — `computeFinancialSummary`, `computeCategoryTotals`, `computeCommodityTotals`, `computeDailyTrend` (pure functions, zero DB/React dependency by design, so `test/calculations.test.ts` can hit them directly) |
| Hook | `hooks/useYearSummary.ts` — the one place every dashboard/report screen gets its numbers from; composes the live-query hooks + `calculations.ts` |
| Pages | `pages/Dashboard.tsx`, `pages/reports/ReportsPage.tsx` |
| Tests | `test/calculations.test.ts`, plus the closing-balance assertions scattered through `integration.test.ts` |

`FinancialSummary.closingBalance = openingBalance + totalMonetaryDonations - totalExpenses` —
**auction proceeds and all Expected amounts are excluded on purpose** (see the "Hard rules"
comment at the top of `calculations.ts`). Two independent bugs were fixed here across earlier
work: (1) `closingBalance` used to add `totalAuctionProceeds` before the "pledge, not cash" rule
was enforced consistently; (2) `ReportsPage.tsx`'s and `useYearSummary.ts`'s *separate*
`donationCategoryTotals` computations each independently folded a synthetic `__auction__`
category into "Donations by Category" — both had to be found and fixed separately since they
don't share code. If you add a third place that computes category totals, make sure it filters
to `type === 'monetary'` first, same as these two.

**Overall Summary PDF** (`Dashboard.tsx`'s `handleExportOverallSummary`) uses
`buildOverallSummaryLines` (in `lib/export/reportBuilders.ts`) instead of the normal
`buildSummaryLines` — the only difference is it omits the two "Expected …" lines, since a
season-end shareable report shouldn't show pending pledges as if they were relevant anymore.

### 2.11 WhatsApp Sharing

| Layer | File(s) |
|---|---|
| Template engine | `lib/whatsapp.ts` — `renderWhatsAppTemplate` (plain string `.replace()`, **never** `eval`/`Function`/a template-compiler, so a template from an imported backup can't execute code), `buildWhatsAppContext` |
| Settings | `AppSettings.whatsappTemplates`, defaults in `db/defaults.ts`, edited via `pages/settings/WhatsAppSettings.tsx` |
| Hook | `hooks/useWhatsAppShare.ts` — `buildMessage`/`shareDonation` (copies to clipboard via `lib/clipboard.ts`) |
| Tests | `test/whatsapp.test.ts` |

### 2.12 PDF & PNG Export

| Layer | File(s) |
|---|---|
| Shared table-building | `lib/export/reportBuilders.ts` — one `build<Entity>Table()` function per record type, each taking an `AmountFormatter` parameter |
| PDF | `lib/export/pdf.ts` — `buildPdfReport` (dynamic-imports `jspdf`/`jspdf-autotable`), `lib/export/pdfUnicodeText.ts` (rasterizes non-Latin text to an image, since jsPDF's built-in fonts can't render it) |
| PNG (charts/dashboard) | `lib/export/png.ts` → `exportElementAsPng` — screenshots a real DOM element (used where the on-screen content, e.g. charts, is worth capturing visually) |
| PNG (list pages) | `lib/export/png.ts` → `exportTableReportAsPng` — builds a **synthetic offscreen `<table>`** from the same `{head, rows}` data as the PDF, instead of screenshotting the live interactive page |

**Why two different PNG functions exist**: `exportElementAsPng` used to be used everywhere, but
screenshotting the live Donations/Expenses/Auctions tables captured the Edit/Delete/Copy-
WhatsApp action buttons and pagination controls right along with the data, and produced one very
tall image for any real transaction volume. `exportTableReportAsPng` fixed both by rendering a
plain, self-contained table with the app's own `.data-table` CSS class instead of capturing the
interactive DOM. `exportElementAsPng` is kept for the Dashboard summary and Reports charts, where
the on-screen visual (charts, stat cards) genuinely is what you want captured.

`reportBuilders.ts`'s `AmountFormatter` parameter exists because jsPDF's Base14 fonts can't
render the ₹ glyph — PDF call sites pass `formatCurrencyForPdf` (a "Rs." prefix fallback); PNG
call sites render real DOM/canvas text with no such limitation, so they pass `formatCurrency`.

### 2.13 Configurable Categories, Units & Sorting

| Layer | File(s) |
|---|---|
| Repositories | `db/repositories/categories.ts`, `db/repositories/units.ts` — both follow the identical shape: `insert`/`rename`/`setActive`/`reorder`/`isInUse`/hard-`delete`/`restoreDefault*` |
| Pages | `pages/settings/CategorySettings.tsx`, `pages/settings/UnitSettings.tsx` |
| Sort control | `components/common/Filters.tsx` → `SortControl`; `lib/tableUtils.ts` → `sortByKey(rows, key, direction)` |

**"In use" gates hard delete, not soft state**: `isCategoryInUse`/`isUnitInUse` check whether any
Donation/ExpectedDonation/Expense/ExpectedExpense anywhere references the id; if so, the UI
offers deactivation (`setActive(id, false)`) instead of `deleteCategory`/`deleteUnit`, so a
historical record's displayed category/unit name never silently changes. `restoreDefault*`
re-adds/reactivates the built-ins by name-match without ever duplicating one that's already
present and active.

**Sort control**: every list page builds a `sortOption` string shaped `"<field>-<asc|desc>"`
(e.g. `"date-desc"`, `"amount-desc"`, `"donorName-asc"`) and does
`sortByKey(filteredRows, ...sortOption.split('-'))` — `sortByKey` is a single generic helper
reused by every page rather than each page writing its own comparator.

## 3. Cross-Cutting Systems

These aren't features on their own, but almost every feature above depends on them.

### 3.1 Validation (`lib/validation.ts`)

One `zod` schema per input type, shared by **both** the form that produces it and the backup
importer that validates a file claiming to contain it. Backup schemas use `.passthrough()`
liberally (an unknown field from a newer app version survives a round-trip instead of being
stripped) and `.default([])` on any array added after the app's initial release, so an older
backup that predates a field/table still validates — see `test/validation.test.ts` for the
exact cases this guards (malformed files, a from-the-future `backupVersion`, missing arrays).

### 3.2 Dates & Currency

`lib/date.ts` stores/parses dates as plain `"YYYY-MM-DD"` strings and **never** via
`new Date(dateString)` (UTC-based, can shift the day depending on the viewer's timezone) — every
`Date` object it builds comes from explicit local `(year, month, day)` components. `lib/date.ts`
also owns `nowIso()` for `createdAt`/`updatedAt` bookkeeping timestamps (those *are* allowed to
be UTC ISO strings, since timezone-shifting a bookkeeping timestamp is harmless, unlike shifting
a financial date). `lib/currency.ts` handles `en-IN` formatting (`formatCurrency`,
`formatCurrencyForPdf`, `formatNumber`).

### 3.3 IDs

`lib/id.ts`'s `generateId()` is `crypto.randomUUID()` with a fallback for very old browsers.
Every repository's `insert*` function calls this — ids are never sequential/auto-incrementing,
which matters for backup import's id-remapping (merge modes generate a fresh id per imported
record precisely so two databases' records never collide on import).

### 3.4 Forms: Unsaved-Changes Guard & the Confirm-Diff Pattern

Two small, reused patterns worth knowing before adding a new form:

- **`useCloseGuard`** (`hooks/useCloseGuard.tsx`) — every `*Form.tsx` component uses this. It
  compares the form's current values to its initial values (`JSON.stringify` equality — fine
  since every form's values object is a flat record of strings) and intercepts an in-app close
  (Cancel, backdrop click, Escape) with a "Discard Unsaved Changes?" confirmation if they differ.
- **Confirm-before-save diff** — every edit flow (`handleEditSubmit` in each `*Page.tsx`) builds
  a field-by-field diff via `lib/diff.ts`'s `diffFields()` and, if there's at least one change,
  shows it in a `<ConfirmDialog>` with `<FieldDiffList>` before actually calling
  `update<Entity>()`. If `diffFields` finds zero changes, the modal just closes with no confirm
  step and no DB write.

  > **One dialog at a time, not two stacked.** `handleEditSubmit` calls `setModal({ mode:
  > 'closed' })` in the same breath as `setPendingEdit(...)` — the edit form's `Modal` unmounts
  > the instant the confirm step takes over, rather than staying open (dimmed) underneath the
  > `<ConfirmDialog>`. Earlier this stacked two near-identical-looking dialogs — both titled
  > around "Save Changes" — which a real user reported as the app "getting stuck" (nothing
  > *was* stuck; the second, actually-actionable dialog was just easy to miss/misread as a
  > duplicate of the first). Fixed by (1) closing the edit form on handoff, so only the confirm
  > dialog is ever visible, and (2) relabeling the two steps distinctly — the edit form's submit
  > button reads **"Review Changes"**, the confirm dialog's reads **"Confirm & Save"** — instead
  > of both saying "Save Changes". Apply the same pair (`setModal({mode:'closed'})` +
  > `setPendingEdit(...)` together, "Review Changes" / "Confirm & Save" labels) to any new
  > edit-with-confirm flow.

### 3.5 `Modal.tsx`'s Focus-Management Fix

Worth knowing if you ever touch `components/common/Modal.tsx`: its focus-trap `useEffect`
depends on `[]`, not `[onClose]`, reading the latest `onClose` via a ref
(`onCloseRef.current = onClose`) instead. This was a deliberate fix — callers commonly pass a
freshly-created closure each render (e.g. `useCloseGuard`'s `requestClose`), and depending on
`[onClose]` directly caused the effect to re-run — and steal focus back to the dialog — on every
single keystroke in every form app-wide. Don't "simplify" this back to `[onClose]`.

### 3.6 Responsive Tables: `DataTable.tsx`

Renders **both** a desktop `<table>` (`.table-responsive--desktop`, shown ≥760px) and a mobile
card list (`.record-cards--mobile`, shown <760px) from the same `columns`/`renderCard` props —
CSS media queries pick which one is visible, both are always in the DOM. Its optional
`selection` prop (checkboxes on both renderings) is what powers the copy-forward bulk-select UI
(§2.6) without touching any page that doesn't pass it.

> **Gotcha**: `.record-cards--mobile` is `display: none` above 760px by design (it's the mobile
> half of DataTable's dual rendering). A page that renders card-style markup **without** a
> parallel desktop table — Tasks (§2.7) and the Payment Group grouped view (§2.3) both do this —
> must use the separate `.card-list` class instead (same visual styling, but visible at every
> width). Using `.record-cards--mobile` there makes the whole list invisible on desktop; this
> exact mistake was caught and fixed once already while building the Tasks page.

## 4. Testing Map

| File | Covers |
|---|---|
| `test/calculations.test.ts` | The financial engine in isolation — worked examples, carry-forward math, commodity unit-separation, category totals |
| `test/date.test.ts` | Timezone-safety of date parsing/formatting |
| `test/currency.test.ts` | `en-IN` currency formatting |
| `test/validation.test.ts` | Every zod input schema + the full backup-file schema (malformed files, future schema versions) |
| `test/whatsapp.test.ts` | Template placeholder substitution never executes code |
| `test/integration.test.ts` | Everything else, end-to-end against a real (fake) IndexedDB — see the `describe()` block names, they map almost 1:1 to §2's subsections above |

`test/integration.test.ts` always starts from `resetApplication()` in a `beforeEach`, so every
test gets a clean database — tests that need a specific year use a distinctive fake year number
(e.g. `3050`, `3097`) purely to avoid collisions with the auto-created current-calendar-year
profile and with each other in shared assertions, not because the year number itself matters.

## 5. Conventions Checklist for New Work

- New Dexie table or a new **indexed** field → bump the Dexie version in `db/db.ts` with a new
  `.version(n)` block (never edit a shipped version block). A new *plain, unindexed* field on an
  existing table does **not** need a version bump.
- New year-scoped entity → follow the 10-step checklist in §2.9 exactly, in order. Steps 6
  (`replace-all`'s derivation) and 7 (reset) are the two most commonly missed.
- New optional field with a "reports/exports must never see this" requirement (like Payment
  Group) → don't reference it in `calculations.ts`, `reportBuilders.ts`, `pdf.ts`, or `png.ts`,
  and say so explicitly in the field's doc comment in `types/index.ts` so the next person
  doesn't "helpfully" wire it in later.
- New free-text name field that should behave like Donor/Vendor autocomplete → reuse the
  `Profile`/`upsertProfileFromName` registry (§2.5) rather than inventing a second one, unless
  there's a specific reason not to (Payment Group and Pooja Roster family names both deliberately
  opted out — see their sections above for why).
- Card-only list view with no parallel desktop table → use `.card-list`, not
  `.record-cards--mobile` (§3.6).
- Any new `*Form.tsx` → wire up `useCloseGuard` and the confirm-before-save diff pattern (§3.4)
  for consistency with every existing form.
