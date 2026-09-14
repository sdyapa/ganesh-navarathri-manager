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
  the on-launch local backup (`localBackupService.ts`), full reset (`resetService.ts`), demo
  data (`sampleDataService.ts`).
- **`src/lib/`** — pure, dependency-free logic: the financial calculation engine
  (`calculations.ts`), zod validation schemas (`validation.ts`), date/currency formatting,
  WhatsApp template rendering, PDF/PNG export builders, the Google Drive REST client, the File
  System Access API wrapper (`localBackup.ts`), small helpers (`id.ts`, `diff.ts`, `sanitize.ts`,
  `clipboard.ts`, `tableUtils.ts`).
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
| Types | `Donation`, `ExpectedDonation` in `types/index.ts` — `ExpectedStatus = 'pending' \| 'partially-paid' \| 'converted'` |
| Repository | `db/repositories/donations.ts` (incl. `sumDonationAmounts`), `db/repositories/expectedDonations.ts` (incl. `updateExpectedDonationPaymentState`) |
| Service | `services/conversionService.ts` — `convertExpectedDonationToDonation` (Expected→Actual, one shot), `recordPartialPayment` (Expected→Actual, N installments), `revertDonationToExpected` (undo, either path) |
| Calculation | `lib/calculations.ts` — `computeOutstandingPledgeAmount` |
| Hook | `hooks/useYearData.ts` → `useDonations`, `useExpectedDonations` |
| Pages | `pages/donations/DonationsPage.tsx` (Actual), `pages/donations/ExpectedDonationsPage.tsx`, `pages/donations/DonationForm.tsx` (shared by both + the convert/partial-payment flows) |
| Validation | `donationInputSchema` / `expectedDonationInputSchema` in `lib/validation.ts`; `backupExpectedDonationSchema` (`installmentDonationIds`, extended `status` enum) |
| Tests | `describe('expected -> actual conversion')`, `describe('part payments (installments) for donation/auction pledges')`, `describe('undo a conversion (move back to Expected)')` |

**How conversion actually works** (this shape is intentional, see the comment atop
`conversionService.ts`): converting never mutates the Expected record into an Actual one in
place. `convertExpectedDonationToDonation` creates a brand-new `Donation` (via
`insertDonation`, tagging it `sourceExpectedDonationId`) and then calls
`markExpectedDonationConverted` to set the *source* record's `status: 'converted'` +
`convertedDonationId`. Nothing is ever deleted. **Undo** (`revertDonationToExpected`) is
therefore just running that relationship backwards: it requires `sourceExpectedDonationId` to be
set (a plain, never-converted Actual donation has nothing to revert *to*), deletes the Actual
record, and flips the source back to `status: 'pending'`, `convertedDonationId: null` — or, for
one installment of a still-partial pledge, back to `status: 'partially-paid'` instead (see below).

