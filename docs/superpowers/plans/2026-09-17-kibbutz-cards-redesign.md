# Kibbutz Cards Redesign + Field Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "סיגמה 2.00": data-driven kibbutz cards with meeting bullets + full EMS tasks, a field-worker arrival/briefing flow with a 2-hour visit-summary push, a feedback box with voice, and a brand/dark-mode refresh.

**Architecture:** Vanilla JS PWA (`js/src/NN-*.js` concatenated by `node build.mjs` into `js/app.js`), Supabase REST + Edge Functions (`push-send`), static `index.html` + `css/app.css`. New modules are pure-builder + thin-writer so `node test-*.mjs` runners can prove them without a browser. Cards become rows in a new `kibbutzim` table rendered client-side; everything else attaches to those cards as today.

**Tech Stack:** ES5-style browser JS (no bundler, no framework), Supabase (Postgres, RLS, pg_cron, Edge Functions on Deno), Web Push, Web Speech API, Groq Whisper, Google Fonts (Heebo), `motion` UMD from cdnjs.

**Spec:** `docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md` (APPROVED 17.9.26). Mockup: https://claude.ai/artifact/URG8xSZMq1SiWk2u3pWRnP

## Global Constraints

- Work ONLY in worktree `C:\Users\idann\Projects\SigmatecOps-wt-cards` on branch `feat/kibbutz-cards-redesign` (off `origin/dev`). Sub-branches `feat/kcr-<task>` merge into it. Never touch `main`/`dev` directly; never `git add -A`.
- Edit `js/src/*.js`, never `js/app.js`. Run `node build.mjs` only at the end of a task (it rewrites `js/app.js`, `index.html ?v=`, `sw.js` cache name, `VERSION`). Final release uses `node build.mjs major` → `2.00`.
- Tests: plain `node test-<area>.mjs` with `assert`, pattern of `test-visit-cert-gate.mjs` (read the source file, stub `document`/`localStorage`/`fetch`, eval, assert). One runner per task; the full set must be green before a task is "done": `for f in test-*.mjs; do node $f || exit 1; done`.
- Hebrew UI copy exactly as in the spec. Section labels: **🆕 לקוחות חדשים**, **✅ לקוחות פעילים**. Tag: **🤝 בתהליך שיווקי**. App name **סיגמה**, subtitle **תפעול שטח**.
- No hard-coded colors in new CSS — tokens only (`--brand-1:#06C2CB`, `--brand-2:#1ABE63`, `--brand-grad`, surfaces). Dark mode via `:root[data-theme="dark"]` + `prefers-color-scheme`.
- Roles: `getCurrentUser()` returns the Hebrew name; admins = `'עידן'`, `'עמיחי'`; field = `ATT_PEOPLE = ['אביאם','ניתאי']`; `isViewer()` must stay read-only everywhere (regression assert in every role test).
- Secrets never in repo. Supabase anon key is public (already in `01-data.js`/`22-push.js`). Groq key only as an Edge Function secret.
- Delivery-cert gate (spec §5 rules 1–4) must remain byte-for-byte in behavior; `test-visit-cert-gate.mjs` must keep passing untouched.
- Commit after each task: `git add <your files> && git commit -m "<type>(kcr): <what>"` + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility | Task |
|------|----------------|------|
| `db/kibbutzim.sql` | table + RLS + seed insert | 1 |
| `db/kibbutzim_seed.mjs` | parse current `index.html` cards → SQL insert rows (one-shot) | 1 |
| `js/src/24-kibbutzim.js` | `kibbutzimLoad()`, pure `buildCardHtml(row)`, `renderKibbutzCards(rows)`, section counts, filters, ➕/edit sheet | 1, 1b |
| `index.html` | remove static cards/sections/progress/compact/priority; add 2 section shells, bottom nav, sheets, feedback modal, import modal | 1, 4, 5, 6 |
| `js/src/01-data.js` | remove status/owner modal code, compact mode; hook `renderKibbutzCards` before `enrichCardsWithSheet` | 1 |
| `js/src/12-reports.js` | "משימות באחריותי" from EMS cache | 1 |
| `js/src/17-staff.js`, `kibbutz-stats.html` | label renames | 1 |
| `db/kibbutz_meeting_notes.sql` | table + RLS | 2 |
| `js/src/25-meeting-notes.js` | pure `parseMeetingSummary(md, aliases)`, `notesLoad()`, `renderCardNotes(card,name)`, import modal, ➕ task from bullet | 2 |
| `js/src/13-ems.js` | add `description` to cache slim; card widget renders full task | 3 |
| `css/app.css` | tokens, dark block, bottom nav, card/bullet/task styles, remove dead CSS | 4 |
| `js/src/26-theme.js` | theme toggle + `theme-color` meta | 4 |
| `db/field_checkins.sql` | table + RLS | 5 |
| `js/src/27-field.js` | arrival sheet, briefing, `checkinCreate()`, deep link `#visit?kibbutz=` | 5 |
| `supabase/functions/push-send/index.ts` | mode `visitCron` | 5 |
| `db/cron_visit_15min.sql` | pg_cron job | 5 |
| `db/feedback.sql` | table + Storage bucket policy | 6 |
| `js/src/28-feedback.js` | feedback sheet, Web Speech, MediaRecorder fallback, admin inbox | 6 |
| `supabase/functions/transcribe/index.ts` | Groq Whisper proxy | 6 |
| `test-kibbutzim.mjs`, `test-meeting-notes.mjs`, `test-ems-card.mjs`, `test-theme.mjs`, `test-field.mjs`, `test-feedback.mjs` | runners | each |
| `docs/CHANGELOG.md`, `docs/backlog.md`, `docs/INDEX.md`, `docs/modules.md`, `docs/data-and-security.md` | memory contract | 7 |

---

### Task 1: Kibbutzim as data (table, seed, render) + Part A removals/renames

**Agent:** Opus. **Branch:** `feat/kcr-kibbutzim`.

