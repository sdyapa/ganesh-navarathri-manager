# Ganesh Navarathri Manager

A donation and expense management web app for Ganesh Navarathri celebrations — built to run
entirely as a **static site** (GitHub Pages friendly), work **offline**, and track finances
**year after year** without ever mixing one year's data into another.

## 1. Overview

Every year a Ganesh Navarathri committee collects donations (cash and goods), spends money on
pooja items, food, decorations and immersion (Nimajjanam), and often auctions off prasadam or
decorative items. This app tracks all of that, keeps actual money separate from promised
money, carries the previous year's balance forward automatically, and lets you export/share
reports on WhatsApp, as PDF, or as an image — all without needing a backend server.

## 2. Features

- **Year profiles** — each Ganesh Navarathri year is fully isolated. Switch years instantly
  without "restoring" anything; every year's data is always there.
- **Donations** (monetary + commodity) and **Expected Donations** with a guided "Convert to
  Donation" flow.
- **Expenses** and **Expected Expenses** with a "Move to Expenses" flow.
- **Auctions**, tracked separately from donations and expenses.
- **Dashboard** that clearly separates *actual* cash-in-hand from *expected/promised* amounts.
- **Reports & Charts** — donations/expenses by category, donations vs. auction vs. expenses,
  day-by-day cash flow, and commodity totals (grouped strictly by commodity **and** unit, so
  50 kg of rice is never added to 10 litres of oil).
- **Configurable categories & units** — categories/units used by historical records are
  deactivated rather than deleted, so past records never lose their original label.
- **WhatsApp sharing** — configurable message templates with a live preview and one-tap copy
  to clipboard.
- **PDF & PNG export** for donations, expenses, auctions, the dashboard summary, and the full
  reports page.
- **Local backup & restore** — export the current year, a specific year, or the entire
  database as a single versioned JSON file. Import auto-detects what kind of backup it is and
  always asks how to apply it (add as new, skip duplicates, replace a year, or replace
  everything) before touching your data.
