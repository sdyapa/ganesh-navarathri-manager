# Backups

This folder is where exported data backups from the app are kept, version-controlled alongside
the code — so the committee's financial history lives in the same GitHub repo as the app itself,
with full history via `git log`.

## Convention

One folder per festival year, named after the year:

```
backups/
  2025/
    ganesh-navarathri-2025-legacy-import.json
  2026/
    ganesh-navarathri-2026-backup-2026-09-20.json
  2027/
    ...
```

- Create the year's folder the first time you export that year (`mkdir backups/<year>`).
- Drop the exported `.json` file in as-is — do not rename it; the app's own filename already
  encodes the year and export date (see **Settings → Data Management → Export** in the app,
  which generates names like `ganesh-navarathri-<year>-backup-<date>.json` for a single year, or
  `ganesh-navarathri-full-backup-<date>.json` for a full-database export).
- If you export the same year more than once in a season (e.g. mid-season and again after
  immersion), keep both files — the date in the filename keeps them distinct, and the git
  history plus the dated filenames together show how the data evolved.
- A "full" export (all years at once) still belongs under the most relevant year's folder, or
  its own `backups/full/` folder if you use that mode regularly — pick whichever you'll find
  again easily; the app can tell the two apart on import either way.

## `2025/ganesh-navarathri-2025-legacy-import.json`

This is not a normal export — it's the one-time migration bundle converted from the original
2025 Excel donation/expense/auction sheets, used to seed the app with real historical data. It's
a **full** export containing two year bundles:

- **2025** — the actual donations (19), expenses (46), auctions (5), and one pending expected
  commodity donation for that year.
- **2026** — five pending Expected Donations, carried forward automatically from 2025's auction
  winners (an auction win becomes a pledge collected the *following* year — see
  [§2.4 Auctions](../README.md#24-auctions) in the main README).

To import it: open the app → **Settings → Data Management → Import**, choose this file, and pick
**Add as new data** (or **Replace entire database** if starting completely fresh). The app
auto-registers every donor/vendor/auction-participant name it finds as a reusable Profile during
import, so nothing further needs to be typed in by hand afterward.