**Files:**
- Create: `db/kibbutzim.sql`, `db/kibbutzim_seed.mjs`, `js/src/24-kibbutzim.js`, `test-kibbutzim.mjs`
- Modify: `index.html` (lines ~140–345 header/progress/sections; modal ~750–830), `js/src/01-data.js` (compact toggle ~50–60; owners rows ~935–955; modal save/load of `editStatus/editOwner*/editCategory/editStep/editSetupNote`), `js/src/12-reports.js:147-212`, `js/src/17-staff.js:110-125`, `kibbutz-stats.html` (labels), `css/app.css` (`.compact-*`, `.progress-*`, `.priority-*`, `.ready-flow-flag`, `.flow-active-flag`, `.manual-flow-flag`, `.new-client-flag`, `.owners-row`, `.owner-chip`, `.excel-status`, `.urgent-alert*`)

**Interfaces:**
- Produces (global, from `24-kibbutzim.js`):
  - `window.KIBBUTZIM` — `Array<{id,name,display_name,section:'new'|'active',energy:string[],marketing:boolean,region:string,ems_site_ids:string[],archived_at:string|null}>`
  - `buildCardHtml(row)` → string. Pure. Output root: `<div class="kibbutz {new|active}" data-name="{name}" data-section="{section}" data-marketing="{true|false}"><div class="kibbutz-name-row"><div class="kibbutz-name">{display_name||name}</div><span class="energy-badge">…</span>{marketing? '<span class="tag-marketing">🤝 בתהליך שיווקי</span>':''}</div></div>`. Energy label map: `electric→'⚡ חשמל'`, `water→'💧 מים'`, `gas→'🔥 גז'`, joined with `' + '`.
  - `REGION_ORDER = ['גליל עליון','גליל תחתון','עמק הירדן','עמק יזרעאל','עמק המעיינות','בקעת בית שאן','חוף הכרמל','שרון','שפלה','שער הנגב','נגב']` (extend from seed data; unknown regions after the list, alphabetical; `''` last as `ללא איזור`).
  - Pure `groupBySection(rows)` → `{new:[{region, rows:[…alpha he-IL]}], active:[…]}` — regions ordered by `REGION_ORDER`, rows alphabetical by `display_name||name` with `localeCompare(…,'he')`.
  - `renderKibbutzCards(rows)` — fills `#grid-new` and `#grid-active` from `groupBySection`; before each region's cards inserts `<div class="region-label" data-region="{region}">{region}</div>` (subtle: 11px, muted, hairline; spans the full grid row via `grid-column:1/-1`); updates `.section-count` and chip counts `#cnt-all/#cnt-new/#cnt-active/#cnt-marketing`, skips `archived_at != null`. Region labels are omitted when a section has a single region.
  - `kibbutzimLoad()` → Promise<rows>; GET `kibbutzim?select=*&order=region,name&archived_at=is.null` via the `sbGet` pattern; caches in `localStorage['kibbutzim_v1']` for offline first paint.
  - `kibbutzByName(name)` → row|undefined (also matches `display_name`).
- Consumes: `applyFilters()` in `01-data.js` (must be updated to read `data-section`/`data-marketing` instead of `data-types`), `kibbutzHasSite`, `applyCardEmsWidgets`, `applyCardSiteWarnings` (they query `.kibbutz[data-name]` — unchanged).

**Steps:**

- [ ] 1. `db/kibbutzim.sql`:
```sql
create table if not exists kibbutzim (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- canonical = old card data-name
  display_name text,
  section text not null check (section in ('new','active')),
  energy text[] not null default '{electric}',
  marketing boolean not null default false,
  region text not null default '',
  kind text not null default 'kibbutz' check (kind in ('kibbutz','subsite')),
  parent text,
  ems_params jsonb,
  ems_site_ids text[] not null default '{}',
  archived_at timestamptz,
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table kibbutzim enable row level security;
create policy kibbutzim_read on kibbutzim for select using (true);
create policy kibbutzim_write on kibbutzim for all to authenticated using (true) with check (true);
```
  (Same staged pattern as `db/rls_staged.sql`; viewer role is blocked client-side as elsewhere.)
- [ ] 2. `db/kibbutzim_seed.mjs`: read `index.html`, regex every `<div class="kibbutz …" data-name="X" data-types="T"…>` inside `#grid-priority/#grid-new_client/#grid-done/#grid-pending`; map per spec §2: `grid-new_client` → `new`; `data-types` contains `track priority` → `new`; `grid-done` → `active`; `grid-pending` or `pending priority` → `active` + `marketing=true`; energy from `.energy-badge` text (`💧`→water, `🔥`→gas, else electric; both when `+`); `display_name` = inner `.kibbutz-name` text when it differs from `data-name`. Region: read the Supabase `tasks` table (`select name,region from tasks`) via the anon REST key at seed time and match by name; unmatched → `''` (עידן fills them in the sheet). Print `insert into kibbutzim (name,display_name,section,energy,marketing,region) values …;` to stdout, and the count. Run it, save output to `db/kibbutzim_seed.sql`, append to `kibbutzim.sql`. **Expected: 44 rows** (14 priority + 3 new + 22 done + 14 pending − duplicates by name; assert no duplicate `name`).
- [ ] 3. Test `test-kibbutzim.mjs` (write first, run, see FAIL):
  - `buildCardHtml` golden: `{name:'אור הנר גז',display_name:'אור הנר — גז',section:'active',energy:['gas'],marketing:false}` → exact string above with `🔥 גז`.
  - marketing row emits `tag-marketing` span; `energy:['electric','water']` → `⚡ חשמל + 💧 מים`.
  - `groupBySection` golden: rows `[{name:'יגור',region:'עמק יזרעאל',section:'active'},{name:'אפיקים',region:'עמק הירדן',section:'active'},{name:'גבת',region:'עמק יזרעאל',section:'active'},{name:'שלוחות',region:'',section:'active'}]` → active groups in order `עמק הירדן`(אפיקים) · `עמק יזרעאל`(גבת, יגור — alphabetical) · `''`(שלוחות).
  - `renderKibbutzCards` with 4 stub rows (2 active in 2 regions, 1 new+marketing, 1 archived) → `#grid-new` has 1 card and 0 `.region-label` (single region), `#grid-active` has 2 cards + 2 `.region-label`, `#cnt-marketing` text `1`, `#cnt-all` `3`, archived not rendered.
  - contract: seed SQL parses → every row has section in set, no duplicate names, count 44.
  - regression: `isViewer()` true → `kibbutzimSave()` throws `'viewer'` before any fetch.
