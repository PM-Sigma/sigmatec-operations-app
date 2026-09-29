# פעולות שטח — the field hub (29.9)

STATUS: 🟢 BUILT — awaiting עידן phone check + MAIN merge. Branch `feat/field-ops-hub` (worktree `C:\Users\idann\Projects\SigmatecOps-fieldhub`).
Resume: build per §4 in order (A → B → C), each step committed; gates in §6.

## 1. Goal (עידן 29.9 + MAIN decisions)
`fieldops` becomes the ONE page of the field world. Top → bottom:
0. **היום שלי** — compact strip: today's visits (calendar, read-only; tap → that day in יומן), a
   "סיכום ביקור" quick entry (the existing visit form, pre-set to the chosen kibbutz), my open tasks due today
   or overdue (MyTasks data, read-only; tap → the task).
1. **נוכחות** — the attendance island + its legacy report (PDF/Excel read `window._attendanceRows`), unchanged.
2. **קריאות IP** — the Modbus/IP meter check (`FieldOps.tsx`), unchanged.
3. **צריבות** — `BurnsPage.tsx`, unchanged.
A sticky SegmentedControl (4 items, only the sections the user may see) jumps between sections.

## 2. Decisions (MAIN, 29.9)
- **One redirect point:** `showPage()` (js/src/02-init-attendance.js) maps `attendance` → `fieldops#attendance`
  and `burns` → `fieldops#burns` before the gate ladder. Every caller (push `fillToday`/`fillMissing`, Gaps,
  home burns strip, restored `sigma_page_v1`, landing setting `attendance`) goes through it.
- **Containers:** `#attendance-view` and `#burns-view` stay (legacy code + html guard + loadOnShow depend on the
  ids) but move INSIDE `#fieldops-view` as section wrappers; their display follows the SECTION gate, not the page.
  The three islands lazy-load when `#fieldops-view` first shows (no boot-bundle growth).
- **Gates:** section gates are the old page gates — attendance = `canSeeAttendance`, IP = new key `modbus`
  (= the old `fieldops` rule: staff, never the viewer), burns = `canShowPage('burns')`. `canShowPage('fieldops')`
  = any section visible. The viewer therefore sees נוכחות (read-only) + צריבות, never IP. The field-ops edge
  function still enforces its own rule server-side.
- **Nav:** the נוכחות entry leaves ⋯ and the bottom bar; field leads (אביאם/ניתאי) get a "שטח" tab in its slot
  (MapPin). `fieldops` joins NAV_PAGES (it took attendance's bar slot). The ⋯ צריבות entry (if any) goes;
  פעולות שטח stays in ⋯. Landing setting "נוכחות" → labelled "פעולות שטח" and maps to fieldops.
- **Embedded islands:** each island gets an `embedded` prop — no own back arrow; its PageActionRow title
  becomes the section heading; all its actions (person-toggle, PDF, Excel, burns export…) stay.
- **Kibbutz burns row:** KibbutzDetail status tab, near meters: "צריבות · N נותרו / M" — shown only if the
  kibbutz has burn rows or the user can write burns. Tap → writes `site` into BurnsPage's filter and
  `showPage('burns')` → fieldops#burns. BurnsPage shows a clear "סינון: <קיבוץ> ✕" chip when a site filter is set.
- **Out of scope:** "התיק שלי" (personal stock) — follow-up (inventory permissions).

## 3. Role matrix
| user | היום שלי | נוכחות | IP | צריבות |
|---|---|---|---|---|
| עידן | ✓ | ✓ (person-toggle) | ✓ | ✓ |
| עמיחי | ✓ | ✓ (toggle) | ✓ | ✓ |
| אביאם / ניתאי | ✓ | ✓ own | ✓ | ✓ |
| מתניה | ✓ | per canSeeAttendance | ✓ | ✗ |
| viewer | ✗ | ✓ read-only | ✗ | ✓ read-only |

## 4. Build steps
A. Routing + containers + gates + nav + embedded islands + unit tests (routing/redirect, role matrix).
B. היום שלי strip + kibbutz burns row + filter chip + unit tests.
C. Playwright (360/412 × light/dark: order, jump nav, redirects, kibbutz row with a 60-kibbutz fixture, no
   overlap/overflow, dark contrast 0) + screenshots in `qa/evidence/field-hub/` + design review fixes.

## 5. Suggestions for עידן (not built)
See the handoff report in §7.

## 6. Gates
`node build.mjs`, `cd app && npm run build` (ui/sigma.js ≤ 311,296 B), `node scripts/test-all.mjs` green,
test-html-guard green, Playwright on port 8471 (config reverted), no conflict markers, `node --check sw.js`.

## 7. Handoff
- Branch `feat/field-ops-hub`; preview https://raw.githack.com/PM-Sigma/sigmatec-operations-app/feat/field-ops-hub/index.html
- test-all green; field-hub.spec 12 tests × 4 phone projects green; dark-contrast 0 on the hub; ui/sigma.js 310,864 B.
- Known unrelated fail: viewer-shell.spec.ts:42 (expects "רעיון / באג" in ⋯).
- VERSION bumped locally by build.mjs (2.14x) — MAIN re-stamps on merge.
- Evidence: qa/evidence/field-hub/ (64 PNGs).
- Suggestions (not built): התיק שלי (personal stock); ⏱ quick "סיום יום" (attendance + last visit in one tap);
  offline queue badge for IP reads; burns "next meter" shortcut on the kibbutz row; today's route map link (Waze).
