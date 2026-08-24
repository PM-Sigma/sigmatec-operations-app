# Spec — Site consolidation, sub-sites, backend integrity & card cleanup

STATUS: ✅ SHIPPED — released to main as 1.67 on 2026-08-24, verified live.
Blocked-on-עידן remainder: EMS sites for ניר עציון / עין דור / דגניה ב.
Branch: `feat/site-consolidation` (worktree `C:/Users/idann/Projects/SigmatecOps-wt-sites`, merged on top of `origin/main` 1.60)
Requested by: עידן, 2026-08-24. Precursor to the larger "operations app" pivot (customers / inventory / dev / attendance / schedule).

---

## 0. Ground truth (queried live from the prod EMS DB, 2026-08-24)

`claude_readonly_pm@prod-sigmatec-db…/postgres`, `SELECT id, code, name, active FROM sites` +
`count(employee_tasks)` per site. **59 sites** exist; the dashboard has **54 cards**.

### Sub-sites that exist in EMS but have NO card
| EMS site name | UUID | tasks | parent card |
|---|---|---|---|
| גשר השלום - מעוז חיים | `b7229e14-ff17-4f69-bc94-6d248cdadd7e` | 1 | מעוז חיים |
| שדה אליהו - חקלאות | `14a28537-15a6-4860-8a57-410d9cbf738c` | 0 | שדה אליהו |
| מכללת ספיר - פנימי | `de0b71a3-b0c2-48d8-94b5-67c02561640e` | 0 | מתחם חינוך שער הנגב |
| שלוחות ספק חיצוני | `60520f2f-a813-41e4-8fbf-783800ca86ad` | 0 | שלוחות |
| שער הגולן מחוץ למחלק | `9cbdadcd-0c5f-40de-a804-c429bf9bcf3e` | 0 | שער הגולן |

גשר השלום and שדה אליהו-חקלאות are today **folded into the parent's** `KIBBUTZ_SITE_MAP`
entry (2 UUIDs), so their tasks appear on the parent card. The other three are unmapped
entirely — invisible to the dashboard.

### Cards with a broken backend
| Card | Cause | Fix |
|---|---|---|
| כפר עזה | site `d1ed862f-a03a-4a43-8c22-1f19028a1b68` EXISTS (1 open task) but is **missing from `KIBBUTZ_SITE_MAP`** | add mapping |
| דביר | site `52b24c7f-dfb8-4985-bd25-51f9ad082a83` EXISTS (1 task), missing from map | add mapping |
| ניר עציון | **no EMS site at all** | cannot fix in code — עידן must create it in EMS |
| עין דור | **no EMS site at all** | same |
| דגניה ב | **no EMS site at all** (only "דגניה א" = `cc079fe9…`) | same |

`פזגז` (`95dfc142…`, 0 tasks) is an EMS site with no card — a gas supplier, not a kibbutz
customer. Out of scope, recorded here so a later audit doesn't re-flag it. `Test Site` and
`Wilson` are test rows.

### Energy-split cards
`אור הנר` is **one** EMS site (`9d755469…`, 3 tasks) but **two** dashboard cards —
`אור הנר חשמל` and `אור הנר גז` — both mapped to the same UUID, so its 3 tasks render twice.
Side-effect: `CUSTOMER_CODES` is keyed `'אור הנר': 915`, which matches neither card name, so
both show `⚠️ אין קוד`. No other card is energy-split (`עין המפרץ` and `עין השופט` already
carry a combined `⚡ חשמל + 💧 מים` badge on one card).

### Region gaps
`region` comes from the Sheet row. Rows with an empty region: **61 (דגניה ב), 62 (דפנה)** —
plus a data bug: the Sheet has **three** `שדה אליהו` rows (28 with region `העמקים`, and
duplicates 63 + 64 with none). `enrichCardsWithSheet` builds `byName[t.name] = t` — last wins —
so row 64 shadows row 28 and the שדה אליהו card loses its region.

---

## 1. Scope (six work items)

### A — Unify the energy-split אור הנר card
- `index.html`: the two `done` cards collapse into one `data-name="אור הנר"`, label `אור הנר`,
  badge `⚡ חשמל + 🔥 גז`.
- `KIBBUTZ_SITE_MAP`: drop `"אור הנר גז"` / `"אור הנר חשמל"`, add `"אור הנר": ["9d755469…"]`.
- The Sheet still carries rows 12/13 under the split names. A `SHEET_NAME_ALIASES` map folds
  both onto `אור הנר` so the card keeps its status/owners/region/row and saves target row 12.
- `CUSTOMER_CODES['אור הנר'] = 915` now matches → the `⚠️ אין קוד` badge disappears.