- [ ] 4. Implement `24-kibbutzim.js` (IIFE, expose on `window`). Hook: in `01-data.js` where Supabase data load resolves (the code that calls `enrichCardsWithSheet(data)`), call `await kibbutzimLoad().then(renderKibbutzCards)` **first**, then the existing passes. Offline: paint from cache immediately on `DOMContentLoaded`.
- [ ] 5. `index.html`: delete `#compactToggle`, progress block, `#urgentAlert`, `.priority-section`, all 4 static grids; add two section shells in this order: `🆕 לקוחות חדשים — בהקמה` (`#grid-new`) then `✅ לקוחות פעילים` (`#grid-active`). Filter chips: `all` · `new` (🆕 חדשים) · `active` (✅ פעילים) · `marketing` (🤝 שיווקי). Modal: remove `editStatus`, `editTask`, owners, `editCategory`, `editStep`, `editSetupNote`, the two banners and tip; rename tab ✏️ to `🗓 ישיבות` (content filled in Task 2; leave `<div id="tab-meetings"></div>`). Header: `⚡ מערכת ניהול סיגמטק` → Σ mark + `סיגמה` / `תפעול שטח` (structure only; styling in Task 4).
- [ ] 6. `01-data.js`: remove `toggleCompactMode`, owners-row injection, `.excel-status` injection, `updateProgressBar`-like code, modal read/write of removed fields (keep visit tab logic). `setFilter/applyFilters`: `all` shows all; `new`/`active` match `data-section`; `marketing` matches `data-marketing="true"`.
- [ ] 7. `12-reports.js buildMyTasksReport(person)`: replace status-line parsing with `emsCacheData().tasks.filter(t => t.assignee && (t.assignee.firstName||'').indexOf(person)===0 && EMS_CLOSED.indexOf(t.status)===-1)` grouped by site name; keep company tasks section. Update its header text to `📋 משימות EMS באחריותי — ${person}`.
- [ ] 8. `17-staff.js`, `kibbutz-stats.html`: `עלו לאוויר` → `לקוחות פעילים`, `ממתינים` → `בתהליך שיווקי`.
- [ ] 9. Remove dead CSS listed above. Run `node test-kibbutzim.mjs` → PASS, then full suite. `node build.mjs`. Smoke `index.html?login=0&sb=0`: two sections render from cache/mock (add a 3-row mock in the `?sb=0` mock branch of `01-data.js`).
- [ ] 10. Apply `db/kibbutzim.sql` to Supabase (MCP `apply_migration`, name `kibbutzim`). Verify `select count(*) from kibbutzim` = 44. Commit.

---

### Task 1b: ➕ קיבוץ חדש / תת-אתר sheet + EMS verification chain + edit/archive

**Agent:** Opus (EMS chain needs judgment). **Branch:** `feat/kcr-new-kibbutz`. Depends on Task 1.

**Files:** Modify `js/src/24-kibbutzim.js`, `index.html` (sheet markup), `test-kibbutzim.mjs`.

**Interfaces:**
- Produces: `openKibbutzSheet(row|null)` (null = create), `kibbutzimSave(row)` → Promise<row> (POST or PATCH `kibbutzim?on_conflict=name`, `Prefer: resolution=merge-duplicates,return=representation`), `kibbutzArchive(name)` → PATCH `archived_at=now()`. Pure `validateKibbutz(row)` → `{ok:boolean, errors:string[]}` (name required, trimmed, unique vs `KIBBUTZIM`, energy non-empty, section valid). `suggestEmsSite(name)` → `{id,name}|null` using live `/sites` exact match (reuse `emsSiteIdForKibbutz` from `13-ems.js`), fallback `KIBBUTZ_SITE_MAP`.
- **Two modes (spec §7b):** the sheet opens with a segmented choice `🏘 קיבוץ חדש (לקוח חדש)` / `↳ תת-אתר של קיבוץ קיים`. Sub-site mode adds a parent `<select>` (non-archived rows, alphabetical), hides section/region (inherited on save), and shows the **EMS chain panel** `#emsChain` with 5 rows (אתר ב-EMS · מונים · משימות פתוחות · אנשי קשר · קיבוץ-אב), each `⏳ → ✓ / ⚠️ / ✗ + value`.
- Pure `emsChainPlan(name, parentRow, allRows)` → ordered step list; pure `emsChainReduce(results)` → `{ems_site_ids, energy, ems_params, canSave:boolean, warnings:[…]}` where `energy` derives from meter counts (`electric` if count>0 … ; empty → `['electric']`), `canSave` true when step 1 passed OR user ticked `שמור בלי קישור`. Thin async `emsChainRun(name, parentRow)` calls: `getEmsSites()`; `emsApi('/meters?siteId='+id+'&take=500')` (catch → `{skipped:true}`); `emsApi('/employee-tasks?siteId='+id+'&statuses=open,in_progress,pending&take=100')`; `window._sbGet('site_contacts?select=*&site_id=eq.'+id)`; duplicate-link check against `KIBBUTZIM`. Button `🔄 בדוק מול EMS` also appears in edit mode for normal kibbutzim.
- Gate: `canManageKibbutzim()` = `['עידן','עמיחי'].indexOf(getCurrentUser())!==-1 && !isViewer()`. **Energy chips editable only when `isIdan()`** (`canEditEnergy()`); for others the chips render disabled with title `רק עידן משנה סוגי אנרגיה` and `kibbutzimSaveBody(row,user)` strips `energy` from the PATCH body when `!canEditEnergy()` (server keeps the old value). Region is a free-text input with a datalist of `REGION_ORDER` + existing regions, editable by both admins.

