# Kibbutz ↔ EMS site integrity — design

STATUS: 🟡 OPEN — NOT built. Resume: read this spec, then writing-plans → build on `feat/kibbutz-site-integrity` (cut from `dev`).

**Date:** 2026-07-19 · **Author:** planning session (Fable) · **Feature 1 of 4** in the EMS-linking batch
(A=this · D=delivery-note overhaul · B=quick-order-from-task · C=remove מלאי בקיבוצים window).

---

## Problem

A kibbutz card resolves to its EMS site through **two** inconsistent paths, and both have drifted:

1. `KIBBUTZ_SITE_MAP` (hardcoded name→UUID, [js/src/01-data.js:666](../../../js/src/01-data.js)) — used by
   card task widgets via `kibbutzSiteIds`. Hand-maintained, so it drifts.
2. `emsSiteIdForKibbutz` ([js/src/14-calendar.js:341](../../../js/src/14-calendar.js)) — used at task-**creation**
   time. It does an exact match **then a loose `indexOf` containment match** either direction — which silently
   picks the wrong site.

There is **no indicator** and **no block** when a kibbutz has no confident site, so tasks get created against the
wrong site (or a dead-lettered site-less task).

### Confirmed live-data bugs (from EMS `ems_cache` real tasks, 2026-07-19)

| Kibbutz | Real EMS site (from live tasks) | App state | Fix |
|---|---|---|---|
| **שלוחות** | `9a0ba3d3-b7f2-4597-b3ee-3537e4f8d75e` ("שלוחות") | map has **wrong** UUID `07ab3dee-…`; `kibbutz_details` seeded as "שלטרון שילוט אלקטרוני בע\"מ" (wrong company) | fix map UUID + fix `kibbutz_details` |
| **דפנה** | `490a865d-c4f4-4a4a-96da-14a273e7f03b` ("דפנה", 4 open tasks) | **absent** from map and `kibbutz_details` | add map entry + `kibbutz_details` row |
| **ניצנים** | `ae9ac4c6-119e-496c-9aad-331e95a2551d` ("ניצנים", 1 open task) | **absent** (if a ניצנים card exists) | add map entry + `kibbutz_details` row |

EMS site names now essentially **equal** the card names → an exact name match is more reliable than the stale
hardcoded UUIDs. The hardcoded map is kept only as an **offline fallback**.

## Goals

1. Every kibbutz resolves to the **correct** EMS site, or to **nothing** — never the wrong one.
2. A kibbutz with no confident site shows a clear **⚠️ לא מקושר ל-EMS** indicator.
3. **Every** EMS-task-creation path is **hard-blocked** for a site-less kibbutz.
4. עידן can **audit** every kibbutz→site link in one place.

Non-goals: creating EMS sites from the app; changing how tasks are read/displayed beyond the indicator.

## Design

### 1. Single exact-match resolver (kills the fuzzy bug)
Rewrite `emsSiteIdForKibbutz(name)`:
1. **Exact** normalized-name match against live `/sites` (`emsNormName`, already exists) → return its id.
2. Offline / no live match → the **corrected** `KIBBUTZ_SITE_MAP` (first UUID).
3. Otherwise `''`.
**Remove the `indexOf` containment branch entirely.** `kibbutzSiteIds` stays map-based for card widgets; the map
is corrected (below) so both paths agree.

### 2. `kibbutzHasSite(name)` — the single gate
Returns true only on a **confident** resolve:
- an exact live `/sites` name match exists, **or**
- a `KIBBUTZ_SITE_MAP` entry exists **and** that UUID appears among the synced `ems_cache` site ids (proof the
  site is real in EMS).

This one predicate backs the indicator **and** every block, so they can never disagree.

### 3. Data corrections (applied as part of A, confirmed from live EMS)
- `KIBBUTZ_SITE_MAP`: שלוחות → `9a0ba3d3-…`; add דפנה → `490a865d-…`; add ניצנים → `ae9ac4c6-…`.
- `kibbutz_details` (Supabase, via MCP): fix שלוחות's `legal_name`/`company_id` (drop "שלטרון"); insert דפנה and
  ניצנים rows (legal_name/company_id/contact — blank where EMS has none, editable on the cert later).

### 4. Indicator
On each kibbutz card and the kibbutz modal, when `!kibbutzHasSite(name)`, render a `⚠️ לא מקושר ל-EMS` badge
(reuse existing `.card-ems`-style chip; escaped). Purely presentational.

### 5. Hard block
`kibbutzHasSite` guards **all three** creation paths:
- kibbutz-modal "open new EMS task" affordance → disabled + tooltip.
- customer-order approval `createTask` ([js/src/13-ems.js:88](../../../js/src/13-ems.js)) → refuse before enqueue,
  surface a clear toast instead of dead-lettering.
- (future feature B) quick-order-from-task → same gate.
Tooltip / message: **"אין אתר EMS מקושר לקיבוץ — צור או קשר את האתר ב-EMS תחילה."**

### 6. Audit view (עידן-only)
A collapsible **בדיקת קישור אתרים** panel inside the EMS משימות tab, gated to עידן. Read-only list: every kibbutz
card × resolved site name × ✅/⚠️. Built from `SHEET_DATA` kibbutz names + the resolver + `ems_cache`, so it needs
no new data source. Lets עידן spot every unlinked/mislinked kibbutz at a glance and fix it in EMS.

## Files touched
- `js/src/14-calendar.js` — resolver rewrite + `kibbutzHasSite`.
- `js/src/01-data.js` — `KIBBUTZ_SITE_MAP` corrections.
- `js/src/13-ems.js` — block in `createTask` path.
- kibbutz card/modal render (locate: card render in `05`/`08`; modal in visits/kibbutz module) — indicator + block on the "new EMS task" affordance.
- EMS tab module (`14-calendar.js` / `13-ems.js`) + `index.html` — audit panel markup.
- Supabase `kibbutz_details` — data fixes (MCP).
- `build.mjs` run after edits.

## Testing (per docs/testing-methodology.md)
- **Pure resolver units** (`test-site-resolver.mjs`): exact match wins; offline falls back to corrected map; no
  match → `''`; the containment branch is gone (a partial name does NOT match); שלוחות/דפנה/ניצנים resolve to the
  correct UUIDs.
- **Gate matrix**: `kibbutzHasSite` false → each of the three creation paths refuses; true → each proceeds.
- **Indicator**: card with a site-less name renders the badge; a linked one does not.
- Regression: existing EMS suites stay green. One manual smoke (open דפנה + שלוחות cards, confirm correct tasks +
  no wrong-site creation) recorded at release.

## Open questions
None — all decisions locked in brainstorming (exact-match+fallback resolver; hard block+indicator; audit in EMS
tab עידן-only; data fixes applied in A).