**Part payments (`recordPartialPayment`) are `convertExpectedDonationToDonation` generalized to N
calls instead of exactly 1** — a donor or auction winner paying a pledge in installments rather
than all at once. Each call: (1) creates a real `Donation` for the installment amount via the
same `insertDonation` path a one-shot conversion uses (so it's auditable and hits the actual
balance immediately — see §2.10's "Hard rules"), (2) appends that Donation's id to the pledge's
`installmentDonationIds` array, (3) sums those installments' actual amounts via
`sumDonationAmounts` to get the running total collected, and (4) sets `status` to `'converted'`
(with `convertedDonationId` pointing at the *final* installment — same semantics as a one-shot
conversion) once that total reaches the full `amount`, or `'partially-paid'` otherwise. A pledge
never stores a running "amount paid" counter directly — it's always derived from summing the
installments' own `Donation.amount` fields, so there's no redundant state that could drift out of
sync with the actual records. Undoing one installment (`revertDonationToExpected`) removes just
that id from `installmentDonationIds`, dropping the pledge back to `'partially-paid'` if other
installments remain, or all the way to `'pending'` (with `installmentDonationIds` cleared) if
that was the only one. This is exactly why `installmentDonationIds` lives on `ExpectedDonation`
rather than a new parallel entity — it reuses the entire existing convert/undo/audit machinery.

**`computeOutstandingPledgeAmount(pledge, donations)`** (`lib/calculations.ts`) is what makes a
partially-paid pledge report correctly as "expected" without double-counting: it returns
`pledge.amount` untouched for a plain pending pledge with no installments yet, or
`pledge.amount - sum(installment amounts)` (floored at 0) once at least one installment exists.
`computeFinancialSummary` calls this per pledge instead of a flat `sum(pledges.map(amount))`, and
widened its pending-pledge filter from `status === 'pending'` to `status !== 'converted'` so a
`'partially-paid'` pledge doesn't silently drop out of the "Expected" totals the moment its first
installment lands. `ExpectedDonationsPage.tsx`'s default status filter is similarly `'outstanding'`
(covers both `'pending'` and `'partially-paid'`), not a strict `'pending'` match, for the same
reason on the UI side.

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

### 2.6 Copy Forward to Next Year (Recurring Items)

| Layer | File(s) |
|---|---|
| Service | `services/copyForwardService.ts` — `copyExpensesToExpected`, `copyDonationsToExpected`, `copyTasksToYear` |
| Component | `components/common/CopyToYearModal.tsx` (shared year-picker; exports `NEXT_YEAR_VALUE`; optional `description` prop overrides the default "...as pending Expected records..." body copy for callers like Tasks where that wording doesn't apply) |
| DataTable support | `components/common/DataTable.tsx`'s optional `selection` prop (checkboxes) — Tasks uses its own lighter-weight `selectedIds`/`toggleSelected` state directly on the card list instead, since it isn't `DataTable`-based |
| Pages | `ExpensesPage.tsx` / `DonationsPage.tsx` — `selectedIds` state, `toggleSelected`/`toggleSelectAllOnPage`, "Copy N to Expected …" button. `TasksPage.tsx` — same `selectedIds` pattern, "Copy N tasks to Next Year" button |
| Tests | `describe('copy Actual records forward to Expected (recurring items)')` in `integration.test.ts` |

Each function takes an array of source-record ids and a `targetYearId`, reads each source record
(`getExpense`/`getDonation`/`getTask`), and inserts a **freshly built record** in the target year
— the source record itself is never touched. `copyExpensesToExpected`/`copyDonationsToExpected`
default the copy's date to today (the amount is what matters; the user retypes the real date once
known). `copyTasksToYear` instead shifts the task's `dueDate` by the exact year gap via
`addYears()` (`lib/date.ts`) — a due date is meaningful on its own, so a recurring task like "Book
priest" should land on the same festival day next year automatically rather than resetting to
today or requiring the date to be re-picked by hand — and copies checklist items across reset to
unchecked (a copy is a new occurrence, not a continuation of last year's progress). `NEXT_YEAR_VALUE`
is a sentinel the modal uses so "copy into next year" can offer a not-yet-created year as an
option; the page resolves it via `getOrCreateNextYearProfile` only once the user actually confirms.

### 2.7 Tasks

| Layer | File(s) |
|---|---|
| Types | `Task`, `TaskChecklistItem` in `types/index.ts` |
| Dexie table | `tasks: 'id, yearProfileId, dueDate, done'` (added in `db.ts` v4) |
| Repository | `db/repositories/tasks.ts` — `insertTask`, `getTask`, `updateTask`, `deleteTask`, `setTaskDone`, `addChecklistItem`/`toggleChecklistItem`/`removeChecklistItem` |
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

Tasks can also be copied forward to another year — see §2.6 above (`copyTasksToYear`).

**Search includes checklist item labels** — `TasksPage.tsx`'s `filtered` memo calls
`matchesSearch([t.title, t.notes, ...t.checklist.map((c) => c.label)], search)` (`lib/tableUtils.ts`).
`matchesSearch` itself needed no change — it already accepts a flat `Array<string | undefined>`,
so checklist labels are simply spread into the haystack alongside the task's own fields. This was
the one list page missing a `SearchInput` at all until this feature.

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

**Search**: both sections had zero filter/search UI until this feature — they now each carry
their own local `search` state and a bare `<input type="search">` above the list (not the full
`FilterBar`/`SearchInput` combo the heavier list pages use, since these sections never adopted
`FilterBar`'s styling to begin with), filtering their `sorted` memo via the same `matchesSearch`
helper before sorting: `KeyEventsSection` on `[e.name, e.notes]`, `PoojaRosterSection` on
`[a.familyNames, a.notes]`. The empty-state message distinguishes "no entries at all" from "no
entries match this search" so a stale-looking empty list doesn't read as data loss.

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

**Import from GitHub** (`lib/githubImport.ts`) is a second way to get a backup's JSON into the
same pipeline above — it never touches `applyBackupImport`/`inspectBackupFile` itself, it just
produces the same `unknown` payload the file-picker's `FileReader.onload` does, then hands it to
the identical `inspectAndStage()` helper in `pages/settings/DataManagement.tsx`. Three pieces:

- `toGitHubRawUrl(input)` — normalizes either a `github.com/.../blob/<ref>/<path>` URL or an
  already-raw `raw.githubusercontent.com` URL down to the raw-content URL to fetch; returns
  `null` (never throws) for anything else, so a garbage/non-GitHub URL fails with a clear message
  instead of silently trying to fetch an arbitrary site.
- `listGitHubBackupFiles(owner, repo, branch, basePath = 'backups')` — recursively walks GitHub's
  public Contents API (`api.github.com/repos/.../contents/<path>`) starting at `basePath`
  (matching this repo's own `backups/` convention — see `backups/README.md`) and returns every
  `.json` file found, newest path first. No auth token is ever sent — this only works against
  **public** repos, deliberately (same "no backend, no secrets" posture as `lib/googleDrive.ts`).
  Unauthenticated GitHub API calls are capped at 60 requests/hour per IP; each subfolder visited
  is one request, so this is fine for occasional use but shouldn't be polled.
- `detectOwnRepo()` — reads `window.location` to guess this deployment's own `owner`/`repo`
  automatically, since a GitHub Pages *project* page is always served from exactly
  `<owner>.github.io/<repo>/...`. Returns `null` for local dev or a user/org root page, where
  there's nothing to guess; the Settings UI falls back to letting the user type both fields in.
- `fetchBackupFromGitHub(urlOrRawUrl)` — fetches + JSON-parses, returning a `{ok: true, data}` /
  `{ok: false, error}` result rather than throwing, so `DataManagement.tsx` can show the error
  inline the same way a malformed local file already does.

`pages/settings/DataManagement.tsx`'s "Import from GitHub" subsection is the primary UI (browse
`backups/`, click Import… next to a listed file); a collapsed `<details>` underneath keeps the
older "paste one exact file link" flow available for a file outside the auto-detected `backups/`
convention, or a repo where browsing isn't wanted.

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

**Closing Balance gauge** (`components/common/BalanceGauge.tsx`) — a speedometer-style SVG gauge
rendered in `Dashboard.tsx` right above the `stat-grid`, replacing an earlier flat-text
"balance-banner" that itself replaced a `<StatCard>` in the grid — a real user reported the
original stat-card version was "difficult to find … mixed along the other tiles", and once a
plain colored-text banner was shipped as the fix, asked specifically for "speedometer like
graphics", i.e. an actual gauge-with-needle rather than a text callout. `<StatCard
label="Closing Balance">` was removed from the grid entirely rather than kept as a duplicate.

The needle position is `computeSpentFraction(openingBalance, totalMonetaryDonations,
totalExpenses)` (`lib/calculations.ts`) — the fraction of funds available so far that's already
been spent, 0 at the far left (nothing spent) through 1 at the far right (every rupee raised has
been spent); it can exceed 1 once spending goes negative, which the gauge clamps visually while
still coloring the number red. Deliberately plain SVG + trigonometry (`polarToCartesian`/
`arcPath` in `BalanceGauge.tsx`), not a chart library — this is one static shape, not worth
pulling `chart.js` (already lazy-loaded, and only for the Reports page) in for. Zone/needle
colors are hardcoded hex values, not `var(--color-*)` tokens, for the same reason every other
export-relevant visual in this app avoids theme tokens (see §2.16's theme gotchas) — the gauge
needs to look identical in a PNG export regardless of the active theme, and `exportElementAsPng`
(Dashboard's existing PNG export) captures it as part of the live DOM with no special-casing
needed.

**Dashboard "Heads Up"** (`.heads-up`/`.heads-up__*` classes) — a short preview of the soonest-
due pending Tasks, rendered directly below the balance gauge:
```ts
const upcomingTasks = useMemo(() => {
  if (!tasks) return []
  return sortByKey(tasks.filter((t) => !t.done), 'dueDate', 'asc').slice(0, taskPreviewCount)
}, [tasks, taskPreviewCount])
```
Reuses `useTasks(currentYearId)` (`hooks/useYearData.ts`) and the same `sortByKey` helper every
list page's sort control already uses (§2.13) — no new sorting logic. `taskPreviewCount` comes
from `AppSettings.dashboardTaskPreviewCount` (default `3`, portable — travels in backups exactly
like `actionDisplayMode`/`themePreference`, see §2.9's incident note for why every new
`AppSettings` field needs the same three touch points: `db/defaults.ts`'s default constant,
`withAppSettingsDefaults`'s backfill, and the backup export/import/validation trio). Setting it
to `0` hides the section entirely (`taskPreviewCount > 0 && upcomingTasks.length > 0` guards the
render) rather than showing an empty box. Edited from **Settings → Appearance**
(`AppearanceSettings.tsx`), which follows `GoogleDriveSettings.tsx`'s existing "local draft state
synced from the field alone, not the whole settings object" pattern for a free-typed number
input (see that file's own comment for why depending on the whole object would clobber an
unsaved keystroke the moment any other setting on the page saves).

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

> **Tiebreak bug (fixed)**: `sortByKey` used to sort ascending (stable, so same-value rows kept
> their original array order) and then `.reverse()` the whole array for `'desc'` — but
> `.reverse()` also flips that preserved tie order. A user hit this directly: adding a second
> expense on the same date made it show up *second* under "Date (Newest first)" instead of on
> top, since the older same-day row's insertion-order advantage got inverted along with
> everything else. Fixed by comparing directly with the sign flipped for `'desc'` (multiply the
> comparator's result by `-1`) instead of sort-then-reverse, which keeps insertion order as the
> tiebreak in both directions. See `test/tableUtils.test.ts`'s regression test for the exact
> before/after case. Don't reintroduce a sort-ascending-then-`.reverse()` pattern anywhere new.

### 2.14 Row Action Icons & Display Mode

| Layer | File(s) |
|---|---|
| Type | `ActionDisplayMode = 'icon' \| 'text' \| 'both'`, `AppSettings.actionDisplayMode` in `types/index.ts` — default `'text'` |
| Icons | `lib/actionIcons.ts` — one named emoji constant per action (`EDIT_ICON`, `DELETE_ICON`, `DUPLICATE_ICON`, `COPY_ICON`, `MOVE_ICON`, `REVERT_ICON`, `DONE_ICON`/`UNDO_DONE_ICON`) |
| Component | `components/common/ActionButton.tsx` — drop-in replacement for `<button className="link-button">Label</button>`; reads `useActionDisplayMode()` (`hooks/useYearData.ts`) and renders icon/text/both accordingly |
| Settings | `pages/settings/AppearanceSettings.tsx`, wired into `SettingsPage.tsx`'s `SECTIONS` |
| Tests | `describe('appearance settings (action display mode + theme)')` in `integration.test.ts` |

Emoji, not an SVG/icon-font set — see the doc comment at the top of `actionIcons.ts` for why
(they carry their own color, so both themes get free legibility with no `currentColor` work).
`ActionButton` is used at every row-action call site across the list pages, Tasks, Calendar, and
the Categories/Units/Profiles settings lists — a mechanical swap-in with no behavior change
beyond the rendering mode. `.link-button`'s CSS gained a `display:inline-flex;gap:4px` (harmless
for text-only) and a `.link-button--icon-only` modifier (drops the underline, which looks wrong
on an emoji).

### 2.15 Duplicate Entries

| Layer | File(s) |
|---|---|
| Pages | `DonationsPage`/`ExpectedDonationsPage`, `ExpensesPage`/`ExpectedExpensesPage`, `AuctionsPage` — each gained a `{ mode: 'duplicate'; record: X }` branch on its `ModalState` union |

No new repository or service function — Duplicate calls the same plain `insertX` used by "Add",
just with `initialValues={xToFormValues(record, todayDateOnly())}` (reusing the override-date
parameter already added for the convert/move flows — `auctionToFormValues` needed that parameter
added, mirroring `donationToFormValues`/`expenseToFormValues`, which already had it) and
`title="Duplicate {Entity}"`/`submitLabel="Save Duplicate"`. Deliberately always opens a
reviewable, pre-filled form rather than inserting silently — the same convention every other
record-creating flow in this app follows (Convert, Move, the Auction pledge, Copy-to-Expected).
Scoped to Donations/Expenses/Auctions only; Tasks/Calendar don't have a Duplicate action.

### 2.16 Dark Theme

| Layer | File(s) |
|---|---|
| Type | `ThemePreference = 'system' \| 'light' \| 'dark'`, `AppSettings.themePreference` in `types/index.ts` — default `'system'` |
| Hook | `hooks/useTheme.ts` → `useEffectiveTheme()` — resolves `'system'` against `window.matchMedia('(prefers-color-scheme: dark)')` live (a `change` listener, not a one-time read) |
| Applier | `components/layout/ThemeApplier.tsx` — renders nothing, just keeps `document.documentElement.dataset.theme` in sync via `useEffect`; mounted once near the root in `App.tsx` |
| CSS | `styles/global.css` — color tokens live under `:root, [data-theme="light"] { --color-*: ...; }` with a parallel `[data-theme="dark"] { --color-*: ...; }` override block |
| Settings | `pages/settings/AppearanceSettings.tsx` (same page as §2.14) |

**Why `:root, [data-theme="light"]`, not just `:root`**: `[data-theme="light"]` lets a
*descendant* element re-assert light values even when an ancestor (`<html>`) has
`[data-theme="dark"]` — this is exactly what the export functions in `lib/export/png.ts` rely on
(see below) to force a subtree back to light regardless of the app's active theme.

**Three hardcoded-color gotchas already fixed while building this** (patterns to remember if you
add more theme-varying UI):

1. **Native form controls (`input`/`select`/`textarea`) never had an explicit background/text
   color at all** — they just rendered with the browser's own default light appearance, which
   happened to look fine against the light theme by coincidence but stayed permanently white
   once dark mode existed (a real bug a user hit immediately: "input boxes are white ... makes
   form filling difficult"). Two-part fix: (a) `color-scheme: light`/`color-scheme: dark` added
   to the `:root`/`[data-theme="light"]`/`[data-theme="dark"]` blocks, which tells the browser to
   theme *native, unstyled* UI chrome — the date-picker popup, its calendar icon, checkboxes,
   scrollbars — that this CSS otherwise can't reach at all; (b) every rule that styles a form
   control (`.form-field input/select/textarea`, `.filter-field input/select`, `.inline-form
   input/select`, `.whatsapp-editor-grid textarea`, `.year-switcher select`) got an explicit
   `background: var(--color-surface); color: var(--color-text);` so they match this app's exact
   palette rather than the browser's generic dark gray. Don't add a new input rule without both.
2. **`.toast`'s background was `var(--color-text)`** — a deliberate light-mode trick reusing
   "always near-black" for a dark chip background, which breaks the instant `--color-text`
   becomes near-white in dark mode. Fixed by hardcoding the toast to a fixed, theme-independent
   dark color instead (a toast is meant to look the same dark overlay chip in both themes, like
   most apps' snackbars) — don't reuse a semantic color token for an incidental "happens to be
   dark" purpose.
3. **`color` is inherited, custom properties are not retroactive** — `lib/export/png.ts`
   originally forced exports back to light with `element.setAttribute('data-theme', 'light')`
   alone. That correctly re-scopes any CSS rule that freshly reads `var(--color-*)` *within* the
   subtree (e.g. `.data-table thead th`'s `color: var(--color-primary-dark)`), but plain
   `.data-table td` text has no explicit `color` rule at all — it just inherits `body`'s already-
   computed `color`, which resolved dark if the app's theme was dark, and inheritance carries the
   *computed value*, not a live binding to the custom property. Setting `data-theme="light"` on a
   descendant cannot retroactively fix a `color` value already inherited from further up the
   tree. Fixed by **also** setting an explicit, hardcoded `color` on the exported subtree/
   container itself (`exportElementAsPng` and `exportTableReportAsPng` both do this now) — don't
   assume `data-theme` scoping alone fixes inherited (as opposed to freshly-declared) properties.

**Exports stay theme-independent** (verified by exporting a PNG while dark mode is active and
confirming the row text is legible dark-on-white, not near-invisible):
- `lib/export/pdf.ts` needs no changes — jsPDF draws via its own hardcoded RGB calls, never CSS.
- `lib/chartSetup.ts`'s `CHART_COLORS` are fixed hex values, not theme-derived — charts already
  render identically in both themes.
- `lib/export/png.ts`'s `exportElementAsPng` and `exportTableReportAsPng` both set
  `data-theme="light"` **and** an explicit `color` override on the captured element/container
  (see gotcha #3 above), restoring the original values in a `finally` block afterward.

### 2.17 Local Backup on Launch

| Layer | File(s) |
|---|---|
| Type | `LocalBackupSettings` on `AppSettings`, `LocalBackupHandleRecord` (internal to `db/`) in `types/index.ts` |
| Dexie table | `localBackupHandle: 'id'` — a single row, `{ id: 'directory', handle: FileSystemDirectoryHandle }` (added in `db.ts` v5) |
| Repository | `db/repositories/settings.ts` — `updateLocalBackupEnabled`, `recordLocalBackupCompleted`, `setLocalBackupDirectory`; `db/repositories/localBackupHandle.ts` — `save`/`get`/`clearLocalBackupDirectoryHandle` |
| Lib | `lib/localBackup.ts` — `isDirectoryPickerSupported`, `writeBackupToDirectory`, `pickLocalBackupDirectory` (File System Access API wrappers, no db/ imports) |
| Service | `services/localBackupService.ts` — `runLaunchBackup` (the on-launch orchestration), `chooseLocalBackupDirectory`, `switchLocalBackupToDownloads` |
| Component | `components/layout/LaunchBackupRunner.tsx` (renders nothing, fires `runLaunchBackup` once), mounted in `AppLayout.tsx` |
| Page | `pages/settings/DataManagement.tsx`'s "Local Backup on Launch" subsection |
| Tests | `describe('local backup on launch settings')`, `describe('local backup directory handle storage (db v5)')` |

**Why the directory handle isn't stored on `AppSettings`**: every other `AppSettings` field is
JSON-serialized on every backup export (`backupExport.ts`'s `downloadJsonFile`) and imported
field-by-field in `backupImport.ts`. A `FileSystemDirectoryHandle` is real IndexedDB-cloneable
but has no business flowing through that JSON path, so it lives in its own tiny one-row table
instead — `localBackupHandle.ts` is the only place that ever reads or writes it.

**Per-device, not portable** — `localBackup` follows the exact same pattern as
`driveBackupReminder` (§2.9's sibling concept): excluded from `buildSettingsBlock()`'s picked
`appSettings` fields in `backupExport.ts`, and preserved as `currentSettings.localBackup` in
`backupImport.ts`'s `replace-all` path rather than ever being overwritten by an imported backup.
A picked folder handle and this device's own backup history aren't data to carry into a restore.

**`isDirectoryPickerSupported()`** gates every bit of directory-picker UI and logic — it's `false`
on Firefox, Safari, and every mobile browser (the File System Access API is desktop Chrome/Edge
only), and the Settings page shows a plain explanatory note instead of a picker button in that
case, so nothing on an unsupported browser dangles a control that would silently do nothing.

**`runLaunchBackup()` never throws** — every failure mode (backup destination not configured,
permission revoked since the folder was picked, the folder itself moved/deleted, disk full)
degrades to either falling back to a Downloads-folder save (if the directory write failed) or
doing nothing observable at all (if the whole operation errors) rather than surfacing to the
user. This is deliberate: a background backup interrupting app boot with an error dialog would be
worse than a silently skipped backup, especially since Settings' "Last automatic backup"
timestamp already gives visibility into whether it's actually running.

**`LaunchBackupRunner`'s `ranRef` guard** exists specifically because React 18 StrictMode
double-invokes mount effects in development — without it, one `npm run dev` page load would
write two backup files instead of one. It's a plain `useRef(false)` checked and flipped inside
the effect, the same pattern used nowhere else in this codebase because no other on-mount effect
here has an external side effect (a file write / download) worth guarding against a double-fire.

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

`addYears(dateOnly, years)` shifts a date-only string by whole years while preserving month/day
(e.g. `"2026-09-20"` + 1 → `"2027-09-20"`), clamping Feb 29 down to Feb 28 on a non-leap target
year — used by `copyTasksToYear` (§2.6) so a copied task's due date lands on the same festival day
next year rather than resetting to today.

`formatFileTimestamp(iso)` is the odd one out — unlike every other helper in this file, it's
explicitly for *exported filenames* (backups, PDF/PNG reports), not on-screen display, so it
includes the time (`"2026-09-11-1743"`, local, filename-safe — no colons) rather than just the
date. Without it, exporting the same report twice in one day silently produced the same
filename and relied on the browser to append `"(1)"`. Safe to parse via `new Date(iso)` here
specifically because its input is always a full ISO timestamp with an explicit time (`nowIso()`
or `new Date().toISOString()`), never a bare date-only string — the UTC-shift pitfall this file's
other helpers guard against only bites date-*only* strings.

**`lib/pluralize.ts`** — `pluralize(count, singular, plural?)` returns e.g. `"1 donation"` /
`"3 donations"`, computed from `count` rather than the earlier convention of a hardcoded
`"donation(s)"` string baked into every call site. A user flagged the bracket notation directly
("Don't want to see that braces"). `plural` defaults to `singular + 's'`; pass it explicitly for
an irregular form (`pluralize(n, 'entry', 'entries')`). Used at every count-driven UI string
across Dashboard, the list pages' toasts/`CopyToYearModal` item labels, and
`reportBuilders.ts`'s summary lines — grep for `pluralize` before adding a new one to reuse it
rather than writing a fresh `${n} thing(s)` template literal.

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

**Stacked modals and `document.body.style.overflow`** — `Modal` locks page scroll while open by
setting `document.body.style.overflow = 'hidden'`, restoring whatever it was before on unmount.
Modals routinely stack: `useCloseGuard`'s "Discard Unsaved Changes?" dialog (§3.4) opens *on top
of* the still-mounted form it belongs to, and the edit-confirm flow (also §3.4) does the same.
Each `Modal` instance used to save/restore this independently — when two stacked modals unmounted
together, whichever cleanup ran last would restore the *outer* modal's saved value (`'hidden'`,
captured while the inner one was already open), permanently freezing page scroll/interaction
after closing both. This is exactly the bug a user hit clicking "Discard" on a filled-in Add
Expense form. Fixed with a module-level open-modal counter (`openModalCount` /
`overflowBeforeAnyModal` in `Modal.tsx`): the true original value is captured only when the count
goes 0→1, and only restored when it goes back to 0 — so any depth of modal stacking unwinds
correctly. If you ever need a second place that toggles `document.body.style.overflow` (or any
other single shared global reset on unmount), use the same counter pattern rather than a plain
per-instance save/restore.

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