**Steps:**
- [ ] 0. Tests for the chain: `emsChainReduce` goldens — all-pass fixture (site found, meters `{1:12,2:3}` → `energy:['electric','water']`, 2 open tasks, 1 contact) → `canSave:true`, `ems_params.meters.total===15`; site-not-found → `canSave:false`, warnings `['לא נמצא אתר ב-EMS']`, other steps `skipped`; duplicate site id already on row `יגור` → warning `'האתר כבר מקושר ל-יגור'`; meters call skipped → `energy:['electric']` + warning. `validateKibbutz` for a sub-site requires `parent` to exist and not be archived (`'קיבוץ-אב לא נמצא'`), and inherits `section`/`region` from it (test the returned normalized row).
- [ ] 1. Tests: `validateKibbutz` (empty name → error `'שם חובה'`; duplicate → `'קיבוץ בשם הזה כבר קיים'`; ok row → `{ok:true,errors:[]}`); role matrix `canManageKibbutzim` for עידן/עמיחי true, אביאם/ניתאי/מתניה/viewer false; `canEditEnergy` true only for עידן; `kibbutzimSaveBody(row, user)` pure → for עמיחי the body has no `energy` key, for עידן it does; `kibbutzimSave` throws when gate false.
- [ ] 2. Sheet markup `#kibbutzSheet` (bottom sheet on phone, dialog on desktop): `#kName` input, section toggle (`🆕 לקוח חדש` / `✅ פעיל`), energy chips (multi), `🤝 בתהליך שיווקי` switch, EMS site row (auto-filled by `suggestEmsSite`, badge `✓ מקושר` / `⚠️ לא נמצא — יישמר בלי קישור`), `שמור קיבוץ` (56 px), `ארכב קיבוץ` (edit mode, confirm dialog). Header button `➕ קיבוץ חדש` shown only when `canManageKibbutzim()`. Card click for admins opens the modal whose `🗓 ישיבות` tab header has an `✏️ פרטי קיבוץ` link → `openKibbutzSheet(row)`.
- [ ] 3. After save → update `KIBBUTZIM` in place, `renderKibbutzCards`, re-run `applyCardSiteWarnings()`/`applyCardEmsWidgets()`, toast `נשמר: <name>`.
- [ ] 4. Run runner + full suite, `node build.mjs`, smoke create/edit/archive on `?login=0` against Supabase. Commit.

---

### Task 2: Meeting notes — parser, table, import, card timeline, ➕ EMS task from bullet

**Agent:** Opus. **Branch:** `feat/kcr-meeting-notes`. Depends on Task 1.

**Files:** Create `db/kibbutz_meeting_notes.sql`, `js/src/25-meeting-notes.js`, `test-meeting-notes.mjs`, `test/fixtures/summary_17.9.26.md` (copy of `C:\Users\idann\Projects\Sigmatec Management\Company Meeting\17.9.26\summary_17.9.26.md`), `test/fixtures/summary_6.9.26.md` (copy of `…\6.9.26\_edited2.md`), `test/fixtures/expected_17.9.26.json`. Modify `index.html` (import modal, modal tab content), `js/src/13-ems.js` (export `createTask` prefill helper).

**Interfaces:**
- `parseMeetingSummary(md, opts)` → `{ meeting_date:'YYYY-MM-DD', meeting_kind:'company'|'dev'|'client', sections: Array<{ heading:string, kibbutzim:string[] /*resolved names or []*/, unmatched:string[], bullets: Array<{ seq:number, text:string, owners:string[], quiet:boolean }> }> }`. Pure; `opts.aliases` = `{ 'דגניה א':'דגניה', 'אור הנר':['אור הנר חשמל','אור הנר גז'], … }`, `opts.known` = array of card names.
  - Date: first line `**סיכום ישיבת חברה — 17.9.26**` → `2026-09-17`; `ישיבת פיתוח` → `dev`; `פגישה … קיבוץ X` → `client`.
  - Section start regex: `^\*\*(\d+)\.\s+(.+?)\*\*\s*$`; name part: strip ` — .*$`; split on ` · ` → multiple kibbutzim.
  - Body = paragraphs until next section or a `**`-only heading like `**הנחיות רוחביות**`. Trailing owner clause regex: `\*\*אחריות\s+([^*]+?)\.?\*\*\s*$` → owners: split `/[,،]|\s+ו(?=[א-ת])/`, strip parenthesised scopes `\s*\([^)]*\)`, trim; known people whitelist `['עידן','עמיחי','אביאם','ניתאי','מתניה','אבצן','אליה']` (unknown → keep raw).
  - Sentence split: on `(?<=[.!?])\s+(?=[^\s])` but not after a digit-dot-digit (`2.9`) — implement by protecting `\d\.\d` and `\bin_progress\b` first. Sentences `≤ 3` chars dropped. `quiet=true` when text matches `/^(ללא פערים|אין חדש|עדיין לא|ללא משימות)/`.
  - `seq` increments per kibbutz section starting at 1.