### B — A card per sub-site
Five new cards, each with `data-subsite-of="<parent>"`, placed in the parent's grid, showing a
`↳ <parent>` chip. Each is mapped to its own UUID, and the UUID is **removed from the parent's**
map entry (מעוז חיים and שדה אליהו drop to a single UUID) so no task renders on two cards.

| New card `data-name` | grid | UUID |
|---|---|---|
| גשר השלום | done (parent מעוז חיים) | `b7229e14…` |
| שדה אליהו - חקלאות | done (parent שדה אליהו) | `14a28537…` |
| מכללת ספיר | done (parent מתחם חינוך שער הנגב) | `de0b71a3…` |
| שלוחות ספק חיצוני | pending (parent שלוחות) | `60520f2f…` |
| שער הגולן מחוץ למחלק | pending (parent שער הגולן) | `9cbdadcd…` |

Sub-site cards have no Sheet row yet; the first save through the edit modal creates one
(`saveTask` posts `row: null` → the Apps Script returns `created`). Until then they render from
the static markup + the region fallback (item D). They are exempt from the `⚠️ אין קוד` badge —
a sub-site bills under its parent's customer code.

### C — Backend integrity for every card
- Add `כפר עזה` → `d1ed862f…` and `דביר` → `52b24c7f…` to the map.
- ניר עציון / עין דור / דגניה ב keep the existing `⚠️ לא מקושר ל-EMS` indicator and the hard
  block on task creation (shipped in 1.59). They are listed as an explicit
  `KNOWN_UNLINKED` allowlist so the contract test can assert *nothing else* is unlinked.
- Contract test: every `.kibbutz` card is either in `KIBBUTZ_SITE_MAP` or in `KNOWN_UNLINKED`;
  every mapped UUID is a real EMS site UUID; no UUID appears under two card names.

### D — A region on every card
- Fix the duplicate-row shadowing: when building `byName`, do not let a row without a region
  overwrite one that has it.
- `REGION_FALLBACK` map applied when the Sheet row has no region:
  `אור הנר`→`דרום, עוטף עזה והנגב` · `דגניה ב`→`העמקים` · `דפנה`→`גליל וגולן` ·
  `גשר השלום`/`שדה אליהו - חקלאות`/`שלוחות ספק חיצוני`/`שער הגולן מחוץ למחלק`→`העמקים` ·
  `מכללת ספיר`→`דרום, עוטף עזה והנגב`.
- Contract test: after enrichment every card carries a `.region-badge`.

### E — Remove the data-entry procedure everywhere
Delete, not hide: the `proc-btn` render block, `toggleProcedure()`, the `proc` field in
`parseTaskField`/`serializeTaskField`, `[PROC_DONE]` handling, `currentParsed.proc` in
`saveTask`, `'proc-btn'` in `10-activity.js` `BOTTOM_CLASSES`, the `.proc-btn`/`.proc-done`/
`.proc-pending` CSS, and `[PROC_DONE]` from the mock fixtures in `01-data.js`.
Legacy `[PROC_DONE]` text already in the Sheet is simply ignored on read and dropped on the
next save — no migration.

### F — Live ("עלה לאוויר") cards lose the construction-process fields
For every card in `grid-done` / `data-types` containing `done`:
- strip `data-step` from the static markup and never render `.stepper` / `.current-step-label`;
- never render the construction-progress note (`parsed.note`, and the static `.kibbutz-note`
  carrying "נותרה: הדרכה" / "נותרו: …" text) — those cards are past setup;
- hide the `📍 שלב נוכחי` and `📝 הערת הקמה` inputs in the edit modal when the open card is done.
Non-done cards keep the stepper and the note unchanged.

---

## 2. Files touched
`index.html` · `js/src/01-data.js` (map, aliases, region fallback, enrichment, proc removal,
done-card rules) · `js/src/10-activity.js` (BOTTOM_CLASSES, edit-modal field gating, saveTask) ·
`css/app.css` (proc CSS) · new `test-site-consolidation.mjs`.
Build with `node build.mjs` — never edit `js/app.js`.

## 3. Out of scope / handed to עידן
- Creating EMS sites for **ניר עציון, עין דור, דגניה ב**.
- Deleting the now-orphan Sheet row 13 (`אור הנר גז`) and the duplicate `שדה אליהו` rows 63/64.
- `test-cert-pdf.mjs` fails in git-bash (its `cmd /c timeout /t` is shadowed by GNU `timeout`) —
  pre-existing, unrelated.
- The larger pivot to a customers/inventory/dev/attendance/schedule app.
