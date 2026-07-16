# Excel exports for aggregate reports (viewer + עידן) — design

> **STATUS: 🟡 OPEN — spec approved verbally, NOT built.** Resume point: implement per the
> Implementation section, run `node test-exports.mjs` in a loop until green, manual Excel smoke,
> then CHANGELOG/backlog/INDEX + flip this header to ✅ SHIPPED.

**Date:** 2026-07-16 · **Branch:** `dev` · **Owner ask:** עידן

## Goal

Every **aggregate** report in the app (NOT the single delivery-cert PDF) gets a 📗 **הורד Excel**
download producing a real `.xlsx` — one value per column, no multi-line text cells, dates as
dates, numbers as numbers, Hebrew intact. Button visible to **עידן + viewer only**
(`isIdan() || isViewer()`).

Sample files (approved format, dummy data) were generated 2026-07-16 and reviewed by עידן:
RTL sheet, navy `#1B2A4A` header row, freeze row 1, auto-filter, dd/mm/yyyy dates.

## Reports in scope (6)

| # | Report | Source fn (today) | Sheet columns |
|---|--------|-------------------|---------------|
| 1 | דוח ביקורי שטח | `openVisitsReportHTMLView` `js/src/10-activity.js:245` | תאריך(d) · יום(s) · קיבוץ · מבקר · משך שעות(n) · איש קשר · סיכום · פריט שסופק · כמות(n) |
| 2 | דוח נוכחות חודשי | `renderAttendanceReport` `js/src/04-attendance-daily.js:60` | תאריך(d) · יום · עובד · סוג יום · קיבוץ · שעות(n) · פירוט |
| 3 | דוח תעודות משלוח (טווח) | `certRangeReportRange` `js/src/20-delivery-cert.js:784` | מס' תעודה(n) · תאריך(d) · קיבוץ · פריט · כמות(n) · הופק ע"י · מקור · סטטוס |
| 4 | סיכום חודשי תעודות | `certMonthlyFromTab` `js/src/20-delivery-cert.js:836` | קיבוץ · פריט · סה"כ כמות(n) · מס' תעודות(n) |
| 5 | מלאי לפי מיקום | `invRenderStock` `js/src/08-inventory.js:290` | קטגוריה · פריט · one col per location(n) · סה"כ(n) |
| 6 | מלאי לפי קיבוץ | `invRenderKibbutzInventory` `js/src/08-inventory.js:387` | קיבוץ · one col per product(n) · סה"כ(n) |

**Row-explosion rule:** multi-item records (visits #1, certs #3) emit **one row per item**, with
the parent fields repeated on every row (never blank-on-repeat, never an items list in one cell).
Cancelled certs included in #3 with סטטוס=מבוטלת, **excluded** from #4 totals (matches the print
report's rule).

## Format decision: real XLSX via vendored SheetJS (not CSV)

CSV cannot guarantee typed cells (Excel re-guesses; Israeli-locale Excel may split on `;` not `,`)
and Hebrew/BOM is fragile. XLSX makes every product requirement machine-checkable.
- Vendor `js/vendor/xlsx.min.js` (SheetJS, single file, committed to the repo — no CDN at runtime).
- **Lazy-load** on first export click (`<script>` inject + promise); zero cost to app load.
- Existing CSV exports (#1/#5/#6) stay untouched; the 📗 button is additive.

## Architecture (testability is the design)

New module `js/src/21-excel-export.js`:
- **Pure builders** — `xlBuildVisits(visits) → spec`, `xlBuildAttendance(...)`, `xlBuildCerts(...)`,
  `xlBuildCertSummary(...)`, `xlBuildStockByLocation(...)`, `xlBuildStockByKibbutz(...)`.
  Spec = `{ sheet, columns: [{header, type: 's'|'n'|'d', width}], rows: [[...]] }`.
  No DOM, no Supabase, no download — Node-loadable for tests.
- Builder invariants (enforced in code, asserted in tests): newlines/RTL-marks flattened to `; `/
  stripped · null→`''` · `'n'` cells coerced to Number (garbage → `''`) · `'d'` cells built from
  Y/M/D parts (no timezone slide) · every row exactly `columns.length` cells.
- **One writer** — `xlWriteAndDownload(spec, filename)`: spec → SheetJS worksheet (typed cells,
  `!cols` widths, RTL view, header style where the vendored build supports it) → `XLSX.writeFile`.
- **One gate** — `canExportExcel()` = `isIdan() || isViewer()`; every 📗 button rendered only when
  true. Data reads reuse each report's existing fetch path (no new endpoints; RLS unchanged).

**UI:** a 📗 הורד Excel button next to each report's existing PDF/ייצוא button (visits-report
modal ×2 for #1/#3, attendance header for #2, certs tab for #4, inventory export bar for #5/#6).

## Testing (per docs/testing-methodology.md — created with this spec)

`test-exports.mjs` runner (added to the loop-until-green flow):
1. **Builder tests** — golden fixtures per report + column-contract sweep (no `\n`, arity, types)
   + edge cases (empty data, `ח"פ`/quotes/commas, RTL marks, string-numbers, null dates)
   + aggregation fixtures for #4 (hand-computed totals; cancelled cert excluded).
2. **File tests** — write via SheetJS in Node → parse back → assert cell values **and** types;
   mojibake canary (`�`, latin-junk regex) on Hebrew cells.
3. **Gating tests** — `canExportExcel()` matrix (idan ✅, viewer ✅, team/others ❌) + regression
   assert that viewer write-blocks are unchanged.
4. **Manual smoke (once, at release):** open all 6 real downloads in Excel — columns split, RTL,
   Hebrew renders, filter works.

## Out of scope

- Report #2 activity-report (clipboard text) and my-tasks report — text-oriented, not tabular; add later if asked.
- PUSH notifications (separate spec, still parked).
- Restyling the existing print/PDF reports.