- `notesLoad()` → GET `kibbutz_meeting_notes?select=*&order=meeting_date.desc,seq` → `window.MEETING_NOTES` (array); `notesForKibbutz(name)` → grouped `[{meeting_date, meeting_kind, bullets:[…rows]}]` newest first.
- `renderCardNotes(cardEl, name)` — inserts `.card-notes` after `.kibbutz-name-row`: latest meeting fully; older meetings inside `<details class="card-notes-history"><summary>היסטוריה · 6.9 · 23.8</summary>…</details>`. Each bullet row: `.note-bullet[data-id]` · text · `.owner-chip` per owner · action: `<button class="note-act" title="פתח משימה ב-EMS">＋</button>` when `!ems_task_id && !done_at`, `<button class="note-act linked">🔗</button>` when linked (click → `openKibbutzEmsTask(ems_task_id)`), long-press/⋯ → `noteMarkDone(id)` toggles `done_at`.
- `noteOpenTask(noteId)` → prefill `emsTaskModal`: `site` = kibbutz's EMS site (via `emsSiteIdForKibbutz`), `title` = first clause `≤70` chars (cut at ` — `/`:`/`;` else hard cut + `…`), `description` = `text + '\n\nמקור: ישיבת חברה ' + dd.m.yy`, `assignee` = `owners[0]` via existing name→user lookup, priority `medium`. On successful create (existing `createTask` returns the task) → PATCH note `ems_task_id`, re-render that card.
- `openMeetingImport()` (admins only): textarea, auto-detected date/kind (editable), **תצוגה מקדימה** → renders sections with badges `כרטיס: X` / red `אין כרטיס תואם` + `צור קיבוץ` (calls `openKibbutzSheet({name})`) / `דלג`; **שמור N בולטים** → DELETE `kibbutz_meeting_notes?meeting_date=eq.X&meeting_kind=eq.Y` then bulk POST rows `{kibbutz, meeting_date, meeting_kind, seq, text, owners, created_by}`.

**Steps:**
- [ ] 1. SQL:
```sql
create table if not exists kibbutz_meeting_notes (
  id uuid primary key default gen_random_uuid(),
  kibbutz text not null, meeting_date date not null, meeting_kind text not null default 'company',
  seq int not null, text text not null, owners text[] not null default '{}',
  ems_task_id text, done_at timestamptz, created_by text, created_at timestamptz default now(),
  unique (kibbutz, meeting_date, meeting_kind, seq)
);
alter table kibbutz_meeting_notes enable row level security;
create policy kmn_read on kibbutz_meeting_notes for select using (true);
create policy kmn_write on kibbutz_meeting_notes for all to authenticated using (true) with check (true);
```
- [ ] 2. Tests first (`test-meeting-notes.mjs`), then implement until green:
  - golden: parse fixture 17.9 → `meeting_date==='2026-09-17'`, 30 sections, section `6. גבים` has 6 bullets, bullet 1 text `מאזן אנרגיה: אובדן קבוע בראשי, יותר יציאה מכניסה — "לא הגיוני".`, owners of paragraph = `['אביאם','עידן']`; section 27 resolves 4 kibbutzim (`כפר עזה`, `יסעור`, `כפר מנחם`, `משואות יצחק`); `חוקוק` last bullet `quiet:true`; `דגניה א` → `דגניה` via alias; `גשר השלום` → `unmatched:['גשר השלום']`. Save full expected as `expected_17.9.26.json` and `deepStrictEqual`.
  - 6.9 fixture: heading with ` — ✅ 5 משימות` suffix → name `דפנה`.
  - edge: `2.9` inside a sentence does not split; `in_progress` does not split; empty body → `[]`; owners `אביאם (מאזן), עידן (כופלים)` → `['אביאם','עידן']`; `ניתאי ואביאם` → `['ניתאי','אביאם']`.
  - `titleFromBullet('מאזן אנרגיה: אובדן קבוע בראשי, …')` → `'מאזן אנרגיה'`; 90-char no-delimiter → 69 chars + `…`.
  - `renderCardNotes` with stub DOM: latest date block has N `.note-bullet`, history `<details>` has 2 dates in `summary`; linked bullet has `.linked`; done bullet has class `done` and no ＋.
  - role: `openMeetingImport` throws for non-admin; viewer regression.
- [ ] 3. Wire `renderCardNotes` into the card pipeline right after `renderKibbutzCards` (before EMS widgets so order = name → notes → EMS tasks). Modal tab `🗓 ישיבות` = full timeline + (admins) `📥 ייבוא סיכום ישיבה` + `✏️ פרטי קיבוץ`.
- [ ] 4. Full suite, build, apply migration `kibbutz_meeting_notes`, import the real 17.9 summary via the modal on `?login=0`, verify גבים card. Commit.

---

### Task 3: EMS tasks in full on the card

**Agent:** Sonnet. **Branch:** `feat/kcr-ems-full`. Depends on Task 1.

**Files:** Modify `js/src/13-ems.js` (slim mapper ~line 48; `renderCardEmsTasks` ~line 219), `css/app.css` (temporary; Task 4 restyles), create `test-ems-card.mjs`.

**Interfaces:**
- Slim cache row gains `description: t.description || ''` and `dueText` computed at render. Bump cache key/version constant (find `emsCache` version marker; if none, add `EMS_CACHE_VER = 2` and ignore cached snapshots lacking `description` by re-syncing once when connected).
- Pure `buildEmsTaskHtml(t)` → string: `.card-ems-task.status-{s}[.overdue]` containing `.t-row`(priority dot + title + status badge) · `.t-desc` full description (escaped, `white-space:pre-line`) · `.t-meta` chips: `👤 {firstName}`, `📅 {d.m}`, `{EMS_PRIORITY[p]}`.
- `renderCardEmsTasks(card,name)` uses it; header `📋 משימות EMS <span class="badge">{n} פתוחות</span>`.

**Steps:**
- [ ] 1. Tests: golden for a task with description containing `<b>` (escaped), overdue → `⏰` and class; no description → no `.t-desc`; assignee null → no 👤 chip; slim mapper includes `description` (eval mapper on a fake API row).
- [ ] 2. Implement; full suite; build; smoke a card. Commit.

---

### Task 4: Brand tokens, dark mode, layout, bottom nav, motion

**Agent:** Sonnet (use `frontend-design` skill). **Branch:** `feat/kcr-ui`. Depends on 1, 2, 3.

