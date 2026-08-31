# Ganesh Navarathri Manager

A donation and expense management web app for Ganesh Navarathri celebrations — built to run
entirely as a **static site** (GitHub Pages friendly), work **offline**, and track finances
**year after year** without ever mixing one year's data into another.

## 1. Overview

Every year a Ganesh Navarathri committee collects donations (cash and goods), spends money on
pooja items, food, decorations and immersion (Nimajjanam), and often auctions off prasadam or
decorative items. This app tracks all of that, keeps actual money separate from promised money,
carries the previous year's balance forward automatically, tracks the festival's own calendar of
events and daily pooja duty, and lets you export/share reports on WhatsApp, as PDF, or as an
image — all without needing a backend server.

## 2. Features

### 2.1 Years & Carry-Forward

Each Ganesh Navarathri year is a fully isolated **Year Profile** — switching years is instant
(it's just a filter on `yearProfileId`, never a "restore"), and every year's data is always
there side by side with every other year's.

- **Automatic carry-forward**: when you create a new year and check "Carry forward opening
  balance", the app finds the most recent prior year and sets the new year's opening balance to
  that year's *actual* closing balance.
- **Retroactive carry-forward**: from **Settings → Years & Profiles**, any existing year (even
  one that already has records) can pull in the closing balance of the most recent prior year on
  demand — useful when a backup is imported out of order, or a year was created before an older
  year was added.

### 2.2 Donations & Expected Donations

- **Actual Donations** — monetary or commodity (with quantity + unit, e.g. "25 kg rice"),
  each with a donor name, category, date, and optional notes.
- **Expected Donations** — pledges not yet received. A "Convert to Donation" action creates the
  matching Actual record and marks the pledge **Converted** (the pledge itself is never deleted
  or mutated in place — this keeps the relationship auditable).
- **Undo a conversion**: if a donation was converted by mistake, use **Move back to Expected**
  on the Actual Donations list (shown only on records that came from a conversion) — it deletes
  the Actual record and restores the original Expected Donation as pending again.
- **Copy to Expected Donations**: select one or more Actual Donations and copy them into pending
  Expected Donations for next year (or any existing year) — for donors who reliably give the
  same commitment every year; amounts can be adjusted afterward in the target year. The source
  donations are left untouched.
- **Sort & filter**: search by donor/commodity/notes, filter by type/category/date range, and
  sort by date or donor name — on both the Actual and Expected lists.

### 2.3 Expenses & Expected Expenses

- **Actual Expenses** and **Expected Expenses**, each with a description, amount, category,
  optional vendor name, and optional notes. A pending Expected Expense is moved into Actual via
  **Move to Expenses**, exactly mirroring the donation conversion flow (and equally undoable via
  **Move back to Expected**).
- **Copy to Expected Expenses**: the same recurring-item convenience as donations — e.g. "Priest
  Charges" happens every year with a varying amount; select it once from a past year and copy it
  forward as a pending Expected Expense.
- **Payment Group (visual only)**: expenses paid in installments to the same vendor (advance,
  part payment, final payment) can share a free-text **Payment Group** label. Turning on
  **Group by Payment Group** on the Actual Expenses list shows them grouped together with a
  subtotal per group, purely for readability — it never affects totals, reports, or exports,
  which always work off the flat list of individual expense records.
- **Sort & filter**: search, filter by category/date range, sort by date or amount.

### 2.4 Auctions

Auction items (e.g. Pedda Laddu, decorative baskets) are tracked separately from donations,
since an auction winner typically pays the *following* year's festival rather than on the spot.
**Convert to Expected Donation** turns a won auction into a pending pledge in next year's Year
Profile (creating that year automatically if it doesn't exist yet, and carrying this year's
closing balance forward into it).

### 2.5 People & Vendors (Profiles)

A reusable, cross-year name registry that powers autocomplete on every Donor, Auction
Participant, and Vendor field:

- Every name typed into those fields is registered automatically — no separate "add a person"
  step is ever required.
- Manage the list from **Settings → People & Vendors**: rename, reorder, or remove an entry.
- **Renaming cascades**: renaming "Ramesh" to "Ramesh Kumar" updates every historical
  Donation/Expected Donation/Auction/Expense/Expected Expense that used the old name, across
  *every* year — not just going forward. Deleting a Profile, by contrast, never touches
  historical records (there's no foreign key to protect; it's purely a suggestion list), so
  deletion is always safe.
- Imported backups (see [§8](#8-backup--restore)) automatically register every donor/vendor/
  participant name they contain, so importing older data (e.g. a spreadsheet migration) doesn't
  require manually rebuilding the Profile list afterward.

### 2.6 Tasks

A simple TODO list for festival prep, per year, at **Tasks**:

- Each task has a title, a due date, optional notes, and can be marked **Pending**/**Done**.
- The list is sorted by due date (soonest first by default) with a sort control and a
  Pending/Done filter.
- A task can carry its own **checklist** — e.g. a "Buy pooja items" task with a checklist of
  "Flowers", "Coconuts", "Camphor" — checked off individually as they're bought. Checklist items
  can be added at creation (one per line) or any time afterward from the task itself, and
  removed individually.

### 2.7 Calendar (Key Events & Pooja Roster)

A festival calendar, per year, at **Calendar**, with two views:

- **Key Events** — named, dated festival milestones: Annadanam, Nimajjanam (idol immersion),
  Kumkumarchana, or anything else specific to this year. These are freely named rather than a
  fixed list, since which of them apply — and when — varies year to year; add only what's
  relevant.
- **Pooja Roster** — a day-by-day log of which family (or families) performed pooja, from the
  start of the festival up to immersion day. One entry per day, with one or more family names
  (comma-separated) and optional notes.

### 2.8 Dashboard & Reports

- **Dashboard** clearly separates *Actual (Cash in Hand)* from *Expected (Promised, Not Yet
  Received)*, so a pledge or an auction win is never mistaken for money already in hand.
- **Reports** page — donations/expenses by category, a donations-vs-expenses-vs-auction chart,
  day-by-day cash flow, and commodity totals grouped strictly by (commodity name, unit) so, say,
  50 kg of rice is never added to 10 litres of oil.
- **Overall Summary PDF** (from the Dashboard) — a single shareable report covering opening
  balance, donations, expenses, auction details, and closing balance for the year, intended to
  be posted to the committee's WhatsApp group once the festival wraps up. Expected/pending
  amounts are deliberately left out of this report, since they're not relevant once the season
  is over.

### 2.9 WhatsApp Sharing

Configurable message templates (**Settings → WhatsApp Templates**) with placeholders and a live
preview — after saving a donation, one tap copies a ready-to-paste WhatsApp acknowledgment to
the clipboard.

### 2.10 PDF & PNG Export

Every list page (Donations, Expenses, Auctions) and the Dashboard can export to PDF or PNG:

- **PDF** — proper paginated tables with repeating headers (`jspdf-autotable`), safe with
  hundreds of records.
- **PNG** — renders the same data as a clean table image (not a screenshot of the live,
  interactive page — no Edit/Delete/Copy-WhatsApp buttons ever end up in the exported image),
  which stays readable even with a large number of transactions instead of producing one very
  tall image.

### 2.11 Configurable Categories & Units

Categories and units used by historical records are **deactivated** rather than deleted when
removed from Settings, so a past record never silently loses or changes its original label.
Defaults can always be restored if accidentally removed.

### 2.12 Offline-First & Mobile-First

- Installable **PWA** — everyday work (adding/editing/viewing/reporting) works with no internet
  connection.
- Card-based lists on phones, full tables on larger screens; bottom navigation on mobile, a
  sidebar on desktop.

## 3. Technology Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Fast dev/build, static output, first-class GitHub Pages support |
| Storage | IndexedDB via [Dexie.js](https://dexie.org) + `dexie-react-hooks` | Survives refresh/restart, handles thousands of records, reactive queries without manual state syncing |
| Routing | `react-router-dom` (`HashRouter`) | Hash routes (`/#/donations`) always resolve on GitHub Pages without a server rewrite rule |
| Validation | `zod` | Same schema drives form validation *and* backup-file validation |
| Charts | `chart.js` / `react-chartjs-2` | Lightweight, no server, accessible defaults |
| PDF export | `jspdf` + `jspdf-autotable` | Real paginated tables with repeating headers — not a screenshot |
| PNG export | `html2canvas` | Renders a clean synthetic table, not a screenshot of the interactive UI |
| Google Drive | Google Identity Services (browser OAuth) + Drive REST API | No server, no client secret ever needed |
| Tests | `vitest` + `fake-indexeddb` | Fast, runs the calculation engine and DB layer without a browser |

This is entirely client-side by design — there is no backend, and none is required for daily
use. The only feature that needs the internet is Google Drive backup/restore.

**Toolchain versions are deliberately pinned to Node 16-compatible releases** (Vite 4, Vitest
0.34, `vite-plugin-pwa` 0.16, `@typescript-eslint` 7, and a `package.json` `overrides` entry
pinning `vite`/`workbox-build` so npm doesn't nest a newer, Node-18-only copy of either). If you
build on Node 18+, you can safely bump these — Vite 5, Vitest 2, and the latest
`vite-plugin-pwa`/`@typescript-eslint` all work fine there and the `overrides` block and the
`engines` field in `package.json` can simply be removed.

## 4. Local Development

Requires [Node.js](https://nodejs.org) 16.14+ (see the toolchain note above; Node 18+ also
works and lets you use newer dependency versions).

### Quick start (every time you want to run it locally)

```powershell
# 1. Open a terminal (PowerShell) in the project folder.
# 2. If `node`/`npm` aren't on PATH in this terminal (fresh terminals often don't have them),
#    add them for THIS session only — this line does not persist to new terminal windows/tabs,
#    so re-run it whenever you open a new terminal and `npm` isn't found:
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# 3. First time only (or whenever package.json changes): install dependencies.
npm install

# 4. Start the dev server.
npm run dev
```

Vite prints the URL to open, e.g. `Local: http://localhost:5173/` — open that in your browser.
Leave the terminal window running; closing it (or pressing Ctrl+C in it) stops the server. Data
is stored in your browser's IndexedDB — it persists across refreshes and restarts, but is
specific to that browser profile (switching browsers or using a private/incognito window starts
with an empty database).

**If the browser says "Unable to connect"**, the dev server isn't actually running — check the
terminal: it should show `VITE ... ready in ...ms` followed by the `Local:` URL. If instead it
shows an error, or the terminal prompt just came back with nothing printed, the PATH step above
was likely skipped or run in a different terminal window than the one running `npm run dev`.

**On a corporate network with a TLS-inspecting proxy**, `npm install` may fail with
`SELF_SIGNED_CERT_IN_CHAIN`. Fix it by pointing Node at your organization's trusted root
certificates instead of disabling TLS verification:

```powershell
# Export the Windows trusted root/intermediate certs to a PEM bundle once (already done on this
# machine — the bundle lives at ~/corporate-ca-bundle.pem), then point Node at it every time:
$env:NODE_EXTRA_CA_CERTS = "$HOME\corporate-ca-bundle.pem"
npm install
```

If that bundle doesn't exist yet (e.g. on a different machine), generate it once with:

```powershell
$outFile = "$HOME\corporate-ca-bundle.pem"
if (Test-Path $outFile) { Remove-Item $outFile }
foreach ($storePath in @("Cert:\LocalMachine\Root", "Cert:\LocalMachine\CA", "Cert:\CurrentUser\Root", "Cert:\CurrentUser\CA")) {
  Get-ChildItem $storePath -ErrorAction SilentlyContinue | ForEach-Object {
    $b64 = [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks')
    Add-Content -Path $outFile -Value "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----"
  }
}
```

## 5. Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
npm run typecheck
npm run lint
```

The test suite focuses on the parts that must never be wrong:

- `src/test/calculations.test.ts` — the financial calculation engine, including the exact
  worked example and carry-forward example from the spec, commodity unit-separation, decimal
  quantities, and category totals.
- `src/test/date.test.ts` — timezone-safety of date handling (a date entered as 27-Aug can
  never silently become 26-Aug).
- `src/test/currency.test.ts` — Indian (`en-IN`) currency formatting.
- `src/test/validation.test.ts` — form/record validation rules and backup-file schema
  validation (including rejecting malformed files and a future/unsupported schema version).
- `src/test/whatsapp.test.ts` — placeholder substitution (never executes template content as
  code).
- `src/test/integration.test.ts` — full flows against a real (fake) IndexedDB: year
  carry-forward (automatic and retroactive), year isolation, year deletion, expected↔actual
  conversion for both donations and expenses (including undoing a conversion), copying Actual
  records forward into Expected for a future year, Profile registration/rename-cascade/delete,
  Tasks and checklist items, the festival calendar (Key Events + Pooja Roster), category/unit
  deactivation vs. hard delete, backup export/import round-trips (including duplicate skipping
  and backward compatibility with backups from before a field existed), and full application
  reset.

## 6. Build & GitHub Pages Deployment

This repo is already wired up to GitHub Pages under `sdyapa/ganesh-navarathri-manager`, deployed
automatically by `.github/workflows/deploy.yml` on every push to `master`:

```
https://sdyapa.github.io/ganesh-navarathri-manager/
```

**Day to day**: commit your changes and `git push` — the Actions tab shows the "Deploy to GitHub
Pages" workflow running `npm ci`, tests, and the build automatically. When it finishes (green
check), the live site is updated. No manual deploy step is ever needed.

### Setting this up from scratch (for a fork, or a fresh clone with no `origin` yet)

1. **Create the repo on GitHub**: go to <https://github.com/new>, pick a name, and — since this
   repo already has commits — leave "Add a README" / `.gitignore` / license unchecked to avoid a
   merge conflict on first push.
2. **Point this local repo at it and push**:
   ```powershell
   $env:PATH = "C:\Program Files\nodejs;" + $env:PATH   # if node/git need it in this terminal
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin master
   ```
   The first push will prompt for GitHub authentication in the browser (or a credential manager
   popup). After this, `git push` alone updates it.
3. **Turn on GitHub Pages**: repo page → **Settings → Pages** → under "Build and deployment" set
   **Source** to **GitHub Actions**.
4. **Trigger the deploy**: pushing (step 2) already triggers it — watch the **Actions** tab.
   Once green, the app is live at `https://<your-username>.github.io/<your-repo-name>/` (also
   shown on the Pages settings page).
5. **(Optional) Google Drive backup**: add a repository secret named `VITE_GOOGLE_CLIENT_ID`
   under **Settings → Secrets and variables → Actions** — see [§7](#7-google-drive-setup). Skip
   this for now; the app works fully without it, just with Drive backup disabled.

No code change is needed for a different repository name — the workflow reads it automatically
and sets `VITE_BASE_PATH` to `/<repository-name>/` for you.

### Manual build (without GitHub Actions)

```bash
# Project page, e.g. https://sdyapa.github.io/ganesh-navarathri-manager/
VITE_BASE_PATH=/ganesh-navarathri-manager/ npm run build

# User/organization root page, e.g. https://sdyapa.github.io/
npm run build
```

The output is a static `dist/` folder — upload it anywhere that serves static files.
`HashRouter` is used specifically so client-side routes never 404 on a plain static host.

## 7. Google Drive Setup

Google Drive backup is **entirely optional** and disabled by default. When it's not
configured, the app tells the user so and simply hides/disables the feature — nothing else is
affected.

To enable it (for administrators deploying their own copy of the app):

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API** for that project.
3. Configure the **OAuth consent screen**.
4. Create an **OAuth 2.0 Client ID** of type "Web application".
5. Under **Authorized JavaScript origins**, add your GitHub Pages origin, e.g.
   `https://<username>.github.io`.
6. Copy the generated **Client ID**.
7. Provide it to the build as `VITE_GOOGLE_CLIENT_ID` — either as a GitHub Actions secret (see
   above) or a local `.env.local` file for manual builds.

**No client secret is ever used.** The app authenticates entirely in the browser using Google
Identity Services' token flow, and only ever requests the narrow `drive.file` scope — Google
Drive access limited to files this app itself creates, never the user's whole Drive.

## 8. Backup & Restore

Backups are versioned JSON files (`backupVersion`, see `src/types/index.ts`). Every export
includes the app name/version, export type (`full` or `single-year`), all relevant records for
each year (donations, expected donations, expenses, expected expenses, auctions, tasks, key
events, and pooja roster entries), and categories/units/profiles/settings.

- **Export**: **Settings → Data Management** → export the current year, a specific year, or the
  entire database. This is also how you produce the file described in
  [§8.3](#83-storing-yearly-backups-in-this-repo) below.
- **Import**: choose a file; the app inspects it, shows exactly what it contains (years, record
  counts per type, categories/units/people-vendors included), and only then asks how to apply
  it:
  - **Add as new data** — inserts everything (a year already present locally is added into).
  - **Add, but skip duplicates** — same, but records that look identical to an existing one
    are skipped.
  - **Replace selected year** — only offered for single-year backups; deletes the matching
    local year first.
  - **Replace entire database** — wipes everything and restores exactly what's in the backup.

No import ever silently overwrites data — the confirmation step is not skippable. Every donor,
vendor, and auction-participant name in an imported backup is also automatically registered as a
reusable Profile (see [§2.5](#25-people--vendors-profiles)), even for backups exported before
Profiles existed as a feature.

### 8.1 What travels in a backup

Everything scoped to a specific year travels with it: Donations, Expected Donations, Expenses,
Expected Expenses, Auctions, Tasks (with their checklists), Key Events, and Pooja Roster
entries. Cross-year settings (Categories, Units, People & Vendors) travel once per backup file,
not per year. A few things are deliberately device-local and never included in a backup, since
restoring someone else's data shouldn't overwrite them: the Google Drive backup reminder
schedule/history, and (unless explicitly renamed) the app's customizable display name falls back
to whatever this device already has if the backup predates that setting.

### 8.2 Reverting an old backup schema

Every backup array that was added after the app's first release (`profiles`, `tasks`,
`keyEvents`, `poojaAssignments`) defaults to an empty list when a backup file predates it, so an
old export from before a given feature existed still imports cleanly — you simply get none of
that feature's records for that year, exactly as if none had ever been added.

### 8.3 Storing Yearly Backups in This Repo

This repo also keeps a running archive of every year's exported backup under
[`backups/`](backups/README.md), one folder per festival year (e.g. `backups/2025/`,
`backups/2026/`). The convention — and the note on the one-time legacy 2025 migration file
already sitting there, ready to import — is documented in [`backups/README.md`](backups/README.md).
In short: export from **Settings → Data Management**, drop the resulting `.json` file (unrenamed)
into that year's folder, and commit it — the committee's full financial history then lives in
the same place as the app's code, with `git log` as the audit trail of when each backup was
taken.

## 9. Data Architecture

A single IndexedDB database (Dexie schema version 4) holds every year. Records are scoped by
`yearProfileId`, so switching years is just a query filter — not a restore operation. See
`src/types/index.ts` for the full schema and `src/db/db.ts` for the Dexie table/index
definitions and version-upgrade history.

**Year-scoped entities** (one set per `YearProfile`): `Donation`, `ExpectedDonation`, `Expense`,
`ExpectedExpense`, `Auction`, `Task` (with embedded `TaskChecklistItem[]`), `KeyEvent`,
`PoojaAssignment`.

**Cross-year entities**: `YearProfile` itself, `Category`, `Unit`, `Profile` (the People &
Vendors registry), `AppSettings`.

Financial rules enforced throughout the codebase (see `src/lib/calculations.ts`):

- **Actual closing balance = opening balance + monetary donations − expenses.** Auction
  proceeds are deliberately *excluded* — winning an auction is a pledge, not cash in hand; the
  winner pays the *following* year (see `convertAuctionToExpectedDonation` in
  `src/services/conversionService.ts`), so auction totals are reported for visibility only and
  never folded into the actual balance.
- Expected donations/expenses never affect the actual balance until explicitly converted (and
  a conversion can always be undone — see [§2.2](#22-donations--expected-donations)/
  [§2.3](#23-expenses--expected-expenses) — which simply reverses this: delete the actual
  record, restore the source Expected record to pending).
- Commodity donations are never treated as cash.
- Commodity quantities are grouped strictly by (commodity name, unit) — different units are
  never summed together.
- Only the actual closing balance is ever carried forward into a new year.
- A Task's checklist, an Expense's Payment Group label, and the festival calendar are all purely
  organizational — none of them feed into any financial calculation, report, or export.

Dates are stored as plain `"YYYY-MM-DD"` strings and never parsed through `new Date(string)`
(which is UTC-based and can shift the day depending on the viewer's timezone). All date
handling goes through `src/lib/date.ts`, which builds `Date` objects only from explicit local
`(year, month, day)` components.

## 10. Known Limitations

- **Client-side storage is per-browser-profile.** IndexedDB data is not automatically synced
  between devices or browsers — use Export/Import (and the [`backups/`](backups/README.md)
  archive in this repo) or Google Drive backup to move data between them. Clearing site
  data/browser storage will delete it, so periodic backups are recommended.
- **Google Drive OAuth tokens are short-lived** (about an hour) and are not persisted across
  page reloads for security reasons — you'll need to reconnect each session you use Drive
  backup.
- **No multi-user real-time collaboration.** This is a single-device ledger per browser
  profile; it is not designed for two people editing the same year simultaneously.
- **Payment Group and the festival calendar are free-text, single-year conveniences** — Payment
  Group has no cross-year autocomplete registry (unlike Donor/Vendor names), and Pooja Roster
  family names are a single free-text field rather than a multi-select, both by design to keep
  these lightweight features simple.
- **PWA icons are placeholders** (`scripts/generate-icons.mjs` generates simple flat-color
  icons at build time) — replace `public/icons/*.png` with real branded artwork before a
  public launch.

## 11. Project Structure

```
backups/            Year-by-year archive of exported backup JSON files (see backups/README.md)
src/
  types/            Domain types + backup file format
  lib/               Pure, unit-tested logic: calculations, validation, date/currency
                     formatting, WhatsApp templates, PDF/PNG export, Google Drive client
  db/                Dexie schema, defaults, per-entity repositories (the only code that
                     touches IndexedDB directly)
  services/          Cross-cutting orchestration: year creation/carry-forward, expected↔actual
                     conversion (including undo), copy-forward, backup export/import, reset,
                     sample data
  context/           Selected-year context, toast notifications
  hooks/             Reactive data hooks (live-query wrappers) built on the repositories
  components/        Reusable UI: layout, tables, forms, dialogs
  pages/             One folder per feature area — donations, expenses, auctions, tasks,
                     calendar, reports, settings
  test/              Vitest suites
```

## 12. Future Maintenance

- Bump `BACKUP_SCHEMA_VERSION` in `src/types/index.ts` whenever the backup shape changes in a
  way older versions of the app can't read, and extend `applyBackupImport` to migrate old
  versions forward rather than rejecting them outright.
- Keep `APP_VERSION` in `src/appVersion.ts` in sync with `package.json`.
- When adding a new record field, update: the type in `src/types`, the Dexie schema/version in
  `src/db/db.ts` (bump the Dexie version if a new table or a new *indexed* field is added — a
  new plain field on an existing table does not require a version bump), the relevant `zod`
  schema in `src/lib/validation.ts`, and the corresponding backup schema in the same file (add
  `.default([])`/`.optional()` there so older backups still validate).
- When adding a new year-scoped entity (like Tasks or the Calendar), also wire it into
  `buildYearBundle` (`src/services/backupExport.ts`), both branches of `applyBackupImport`
  (`src/services/backupImport.ts`), and `getResetImpact`/`resetApplication`
  (`src/services/resetService.ts`) — otherwise it will silently survive a "Reset Application" or
  silently vanish from backups.