- **Google Drive backup/restore** (optional — see [§7](#7-google-drive-setup)).
- **Offline-first** — an installable PWA; all normal work (adding/editing/viewing/reporting)
  works without an internet connection.
- **Mobile-first UI** — card-based lists on phones, full tables on larger screens, bottom
  navigation on mobile, a sidebar on desktop.

## 3. Technology Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Fast dev/build, static output, first-class GitHub Pages support |
| Storage | IndexedDB via [Dexie.js](https://dexie.org) + `dexie-react-hooks` | Survives refresh/restart, handles thousands of records, reactive queries without manual state syncing |
| Routing | `react-router-dom` (`HashRouter`) | Hash routes (`/#/donations`) always resolve on GitHub Pages without a server rewrite rule |
| Validation | `zod` | Same schema drives form validation *and* backup-file validation |
| Charts | `chart.js` / `react-chartjs-2` | Lightweight, no server, accessible defaults |
| PDF export | `jspdf` + `jspdf-autotable` | Real paginated tables with repeating headers — not a screenshot |
| PNG export | `html2canvas` | Captures a full report element, not just the viewport |
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

```bash
npm install
npm run dev
```

Opens the app at `http://localhost:5173/`. Data is stored in your browser's IndexedDB — it
persists across refreshes and restarts, but is specific to that browser profile.

**On a corporate network with a TLS-inspecting proxy**, `npm install` may fail with
`SELF_SIGNED_CERT_IN_CHAIN`. Fix it by pointing Node at your organization's trusted root
certificates instead of disabling TLS verification:

```powershell
# Export the Windows trusted root/intermediate certs to a PEM bundle once, then reuse it:
$env:NODE_EXTRA_CA_CERTS = "$HOME\corporate-ca-bundle.pem"
npm install
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
  carry-forward, year isolation, year deletion, expected→actual conversion for both donations
  and expenses, category deactivation vs. hard delete, backup export/import round-trips
  (including duplicate skipping), and full application reset.

## 6. Build & GitHub Pages Deployment

### One-time setup

1. Push this repository to GitHub.
2. In the repo's **Settings › Pages**, set the source to **GitHub Actions**.
3. (Optional) If you're using Google Drive backup, add a repository secret named
   `VITE_GOOGLE_CLIENT_ID` — see [§7](#7-google-drive-setup).

The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically on
every push to `main`. It sets `VITE_BASE_PATH` to `/<repository-name>/` automatically, which is
what a **project page** (`https://<username>.github.io/<repository>/`) needs.

### Manual build

```bash
# Project page, e.g. https://username.github.io/ganesh-navarathri-manager/
VITE_BASE_PATH=/ganesh-navarathri-manager/ npm run build

# User/organization root page, e.g. https://username.github.io/
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
includes the app name/version, export type (`full` or `single-year`), all relevant records, and
categories/units/settings.

- **Export**: Settings › Data Management → export the current year, a specific year, or the
  entire database.
- **Import**: choose a file; the app inspects it, shows exactly what it contains (years,
  record counts, categories), and only then asks how to apply it:
  - **Add as new data** — inserts everything (a year already present locally is added into).
  - **Add, but skip duplicates** — same, but records that look identical to an existing one
    are skipped.
  - **Replace selected year** — only offered for single-year backups; deletes the matching
    local year first.
  - **Replace entire database** — wipes everything and restores exactly what's in the backup.

No import ever silently overwrites data — the confirmation step is not skippable.

## 9. Data Architecture

A single IndexedDB database holds every year. Records are scoped by `yearProfileId`, so
switching years is just a query filter — not a restore operation. See `src/types/index.ts` for
the full schema and `src/db/db.ts` for the Dexie table/index definitions.

Key entities: `YearProfile`, `Donation`, `ExpectedDonation`, `Expense`, `ExpectedExpense`,
`Auction`, `Category`, `Unit`, `AppSettings`.

Financial rules enforced throughout the codebase (see `src/lib/calculations.ts`):

- Actual closing balance = opening balance + monetary donations + auction proceeds − expenses.
- Expected donations/expenses never affect the actual balance until explicitly converted.
- Commodity donations are never treated as cash.
- Commodity quantities are grouped strictly by (commodity name, unit) — different units are
  never summed together.
- Only the actual closing balance is ever carried forward into a new year.

Dates are stored as plain `"YYYY-MM-DD"` strings and never parsed through `new Date(string)`
(which is UTC-based and can shift the day depending on the viewer's timezone). All date
handling goes through `src/lib/date.ts`, which builds `Date` objects only from explicit local
`(year, month, day)` components.

## 10. Known Limitations

- **Client-side storage is per-browser-profile.** IndexedDB data is not automatically synced
  between devices or browsers — use Export/Import or Google Drive backup to move data between
  them. Clearing site data/browser storage will delete it, so periodic backups are recommended.
- **Google Drive OAuth tokens are short-lived** (about an hour) and are not persisted across
  page reloads for security reasons — you'll need to reconnect each session you use Drive
  backup.
- **No multi-user real-time collaboration.** This is a single-device ledger per browser
  profile; it is not designed for two people editing the same year simultaneously.
- **PWA icons are placeholders** (`scripts/generate-icons.mjs` generates simple flat-color
  icons at build time) — replace `public/icons/*.png` with real branded artwork before a
  public launch.

## 11. Project Structure

```
src/
  types/            Domain types + backup file format
  lib/               Pure, unit-tested logic: calculations, validation, date/currency
                     formatting, WhatsApp templates, PDF/PNG export, Google Drive client
  db/                Dexie schema, defaults, per-entity repositories (the only code that
                     touches IndexedDB directly)
  services/          Cross-cutting orchestration: year creation/carry-forward, expected→actual
                     conversion, backup export/import, reset, sample data
  context/           Selected-year context, toast notifications
  hooks/             Reactive data hooks (live-query wrappers) built on the repositories
  components/        Reusable UI: layout, tables, forms, dialogs
  pages/             One folder per feature area (donations, expenses, auctions, reports,
                     settings)
  test/              Vitest suites
```

## 12. Future Maintenance

- Bump `BACKUP_SCHEMA_VERSION` in `src/types/index.ts` whenever the backup shape changes in a
  way older versions of the app can't read, and extend `applyBackupImport` to migrate old
  versions forward rather than rejecting them outright.
- Keep `APP_VERSION` in `src/appVersion.ts` in sync with `package.json`.
- When adding a new record field, update: the type in `src/types`, the Dexie schema/version in
  `src/db/db.ts` (bump the Dexie version if indexes change), the relevant `zod` schema in
  `src/lib/validation.ts`, and the corresponding backup schema in the same file.