**Files:** Modify `css/app.css`, `index.html` (nav + header), create `js/src/26-theme.js`, `test-theme.mjs`.

**Interfaces:**
- `26-theme.js`: `themeGet()` → `'light'|'dark'|'system'`; `themeSet(v)` writes `localStorage['theme']`, sets `document.documentElement.dataset.theme` (`system` → removes attr), updates `<meta name="theme-color">` (`#EEF3F5` light / `#0F1417` dark); `themeToggle()` cycles light↔dark. Pure `themeResolve(stored, prefersDark)` → `'light'|'dark'`. Inline boot snippet in `<head>` applies stored theme before first paint (no flash).
- Bottom nav (phone only, `@media (max-width: 767px)`): `🏘 קיבוצים` → `showPage('kibbutz')`, `🚚 תעודה` → `openDeliveryCert({})`, center raised `📍 ביקור` → `openVisitQuick()` (**always the visit form directly**, per spec §5), `📦 מלאי`, `⋯ עוד` (sheet with: 📅 נוכחות, 📋 EMS, 🗓 יומן, 👥, 💻, 📣 רעיון/תלונה, 🌙/☀️, 📥 ייבוא, ➕ קיבוץ). Existing top `nav` becomes desktop-only.

**Steps:**
- [ ] 1. Tests: `themeResolve('dark',false)==='dark'`, `('system',true)==='dark'`, `('light',true)==='light'`; a CSS contract test that reads `css/app.css` and asserts **no hex literal outside `:root`/theme blocks in the new sections** (mark new sections with `/* @tokens-only */ … /* @end */` comments and grep only inside).
- [ ] 2. Tokens per spec §6 (brand pair, grad, surfaces, `--radius-lg:14px`), dark block twice (media + `[data-theme]`). Replace the top ~200 lines of `app.css` palette references; convert existing hard-coded `#1b2a4a` etc. where they appear on surfaces that must flip (cards, modals, inputs, tables). Do NOT restyle delivery-cert print HTML (`certDocHtml`) — it is a printed document.
- [ ] 3. Layout: `body{padding:12px 16px}` (24 desktop), `.kibbutz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;align-items:start;grid-auto-flow:dense}`, container `max-width:none`. Sticky section headers. Card, bullet, task, badge, tag styles from the mockup (`sigmatec-ops-mockup.html` classes `.card .ch .badge .meet .bl .act .ems .task .nav .sheet` → port names to existing `.kibbutz…` classes).
- [ ] 3b. **Design libraries (עידן 17.9: "יותר מקצועי ונקי, פחות AI, טיפה יותר הנפשות"):** replace UI emoji with **Lucide** SVG icons (`https://cdnjs.cloudflare.com/ajax/libs/lucide/<pinned>/umd/lucide.min.js`, `lucide.createIcons()` after each render; `data-lucide="map-pin|truck|package|home|more-horizontal|moon|sun|plus|link|check|mic|megaphone|calendar-days|clipboard-list|user"`). Keep emoji ONLY inside user-authored text (bullets, task text). Animations with **GSAP** core (`https://cdnjs.cloudflare.com/ajax/libs/gsap/<pinned>/gsap.min.js`): sheet slide-up with `back.out(1.4)`, cards stagger-in on first paint (`stagger:0.03`, 220 ms), bullet→🔗 link pulse, section collapse height tween; all wrapped in `if (window.gsap && !prefersReducedMotion)`, CSS fallbacks stay. **Premium micro-motion (עידן 17.9: "כרטיס אחד FADE IN ו-FADE OUT, דברים קטנים שמרגישים פרימיום"):** filter/search changes crossfade cards — leaving cards `opacity 1→0, y 0→6px, 160 ms` then `display:none`; entering cards `opacity 0→1, y 8→0, 220 ms, stagger 25 ms`; section collapse/expand tweens height + fade; a newly created/edited card fades in and briefly highlights its hairline with the brand gradient (600 ms); bullet → 🔗 morph (scale 0.8→1 + fade); button press `scale .97` (80 ms) on all `.btn`; chips slide the active pill; toasts slide up from the bottom nav; skeleton shimmer on cards while `kibbutzimLoad()` is pending; modal/sheet backdrop fades with the sheet slide. Everything ≤ 250 ms except the sheet (320 ms). Pure `motionPlan(prevVisible, nextVisible)` → `{leave:[names], enter:[names]}` is unit-tested; the tween code itself is the thin layer. Typography: switch body face to **IBM Plex Sans Hebrew** (Google Fonts; fallback Heebo, system-ui) for a cleaner, less generic feel; weights 400/500/600/700. Radii 12/14, 1px hairline borders, shadows only on floating layers (sheets, FAB) — flat cards with a hairline, no gradient backgrounds on surfaces (gradient only on the Σ mark, primary buttons, active nav indicator).
- [ ] 4. Motion (fallback when GSAP is unavailable): `motion` UMD `<script src="https://cdnjs.cloudflare.com/ajax/libs/motion/<pinned>/motion.min.js">` **only if** present on cdnjs; otherwise pure CSS `@keyframes` for sheet slide-up and bullet-link pulse. `prefers-reduced-motion` guard. `document.startViewTransition` when available around `showPage`.
- [ ] 5. Header: Σ mark (CSS gradient square with `Σ`), `סיגמה` / `תפעול שטח`, 🌙 button, user chip `● {name}` (dot green when `isEmsConnected()`), remove `📱 תצוגה מצומצמת` remnants. `manifest`/`theme-color` meta updated.
- [ ] 6. **Viewer role (spec §6):** `body.user-viewer` gets the same tokens/nav; bottom nav for viewer = `🏘 קיבוצים` · `📊 דוחות` (scrolls to `#viewerReportsHub`) · `⋯ עוד` (🌙, 📣). Restyle `#viewerReportsHub` rows as cards with 44 px controls. Cards for viewer: no ➕ on bullets, no ➕ קיבוץ, no import. Run `test-viewer-gate.mjs` unchanged; add to `test-theme.mjs` a viewer matrix: for role `viewer`, `canManageKibbutzim()===false`, `openMeetingImport` throws, `noteOpenTask` throws, `openFeedback` allowed.
- [ ] 7. Full suite, build, smoke both themes at 390 px and 1440 px (`resize_window`) for עידן, אביאם and viewer (`?login=0` + set role in localStorage). Commit.

---

### Task 5: Field arrival flow, briefing, check-ins, `visitCron` push

**Agent:** Opus. **Branch:** `feat/kcr-field`. Depends on 2, 3, 4.

**Files:** Create `db/field_checkins.sql`, `db/cron_visit_15min.sql`, `js/src/27-field.js`, `test-field.mjs`; modify `supabase/functions/push-send/index.ts`, `sw.js` (no change expected — `actUrls` handles it), `js/src/22-push.js` (deep-link `act==='visit'`), `js/src/09-visits.js` (`openVisitQuick(prefKibbutz)` accepts a kibbutz to preselect; read `?kibbutz=` from deep link).

**Interfaces:**
- SQL:
```sql
create table if not exists field_checkins (
  id uuid primary key default gen_random_uuid(),
  person text not null, kibbutz text not null,
  checked_in_at timestamptz not null default now(),
  reminded_at timestamptz, dismissed boolean not null default false,
  created_at timestamptz default now()
);
create index on field_checkins (person, checked_in_at desc);
-- RLS as other tables
```
- `27-field.js`: `fieldShouldPrompt()` → bool (`ATT_PEOPLE` includes me, no check-in today in `localStorage['checkin_today']` = `{date,kibbutz}`, not dismissed today); `openArrivalSheet()`; pure `arrivalOrder(kibbutzim, myTasks, visits, me)` → ordered `[{name, why, count}]` (groups: has my open tasks by count desc → recently visited by date desc → rest by name); `checkinCreate(kibbutz)` → POST row + set localStorage → `openBriefing(kibbutz)`; `openBriefing(name)` renders: gradient header (name, energy, `🕘 צ'ק-אין HH:MM`), `📋 המשימות שלך כאן` (mine first, then others, using `buildEmsTaskHtml`), `🗓 ישיבת חברה d.m` (latest via `notesForKibbutz`), `📍 ביקור קודם` (`getLastVisit(name)` + 🚚 only when it has products via `certFromVisit`), sticky `📍 סיכום ביקור` → `openVisitQuick(name)` and `🚚 תעודת משלוח` → `certFromVisitForm()` **after** the visit form is open (so the pre-minted draft id links). Sheet footer link `ישר לסיכום ביקור →` → `openVisitQuick()`.
- `push-send` mode `visitCron`:
```ts
if (body.mode === "visitCron") {
  const cutoff = new Date(Date.now() - 2*3600*1000).toISOString();
  const { data: rows } = await sb.from("field_checkins").select("*").is("reminded_at", null).eq("dismissed", false).lte("checked_in_at", cutoff).gte("checked_in_at", new Date(Date.now()-14*3600*1000).toISOString());
  const results:any[] = [];
  for (const c of rows ?? []) {
    const day = israelDateOf(c.checked_in_at);           // 'YYYY-MM-DD' in Asia/Jerusalem
    const { data: v } = await sb.from("visits").select("id").eq("visitor", c.person).eq("kibbutz", c.kibbutz).eq("date", day).limit(1);
    if (v && v.length) { await sb.from("field_checkins").update({ reminded_at: new Date().toISOString() }).eq("id", c.id); results.push({id:c.id, skipped:"visit exists"}); continue; }
    const title = `📍 ${c.kibbutz} — עוד לא סיכמת את הביקור`;
    const bodyTxt = `2 דקות עכשיו חוסכות טלפונים בסוף החודש. מה נעשה, מה נשאר? — וסיימת את ${c.kibbutz} נקי 💪`;
    const url = APP + "?pushact=visit&kibbutz=" + encodeURIComponent(c.kibbutz);
    const dismissUrl = APP + "?pushact=visitDismiss&cid=" + c.id;
    const payload = JSON.stringify({ title, body: bodyTxt, tag: "visit-" + c.id, requireInteraction: true, url,
      actions: [{ action: "visit", title: "✍️ כתוב סיכום" }, { action: "visitDismiss", title: "🙈 לא היום" }],
      data: { actUrls: { visit: url, visitDismiss: dismissUrl } } });
    const r = await sendTo([c.person], payload, { event: "visitCron", order_id: null, where_txt: c.kibbutz, qty: 1, actor: null, title, body: bodyTxt });
    await sb.from("field_checkins").update({ reminded_at: new Date().toISOString() }).eq("id", c.id);
    results.push({ id: c.id, delivered: r.delivered });
  }
  return json({ ok: true, results });
}
```
  Pure helpers exported for tests (mirror in JS for `test-field.mjs`): `visitCronSelect(checkins, visits, nowIso)` → `{remind:[ids], skip:[ids]}` (2 h rule, ≤14 h window, dismissed/reminded excluded, visit-exists excluded).
- `22-push.js` deep link: `act==='visit'` → `showPage('kibbutz'); openVisitQuick(qs.get('kibbutz'))`; `act==='visitDismiss'` → PATCH `field_checkins?id=eq.<cid>` `{dismissed:true}` + toast `בסדר, לא היום.`
- `db/cron_visit_15min.sql`: `select cron.schedule('push-visit-15min','*/15 * * * *', $$ select net.http_post(url:='https://wwqfcajnxinaxmobrgol.supabase.co/functions/v1/push-send', headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON>","apikey":"<ANON>"}'::jsonb, body:='{"mode":"visitCron"}'::jsonb) $$);` (anon key copied from `22-push.js`, same as the existing attendance job).

**Steps:**
- [ ] 1. Tests: `arrivalOrder` golden (3 groups, tie-breaks); `fieldShouldPrompt` matrix (אביאם no check-in → true; עידן → false; after check-in → false; dismissed → false); `visitCronSelect` cases (1h59 → skip, 2h01 → remind, visit exists → skip, dismissed → skip, 15h old → skip); deep-link parser `pushactParse('?pushact=visit&kibbutz=%D7%92%D7%91%D7%99%D7%9D')` → `{act:'visit',kibbutz:'גבים'}`; **regression: `test-visit-cert-gate.mjs` unchanged and green.**
- [ ] 2. Implement client; `openVisitQuick(pref)` preselects `#visitQuickKibbutz`.
- [ ] 3. Implement `visitCron`; `deno check` locally if available; deploy `push-send` via MCP `deploy_edge_function` **only after** confirming `origin/main`'s `push-send` has no newer changes (diff against the worktree file); apply `field_checkins` migration and the cron SQL.
- [ ] 4. Full suite, build, smoke on `?login=0` as אביאם: sheet → גבים → briefing → 📍 opens visit form with גבים preselected. Commit.

---

### Task 6: Feedback box (text + voice) + `transcribe` function

**Agent:** Opus. **Branch:** `feat/kcr-feedback`. Depends on 4.

**Files:** Create `db/feedback.sql`, `supabase/functions/transcribe/index.ts`, `js/src/28-feedback.js`, `test-feedback.mjs`; modify `index.html` (sheet + admin inbox in ⋯ עוד), `supabase/functions/push-send/index.ts` (mode `feedbackNew` → push to `['עידן','עמיחי']`).

**Interfaces:**
- SQL: `feedback(id uuid pk, author text, kind text check (kind in ('idea','complaint')), text text not null, audio_path text, status text default 'new' check (status in ('new','seen','done')), created_at timestamptz default now())` + RLS; Storage bucket `feedback-audio` (private; upload via authenticated; admins read via signed URL).
- `28-feedback.js`: `openFeedback()`; `speechSupported()` = `'webkitSpeechRecognition' in window || 'SpeechRecognition' in window`; `feedbackStartLive()` (recognition `lang='he-IL'`, `continuous=true`, `interimResults=true`, appends finals to `#fbText`, interim shown in `#fbInterim`); fallback `feedbackRecord()` via `MediaRecorder` (`audio/webm` or `audio/mp4`), cap 180 s, upload to `feedback-audio/<uuid>.<ext>`, POST `functions/v1/transcribe` `{path}` → `{text}` → fill textarea; `feedbackSend()` → POST row (`author` null when anonymous) → `push-send` `{mode:'feedbackNew', kind, preview}`; admin `openFeedbackInbox()` list + status buttons. Pure `feedbackValidate({kind,text})` → errors (`text.trim().length<3` → `'כתוב או הקלט משהו'`), `feedbackPreview(text)` → ≤80 chars.
- `transcribe/index.ts`: verify caller JWT (anon ok — payload is just a storage path in our bucket), download from Storage with service role, POST multipart to `https://api.groq.com/openai/v1/audio/transcriptions` (`model=whisper-large-v3`, `language=he`, `response_format=json`) with `GROQ_API_KEY` secret (already set for `parse-order`; if the secret name differs, reuse that one), return `{text}`; on error `{error}` 502. Max 25 MB.

**Steps:**
- [ ] 1. Tests: `feedbackValidate`, `feedbackPreview` (Hebrew, no mid-word cut beyond 80), role matrix (`openFeedbackInbox` admins only; `openFeedback` all roles incl. viewer? → **viewer allowed** to submit; regression other write-blocks unchanged), payload builder `feedbackRow({kind:'idea',text,anon:true,user:'ניתאי'})` → `author:null`.
- [ ] 2. Implement client + function; deploy `transcribe`; create bucket + policies (SQL in `feedback.sql`).
- [ ] 3. Smoke: desktop Chrome live speech; iOS-path simulated by forcing fallback (`?speech=0`) → record 5 s → text returned. Commit.

---

### Task 7: Release — docs, version, dev → main

**Agent:** Sonnet. Depends on all.

- [ ] 1. Merge all `feat/kcr-*` into `feat/kibbutz-cards-redesign`; full suite green; `node build.mjs major` → `2.00`.
- [ ] 2. `docs/CHANGELOG.md` `## [2.00] 2026-09-xx — סיגמה: cards redesign + field flow` (what + why, per part, with the manual smoke line). `docs/backlog.md`: remove 🟡 line, add ✅. `docs/INDEX.md` 🚦 Current state. `docs/modules.md` rows for `24`–`28`. `docs/data-and-security.md` new tables + bucket + cron. Spec STATUS → `✅ SHIPPED 2.00`.
- [ ] 3. Follow CLAUDE.md "Parallel-safe merge to main" loop: fetch, rebase on `origin/dev`, rebuild, ff `feat`→`dev`; preview on raw.githack; then ff `dev`→`main` only after עידן's go.

---

## Self-review

- **Spec coverage:** §2 → T1; §7b region grouping + alpha + energy gate → T1/T1b; §6 viewer redesign → T4 step 6; §3 → T2; §4 → T3; §5 (arrival, fast visit path, cert rules, cron, copy) → T5 (+T4 nav button); §6 (brand, dark, layout, name, header chip, motion) → T4; §7 feedback → T6; §7b kibbutzim → T1/T1b; §8 release → T7. D1 packages: `motion` optional with CSS fallback (T4). D3 in-app paste (T2). D4 per-sentence (T2). D7 anonymous + admin inbox (T6).
- **Placeholders:** none; every step names files, functions, copy, and tests.
- **Type consistency:** `buildCardHtml`, `renderKibbutzCards`, `kibbutzByName`, `openKibbutzSheet`, `notesForKibbutz`, `renderCardNotes`, `buildEmsTaskHtml`, `openVisitQuick(pref)`, `openBriefing(name)`, `emsSiteIdForKibbutz` used consistently across tasks.
