# Meter Burn Tracker (🔥 צריבות) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "🔥 צריבות" tab where אביאם/ניתאי mark Landis E360 generation meters as burned (per kibbutz, with remaining counts), see each meter's linked solar systems, and group meters under generators.

**Architecture:** One new classic-script module `js/src/24-meter-burns.js` (same shape as `23-push-log.js`) talking to two new Supabase tables (`meter_burns`, `generators`) via REST — anon read, bridge-token write (same as `dev_status_log` in `18-dev-tasks.js`). Pure logic (grouping/filtering/counting) sits between `// PURE-START` / `// PURE-END` markers so `test-meter-burns.mjs` can execute the *real* code with `node:vm` instead of a mirror copy. Seed data is generated from `db/meter_burns_seed.csv` (268 rows exported from the EMS prod DB on 2026-09-07) into SQL by a small node script.

**Tech Stack:** Vanilla JS (no framework, one shared global scope, `node build.mjs` concatenates `js/src/*.js` → `js/app.js`), Supabase REST + RLS, SheetJS via existing `21-excel-export.js`, Node 18+ for tests/scripts.

**Spec:** `superpowers/specs/2026-09-06-meter-burn-tracker-design.md`

## Global Constraints

- Work on a **git worktree** branch `feat/meter-burns` off `dev` (the main checkout has uncommitted WIP on `feat/kibbutz-site-integrity` — never touch it). Use `superpowers:using-git-worktrees`.
- **Never edit `js/app.js` or `index.html`'s `?v=` stamps by hand** — run `node build.mjs` after editing `js/src/*`; stage only your `js/src/24-meter-burns.js`, `css/app.css`, `index.html`, `js/app.js`, `VERSION`, `sw.js`, `db/*`, `test-meter-burns.mjs`, docs. **Never `git add -A`.**
- The app **never writes to the EMS** (עידן, 6.9.26). Only Supabase writes.
- Statuses are exactly: `pending` | `burned` | `issue`. No fourth status — a burned **CT** meter is only *styled* differently (purple "מוכן לעיסוק").
- Who may write: `אביאם`, `ניתאי`, `עידן`, `עמיחי` (`getCurrentUser()`); viewer role (`isViewer()`) is read-only. Tab visible to everyone who can see the app except `מתניה`.
- All Hebrew UI. RTL. Touch targets ≥ 40px on mobile (existing `.inv-btn` media rule does this).
- Commit messages: `feat(burns): …`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ponytail: no history table, no offline queue, no EMS calls, no JSON export.

---

## File map

| File | Responsibility |
|------|----------------|
| `db/meter_burns_seed.csv` | **exists** — 268 rows: `meter_id,serial,site,site_id,meter_type,address,role_code,ct_ratio,parent_serial,solar_names` |
| `db/gen_meter_burns_seed.mjs` | new — CSV → `db/meter_burns_seed.sql` (INSERT … ON CONFLICT DO UPDATE of EMS-sourced columns only) |
| `db/meter_burns.sql` | new — DDL + RLS for `meter_burns` and `generators` |
| `db/meter_burns_seed.sql` | generated — committed so עידן can paste it in the Supabase SQL editor |
| `js/src/24-meter-burns.js` | new — pure helpers (PURE block) + REST + render + actions |
| `test-meter-burns.mjs` | new — runs the PURE block via `node:vm`, asserts grouping/filter/counts/row class/patch payloads |
| `index.html` | add nav button `navBurns` + `<div id="burns-view">` |
| `js/src/02-init-attendance.js` | `showPage`: gate + show/hide + render for `burns` |
| `js/src/11-search-login.js` | nav visibility for `navBurns` |
| `css/app.css` | `.burn-*` styles |
| `docs/data-and-security.md`, `docs/modules.md`, `docs/CHANGELOG.md`, `docs/backlog.md`, `docs/INDEX.md` | checkpoint docs |

---

### Task 0: Worktree

**Files:** none (git only)

- [ ] **Step 1: Create the worktree off `dev`**

```bash
cd "C:/Users/idann/Projects/Sigmatec Operations App"
git fetch origin
git worktree add -b feat/meter-burns "C:/Users/idann/Projects/SigmatecOps-wt-burns" dev
cd "C:/Users/idann/Projects/SigmatecOps-wt-burns"
git log --oneline -1
```
Expected: one line ending in `feat: firm 'enable notifications required' prompt for devices without push` (dev head 425437f) or newer.

- [ ] **Step 2: Copy the seed CSV into the worktree** (it was exported into the main checkout, untracked)

```bash
cp "C:/Users/idann/Projects/Sigmatec Operations App/db/meter_burns_seed.csv" db/
cp "C:/Users/idann/Projects/Sigmatec Operations App/superpowers/specs/2026-09-06-meter-burn-tracker-design.md" superpowers/specs/ 2>/dev/null || (mkdir -p superpowers/specs superpowers/plans && cp "C:/Users/idann/Projects/Sigmatec Operations App/superpowers/specs/2026-09-06-meter-burn-tracker-design.md" superpowers/specs/)
cp "C:/Users/idann/Projects/Sigmatec Operations App/superpowers/plans/2026-09-07-meter-burn-tracker.md" superpowers/plans/
wc -l db/meter_burns_seed.csv
```
Expected: `269 db/meter_burns_seed.csv` (header + 268).

- [ ] **Step 3: Commit the inputs**

```bash
git add db/meter_burns_seed.csv superpowers/specs/2026-09-06-meter-burn-tracker-design.md superpowers/plans/2026-09-07-meter-burn-tracker.md
git commit -m "chore(burns): seed CSV (268 Landis E360 generation meters) + spec + plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

All following tasks run inside `C:/Users/idann/Projects/SigmatecOps-wt-burns`.

---

### Task 1: DDL + seed generator

**Files:**
- Create: `db/meter_burns.sql`
- Create: `db/gen_meter_burns_seed.mjs`
- Create (generated): `db/meter_burns_seed.sql`

**Interfaces:**
- Produces tables `public.meter_burns` (PK `meter_id uuid`) and `public.generators` (PK `id uuid`, `unique(site,name)`) — column names below are used verbatim by Task 3's REST calls.

- [ ] **Step 1: Write the DDL**

`db/meter_burns.sql`:
```sql
-- 🔥 צריבות — tracking which Landis E360 generation meters were burned in the field, per kibbutz,
-- plus the generators meters are grouped under. Spec: superpowers/specs/2026-09-06-meter-burn-tracker-design.md
-- EMS-sourced columns (serial/site/meter_type/address/role_code/ct_ratio/parent_serial/solar_names) are seeded
-- from db/meter_burns_seed.sql and refreshed by re-running it; tracking columns (status/burned_*/generator_id/note)
-- are owned by the app and never touched by the seed. Run once in the Supabase SQL editor, then run the seed.

create table if not exists public.generators (
  id            uuid primary key default gen_random_uuid(),
  site          text not null,
  name          text not null,
  device_serial text,                       -- generator's own meter/controller number (עידן fills in the helper table)
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (site, name)
);

create table if not exists public.meter_burns (
  meter_id      uuid primary key,           -- EMS meters.id
  serial        text not null,
  site          text not null,              -- EMS site name (= kibbutz card name where linked)
  site_id       uuid,
  meter_type    text not null,              -- 'E360PP' | 'E360SP' | 'E360CT'
  address       text,
  role_code     int,
  ct_ratio      numeric,                    -- EMS current_multiplier
  parent_serial text,
  solar_names   text,                       -- linked solar systems, ' · ' separated
  status        text not null default 'pending' check (status in ('pending','burned','issue')),
  burned_by     text,
  burned_at     timestamptz,
  generator_id  uuid references public.generators(id) on delete set null,
  note          text,
  updated_at    timestamptz not null default now()
);
create index if not exists meter_burns_site_idx on public.meter_burns (site);

alter table public.generators  enable row level security;
alter table public.meter_burns enable row level security;

-- read: anon + authenticated (UI is name-gated client-side, same posture as dev_status_log / push_log)
drop policy if exists generators_read on public.generators;
create policy generators_read on public.generators for select to anon, authenticated using (true);
drop policy if exists meter_burns_read on public.meter_burns;
create policy meter_burns_read on public.meter_burns for select to anon, authenticated using (true);

-- write: only through the authenticated EMS→Supabase bridge token. No delete from the app.
drop policy if exists generators_insert on public.generators;
create policy generators_insert on public.generators for insert to authenticated with check (true);
drop policy if exists generators_update on public.generators;
create policy generators_update on public.generators for update to authenticated using (true) with check (true);
drop policy if exists meter_burns_write on public.meter_burns;
create policy meter_burns_write on public.meter_burns for insert to authenticated with check (true);
drop policy if exists meter_burns_update on public.meter_burns;
create policy meter_burns_update on public.meter_burns for update to authenticated using (true) with check (true);
```

- [ ] **Step 2: Write the seed generator**

`db/gen_meter_burns_seed.mjs`:
```js
// Turns db/meter_burns_seed.csv (exported from the EMS prod DB) into db/meter_burns_seed.sql.
// Re-runnable: the INSERT upserts ONLY the EMS-sourced columns, never status/burned_*/generator_id/note.
// Run: node db/gen_meter_burns_seed.mjs
import fs from 'node:fs';
const csvPath = new URL('./meter_burns_seed.csv', import.meta.url);
const outPath = new URL('./meter_burns_seed.sql', import.meta.url);

// minimal RFC-4180 parser (fields may be quoted and contain commas/quotes; no embedded newlines in our export)
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.length);
  const split = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map(l => { const v = split(l); const o = {}; head.forEach((h, i) => o[h] = v[i] ?? ''); return o; });
}
const q = (s) => s === '' ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const n = (s) => s === '' ? 'null' : String(Number(s));
export function rowToValues(r) {
  return `(${q(r.meter_id)}::uuid, ${q(r.serial)}, ${q(r.site)}, ${r.site_id ? q(r.site_id) + '::uuid' : 'null'}, ${q(r.meter_type)}, ${q(r.address)}, ${n(r.role_code)}, ${n(r.ct_ratio)}, ${q(r.parent_serial)}, ${q(r.solar_names)})`;
}
export function buildSql(rows) {
  return `-- GENERATED by db/gen_meter_burns_seed.mjs from db/meter_burns_seed.csv — ${rows.length} rows. Do not edit by hand.
insert into public.meter_burns (meter_id, serial, site, site_id, meter_type, address, role_code, ct_ratio, parent_serial, solar_names) values
${rows.map(rowToValues).join(',\n')}
on conflict (meter_id) do update set
  serial = excluded.serial, site = excluded.site, site_id = excluded.site_id, meter_type = excluded.meter_type,
  address = excluded.address, role_code = excluded.role_code, ct_ratio = excluded.ct_ratio,
  parent_serial = excluded.parent_serial, solar_names = excluded.solar_names;
`;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  fs.writeFileSync(outPath, buildSql(rows));
  console.log(`wrote db/meter_burns_seed.sql with ${rows.length} rows`);
}
```

- [ ] **Step 3: Run the generator**

```bash
node db/gen_meter_burns_seed.mjs
grep -c "::uuid," db/meter_burns_seed.sql
grep -c "E360CT" db/meter_burns_seed.sql
head -c 600 db/meter_burns_seed.sql
```
Expected: `wrote db/meter_burns_seed.sql with 268 rows`, then `268`, then `85` (CT rows), and the header shows the first values row with `'אגודת המים עמק הירדן'`.

- [ ] **Step 4: Sanity-check the SQL parses (no DB needed)** — quote balance:

```bash
node -e "const s=require('fs').readFileSync('db/meter_burns_seed.sql','utf8');const c=(s.match(/'/g)||[]).length;console.log(c%2===0?'quotes balanced':'UNBALANCED QUOTES')"
```
Expected: `quotes balanced`.

- [ ] **Step 5: Commit**

```bash
git add db/meter_burns.sql db/gen_meter_burns_seed.mjs db/meter_burns_seed.sql
git commit -m "feat(burns): meter_burns + generators tables (RLS) and seed generator (268 rows)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

**Hand-off note for עידן (put in the final report, not now):** run `db/meter_burns.sql` then `db/meter_burns_seed.sql` in the Supabase SQL editor; verify `select count(*) from meter_burns;` = 268 and `select count(*) from meter_burns where solar_names is not null;` = 261.

---

### Task 2: Pure logic + test harness

**Files:**
- Create: `js/src/24-meter-burns.js` (PURE block only in this task)
- Create: `test-meter-burns.mjs`

**Interfaces (Produces — used verbatim by Task 3):**
```js
// inside the PURE block, all attached to `B` (a plain object) so vm can return them:
B.isCT(row)                          // meter_type === 'E360CT'
B.rowState(row)                      // 'pending' | 'burned' | 'burned-ct' | 'issue'   (burned-ct = CT + burned → purple)
B.normalize(s)                       // lower-case, trims, collapses spaces (Hebrew-safe)
B.matches(row, query)                // site/serial/address/solar_names/generator_name contains query (normalized); '' → true
B.filterRows(rows, {q, status, kind, site})   // status: 'all'|'pending'|'burned'|'issue'; kind: 'all'|'PP'|'CT'; site: '' or exact
B.groupBySite(rows)                  // [{site, rows, total, pending, burned, issue, ct, pp}] sorted: most pending first, then he-IL name
B.groupByGenerator(rows, generators) // [{gen: {id,name,device_serial}|null, rows}] — null group last, labelled 'לא משובץ'
B.totals(rows)                       // {total, pending, burned, issue}
B.burnPatch(user, nowIso)            // {status:'burned', burned_by:user, burned_at:nowIso, updated_at:nowIso}
B.unburnPatch(nowIso)                // {status:'pending', burned_by:null, burned_at:null, updated_at:nowIso}
B.issuePatch(note, nowIso)           // {status:'issue', note, updated_at:nowIso}
B.assignPatch(generatorId, nowIso)   // {generator_id: generatorId /* or null */, updated_at:nowIso}
B.sortRows(rows)                     // pending first, then issue, then burned; within: CT before PP; then serial
```

- [ ] **Step 1: Write the failing test**

`test-meter-burns.mjs`:
```js
// Self-check for the 🔥 צריבות pure logic. Executes the REAL code between the PURE-START/PURE-END markers of
// js/src/24-meter-burns.js in a vm sandbox (no DOM, no fetch) — no mirrored copy to drift.
// Run: node test-meter-burns.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('./js/src/24-meter-burns.js', import.meta.url), 'utf8');
const m = src.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/);
assert.ok(m, 'PURE-START/PURE-END markers must exist');
const B = vm.runInNewContext('var B = {};' + m[1] + '; B', {});

const rows = [
  { meter_id: 'a', serial: '68369287', site: 'אור הנר', meter_type: 'E360CT', address: 'רפת 7 מונה ייצור', ct_ratio: 50, solar_names: 'סולארי רפת 7', status: 'pending', generator_id: null },
  { meter_id: 'b', serial: '59965612', site: 'אור הנר', meter_type: 'E360PP', address: 'סולארי דיר', ct_ratio: 1, solar_names: null, status: 'burned', burned_by: 'אביאם', generator_id: 'g1' },
  { meter_id: 'c', serial: '11111111', site: 'מעוז חיים', meter_type: 'E360CT', address: 'לול 4', ct_ratio: 40, solar_names: 'סולארי לולים', status: 'burned', generator_id: null },
  { meter_id: 'd', serial: '22222222', site: 'מעוז חיים', meter_type: 'E360SP', address: 'בית 12', ct_ratio: 1, solar_names: null, status: 'issue', note: 'אין גישה', generator_id: null },
  { meter_id: 'e', serial: '33333333', site: 'מעוז חיים', meter_type: 'E360PP', address: 'מוסך', ct_ratio: 1, solar_names: 'סולארי מוסך', status: 'pending', generator_id: null },
];
const gens = [{ id: 'g1', site: 'אור הנר', name: 'גנרטור רפת', device_serial: '999' }];

// --- state / kind ---
assert.equal(B.isCT(rows[0]), true); assert.equal(B.isCT(rows[1]), false); assert.equal(B.isCT(rows[3]), false, 'SP is not CT');
assert.equal(B.rowState(rows[0]), 'pending');
assert.equal(B.rowState(rows[1]), 'burned', 'burned PP → plain burned');
assert.equal(B.rowState(rows[2]), 'burned-ct', 'burned CT → purple "מוכן לעיסוק"');
assert.equal(B.rowState(rows[3]), 'issue');

// --- search: partial serial, address, solar name, site, generator name; Hebrew spacing/case tolerant ---
assert.equal(B.matches(rows[0], '287'), true, 'partial serial suffix');
assert.equal(B.matches(rows[0], 'רפת'), true, 'address');
assert.equal(B.matches(rows[2], 'לולים'), true, 'solar name');
assert.equal(B.matches(rows[0], 'אור  הנר'), true, 'double space normalized');
assert.equal(B.matches(rows[1], 'גנרטור רפת', gens), true, 'generator name via lookup');
assert.equal(B.matches(rows[0], 'xyz'), false);
assert.equal(B.matches(rows[0], ''), true, 'empty query matches all');

// --- filterRows ---
assert.deepEqual(B.filterRows(rows, { q: '', status: 'pending', kind: 'all', site: '' }).map(r => r.meter_id), ['a', 'e']);
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'CT', site: '' }).map(r => r.meter_id), ['a', 'c']);
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'PP', site: '' }).map(r => r.meter_id), ['b', 'd', 'e'], 'PP filter includes SP');
assert.deepEqual(B.filterRows(rows, { q: '', status: 'all', kind: 'all', site: 'מעוז חיים' }).map(r => r.meter_id), ['c', 'd', 'e']);
assert.deepEqual(B.filterRows(rows, { q: 'סולארי', status: 'all', kind: 'all', site: '' }).map(r => r.meter_id), ['a', 'b', 'c', 'e']);

// --- groupBySite: most pending first; counts ---
const g = B.groupBySite(rows);
assert.equal(g[0].pending, g[1].pending, 'both have 1 pending → tie broken by he-IL name');
assert.deepEqual(g.map(x => x.site), ['אור הנר', 'מעוז חיים']);
const mh = g.find(x => x.site === 'מעוז חיים');
assert.deepEqual({ total: mh.total, pending: mh.pending, burned: mh.burned, issue: mh.issue, ct: mh.ct, pp: mh.pp }, { total: 3, pending: 1, burned: 1, issue: 1, ct: 1, pp: 2 });
// a site with more pending rises to the top
const g2 = B.groupBySite(rows.concat([{ meter_id: 'f', serial: '4', site: 'מעוז חיים', meter_type: 'E360PP', status: 'pending' }]));
assert.equal(g2[0].site, 'מעוז חיים');

// --- sortRows: pending → issue → burned; CT before PP; then serial ---
assert.deepEqual(B.sortRows(rows.filter(r => r.site === 'מעוז חיים')).map(r => r.meter_id), ['e', 'd', 'c']);
assert.deepEqual(B.sortRows([rows[1], rows[0]]).map(r => r.meter_id), ['a', 'b'], 'pending CT before burned PP');

// --- groupByGenerator: unassigned last ---
const gg = B.groupByGenerator(rows.filter(r => r.site === 'אור הנר'), gens);
assert.deepEqual(gg.map(x => x.gen && x.gen.name), ['גנרטור רפת', null]);
assert.deepEqual(gg[1].rows.map(r => r.meter_id), ['a']);

// --- totals ---
assert.deepEqual(B.totals(rows), { total: 5, pending: 2, burned: 2, issue: 1 });

// --- patches (exact payloads sent to PostgREST) ---
const t = '2026-09-07T10:00:00.000Z';
assert.deepEqual(B.burnPatch('ניתאי', t), { status: 'burned', burned_by: 'ניתאי', burned_at: t, updated_at: t });
assert.deepEqual(B.unburnPatch(t), { status: 'pending', burned_by: null, burned_at: null, updated_at: t });
assert.deepEqual(B.issuePatch('אין גישה', t), { status: 'issue', note: 'אין גישה', updated_at: t });
assert.deepEqual(B.assignPatch('g1', t), { generator_id: 'g1', updated_at: t });
assert.deepEqual(B.assignPatch(null, t), { generator_id: null, updated_at: t });

console.log('✅ test-meter-burns: state/search/filter/group/sort/patch logic verified');
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node test-meter-burns.mjs
```
Expected: FAIL — `ENOENT … js/src/24-meter-burns.js`.

- [ ] **Step 3: Write the module with the PURE block**

`js/src/24-meter-burns.js`:
```js
  // ===========================================================
  // 🔥 צריבות (METER BURNS) — field tracker: which Landis E360 generation meters were burned, per kibbutz,
  // linked solar systems per meter, grouping under generators. Data: Supabase `meter_burns` + `generators`
  // (anon read; writes with the bridge token, like dev_status_log). The app NEVER writes to the EMS here.
  // Spec: superpowers/specs/2026-09-06-meter-burn-tracker-design.md · Tests: test-meter-burns.mjs (runs the PURE block).
  // ===========================================================
  var B = {};
  // PURE-START — no DOM / fetch / globals in here; test-meter-burns.mjs executes this block verbatim.
  B.isCT = function (r) { return r.meter_type === 'E360CT'; };
  B.rowState = function (r) {
    if (r.status === 'issue') return 'issue';
    if (r.status === 'burned') return B.isCT(r) ? 'burned-ct' : 'burned';
    return 'pending';
  };
  B.normalize = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); };
  B.matches = function (r, q, gens) {
    var nq = B.normalize(q); if (!nq) return true;
    var gen = (gens || []).filter(function (g) { return g.id === r.generator_id; })[0];
    var hay = B.normalize([r.site, r.serial, r.address, r.solar_names, gen && gen.name].join(' '));
    return hay.indexOf(nq) !== -1;
  };
  B.filterRows = function (rows, f, gens) {
    f = f || {};
    return rows.filter(function (r) {
      if (f.site && r.site !== f.site) return false;
      if (f.status && f.status !== 'all' && r.status !== f.status) return false;
      if (f.kind === 'CT' && !B.isCT(r)) return false;
      if (f.kind === 'PP' && B.isCT(r)) return false;
      return B.matches(r, f.q, gens);
    });
  };
  var STATE_ORDER = { pending: 0, issue: 1, burned: 2 };
  B.sortRows = function (rows) {
    return rows.slice().sort(function (a, b) {
      var d = (STATE_ORDER[a.status] || 0) - (STATE_ORDER[b.status] || 0); if (d) return d;
      d = (B.isCT(a) ? 0 : 1) - (B.isCT(b) ? 0 : 1); if (d) return d;
      return String(a.serial).localeCompare(String(b.serial));
    });
  };
  B.totals = function (rows) {
    var t = { total: rows.length, pending: 0, burned: 0, issue: 0 };
    rows.forEach(function (r) { if (t[r.status] != null) t[r.status]++; });
    return t;
  };
  B.groupBySite = function (rows) {
    var by = {};
    rows.forEach(function (r) {
      var g = by[r.site] || (by[r.site] = { site: r.site, rows: [], total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 });
      g.rows.push(r); g.total++; if (g[r.status] != null) g[r.status]++; if (B.isCT(r)) g.ct++; else g.pp++;
    });
    return Object.keys(by).map(function (k) { by[k].rows = B.sortRows(by[k].rows); return by[k]; })
      .sort(function (a, b) { return (b.pending - a.pending) || a.site.localeCompare(b.site, 'he'); });
  };
  B.groupByGenerator = function (rows, gens) {
    var byId = {}; (gens || []).forEach(function (g) { byId[g.id] = g; });
    var groups = {}, order = [];
    B.sortRows(rows).forEach(function (r) {
      var key = (r.generator_id && byId[r.generator_id]) ? r.generator_id : '';
      if (!groups[key]) { groups[key] = { gen: key ? byId[key] : null, rows: [] }; order.push(key); }
      groups[key].rows.push(r);
    });
    return order.sort(function (a, b) { return (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || (byId[a].name).localeCompare(byId[b].name, 'he'); })
      .map(function (k) { return groups[k]; });
  };
  B.burnPatch   = function (user, now) { return { status: 'burned', burned_by: user, burned_at: now, updated_at: now }; };
  B.unburnPatch = function (now)       { return { status: 'pending', burned_by: null, burned_at: null, updated_at: now }; };
  B.issuePatch  = function (note, now) { return { status: 'issue', note: note, updated_at: now }; };
  B.assignPatch = function (genId, now){ return { generator_id: genId || null, updated_at: now }; };
  // PURE-END
  window._burnLogic = B;
```

- [ ] **Step 4: Run the test**

```bash
node test-meter-burns.mjs
```
Expected: `✅ test-meter-burns: state/search/filter/group/sort/patch logic verified`.
If `groupByGenerator` sort throws on `byId[a].name` for `''` — the `||` short-circuit prevents that only when one side is `''`; if both keys are non-empty it's fine. Fix inline if the test reveals otherwise.

- [ ] **Step 5: Commit**

```bash
git add js/src/24-meter-burns.js test-meter-burns.mjs
git commit -m "feat(burns): pure grouping/filter/patch logic + vm-executed self-test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Data access + render + actions (the tab itself)

**Files:**
- Modify: `js/src/24-meter-burns.js` (append after `window._burnLogic = B;`)
- Modify: `index.html` — nav button + view container
- Modify: `js/src/02-init-attendance.js:28-60` (`showPage`)
- Modify: `js/src/11-search-login.js:175-190` (nav visibility block)
- Modify: `css/app.css` (append)

**Interfaces:**
- Consumes: `B.*` from Task 2; globals `SB_URL`, `SB_ANON` (01-data.js:457), `window._sbToken`/`window._sbTokenExp` (15-login-gate.js), `getCurrentUser()`, `isViewer()`, `emsToast(msg)` (14-calendar.js:385), `.inv-btn`, `.dev-wrap`, `.modal-backdrop/.modal`.
- Produces: `window.renderBurns()`, `window.burnCanSee()`, `window.burnCanWrite()`, plus inline-handler globals `burnToggle(id)`, `burnIssue(id)`, `burnOpen(id)`, `burnSetFilter(k,v)`, `burnToggleSite(site)`, `burnSelect(id, on)`, `burnAssignSelected()`, `burnExportXlsx()` (Task 4).

- [ ] **Step 1: Append data layer + state to the module**

```js
  // ---------- data ----------
  var burnState = { rows: null, gens: [], f: { q: '', status: 'all', kind: 'all', site: '' }, open: {}, sel: {}, loading: false, err: null };
  try { var _sf = JSON.parse(localStorage.getItem('burn_filter_v1') || 'null'); if (_sf) burnState.f = Object.assign(burnState.f, _sf); } catch (e) {}
  function burnCanSee()  { return typeof getCurrentUser === 'function' && getCurrentUser() !== 'מתניה'; }
  function burnCanWrite(){ return ['אביאם', 'ניתאי', 'עידן', 'עמיחי'].indexOf(typeof getCurrentUser === 'function' ? getCurrentUser() : '') !== -1 && !(typeof isViewer === 'function' && isViewer()); }
  function burnEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function burnHdr(write) {
    var tok = (window._sbToken && window._sbTokenExp > Date.now()) ? window._sbToken : null;
    if (write && !tok) throw new Error('אין חיבור מאומת — התחבר ל-EMS מחדש ואז נסה שוב');
    return { apikey: SB_ANON, Authorization: 'Bearer ' + (tok || SB_ANON), 'Content-Type': 'application/json' };
  }
  async function burnLoad() {
    burnState.loading = true; burnState.err = null;
    try {
      var [r1, r2] = await Promise.all([
        fetch(SB_URL + '/rest/v1/meter_burns?select=*&order=site,serial', { headers: burnHdr(false) }),
        fetch(SB_URL + '/rest/v1/generators?select=*&order=site,name', { headers: burnHdr(false) })
      ]);
      if (!r1.ok) throw new Error('meter_burns ' + r1.status);
      if (!r2.ok) throw new Error('generators ' + r2.status);
      burnState.rows = await r1.json(); burnState.gens = await r2.json();
    } catch (e) { burnState.err = e.message; }
    burnState.loading = false;
  }
  async function burnPatchRow(id, patch) {
    var r = await fetch(SB_URL + '/rest/v1/meter_burns?meter_id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: Object.assign(burnHdr(true), { Prefer: 'return=minimal' }), body: JSON.stringify(patch)
    });
    if (!r.ok) throw new Error('שמירה נכשלה (' + r.status + ')');
    var row = burnState.rows.find(function (x) { return x.meter_id === id; });
    if (row) Object.assign(row, patch);
  }
  async function burnCreateGenerator(site, name) {
    var r = await fetch(SB_URL + '/rest/v1/generators?on_conflict=site,name', {
      method: 'POST', headers: Object.assign(burnHdr(true), { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ site: site, name: name, created_by: getCurrentUser() })
    });
    if (!r.ok) throw new Error('יצירת גנרטור נכשלה (' + r.status + ')');
    var g = (await r.json())[0];
    if (!burnState.gens.some(function (x) { return x.id === g.id; })) burnState.gens.push(g);
    return g;
  }
```

- [ ] **Step 2: Append the render**

```js
  // ---------- render ----------
  var BURN_STATE_UI = {
    pending:     { icon: '⬜', label: 'ממתין',        cls: 'burn-pending' },
    burned:      { icon: '✅', label: 'נצרב',         cls: 'burn-burned' },
    'burned-ct': { icon: '🟣', label: 'מוכן לעיסוק',  cls: 'burn-burned-ct' },
    issue:       { icon: '⚠️', label: 'בעיה',         cls: 'burn-issue' }
  };
  function burnKindTag(r) {
    return B.isCT(r) ? '<span class="burn-tag burn-tag-ct">🧲 CT' + (r.ct_ratio && Number(r.ct_ratio) !== 1 ? ' ×' + Number(r.ct_ratio) : '') + '</span>'
                     : '<span class="burn-tag burn-tag-pp">🔌 ' + burnEsc(r.meter_type.replace('E360', '')) + '</span>';
  }
  function burnWarn(r) {
    var w = [];
    if (!r.parent_serial) w.push('⚠️ אין מונה אב');
    if (B.isCT(r) && (!r.ct_ratio || Number(r.ct_ratio) === 1)) w.push('🔴 יחס CT חסר ב-EMS');
    return w.length ? '<div class="burn-warn">' + w.join(' · ') + '</div>' : '';
  }
  function burnRowHtml(r, write) {
    var st = BURN_STATE_UI[B.rowState(r)];
    var sel = burnState.sel[r.meter_id] ? ' checked' : '';
    var chk = write ? '<input type="checkbox" class="burn-chk" aria-label="בחר"' + sel + ' onclick="event.stopPropagation();burnSelect(\'' + r.meter_id + '\', this.checked)">' : '';
    var btn = write ? '<button class="inv-btn small burn-btn ' + (r.status === 'burned' ? 'burn-btn-on' : '') + '" onclick="event.stopPropagation();burnToggle(\'' + r.meter_id + '\')">' + (r.status === 'burned' ? '↩ בטל' : '✅ נצרב') + '</button>' +
                      '<button class="inv-btn small burn-btn-issue" title="דווח בעיה" onclick="event.stopPropagation();burnIssue(\'' + r.meter_id + '\')">⚠</button>' : '';
    return '<div class="burn-row ' + st.cls + '" onclick="burnOpen(\'' + r.meter_id + '\')">' +
      chk + burnKindTag(r) +
      '<div class="burn-main"><div class="burn-serial"><bdi>' + burnEsc(r.serial) + '</bdi> <span class="burn-addr">' + burnEsc(r.address || '') + '</span></div>' +
      '<div class="burn-sub">' + (r.solar_names ? '☀️ ' + burnEsc(r.solar_names) : '<span class="burn-muted">ללא מערכת מקושרת</span>') +
      (r.note ? ' · 📝 ' + burnEsc(r.note) : '') + '</div>' + burnWarn(r) + '</div>' +
      '<span class="burn-state">' + st.icon + ' ' + st.label + '</span>' +
      '<div class="burn-actions">' + btn + '</div></div>';
  }
  function burnSiteHtml(g, write) {
    var open = burnState.open[g.site] || !!burnState.f.q || !!burnState.f.site;
    var pct = g.total ? Math.round(100 * (g.burned) / g.total) : 0;
    var groups = B.groupByGenerator(g.rows, burnState.gens);
    var body = groups.map(function (gg) {
      var head = gg.gen ? '⚡ ' + burnEsc(gg.gen.name) + (gg.gen.device_serial ? ' <span class="burn-muted">(' + burnEsc(gg.gen.device_serial) + ')</span>' : '')
                        : '<span class="burn-muted">לא משובץ לגנרטור</span>';
      return (groups.length > 1 || gg.gen ? '<div class="burn-gen">' + head + ' · ' + gg.rows.length + '</div>' : '') + gg.rows.map(function (r) { return burnRowHtml(r, write); }).join('');
    }).join('');
    return '<section class="burn-site' + (open ? ' open' : '') + '">' +
      '<header class="burn-site-head" onclick="burnToggleSite(\'' + burnEsc(g.site).replace(/'/g, "\\'") + '\')">' +
        '<span class="burn-caret">' + (open ? '▼' : '▶') + '</span><h3>' + burnEsc(g.site) + '</h3>' +
        '<span class="burn-left' + (g.pending ? '' : ' done') + '">נותרו ' + g.pending + '/' + g.total + '</span>' +
        '<span class="burn-mini">CT ' + g.ct + ' · PP ' + g.pp + (g.issue ? ' · ⚠️ ' + g.issue : '') + '</span>' +
        '<div class="burn-bar"><i style="width:' + pct + '%"></i></div>' +
      '</header>' + (open ? '<div class="burn-site-body">' + body + '</div>' : '') + '</section>';
  }
  function burnRender() {
    var el = document.getElementById('burnsContent'); if (!el) return;
    if (!burnCanSee()) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">אין הרשאה לעמוד זה.</div></div>'; return; }
    if (burnState.loading && !burnState.rows) { el.innerHTML = '<div class="dev-wrap"><div class="dev-loading">⏳ טוען מונים…</div></div>'; return; }
    if (burnState.err && !burnState.rows) { el.innerHTML = '<div class="dev-wrap"><div class="dev-error">⚠️ ' + burnEsc(burnState.err) + ' <button class="inv-btn small" onclick="renderBurns(true)">🔄 נסה שוב</button></div></div>'; return; }
    var write = burnCanWrite(), f = burnState.f;
    var rows = B.filterRows(burnState.rows || [], f, burnState.gens);
    var t = B.totals(burnState.rows || []), groups = B.groupBySite(rows);
    var sites = B.groupBySite(burnState.rows || []).map(function (g) { return g.site; });
    var seg = function (key, opts) { return '<div class="burn-seg">' + opts.map(function (o) { return '<button class="' + (f[key] === o[0] ? 'on' : '') + '" onclick="burnSetFilter(\'' + key + '\',\'' + o[0] + '\')">' + o[1] + '</button>'; }).join('') + '</div>'; };
    var nSel = Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k]; }).length;
    el.innerHTML = '<div class="dev-wrap burn-wrap">' +
      '<div class="push-head"><h2 class="push-title">🔥 צריבות — Landis E360 ייצור</h2>' +
        '<div><button class="inv-btn small xl-export-btn" onclick="burnExportXlsx()" style="' + (typeof canExportExcel === 'function' && canExportExcel() ? '' : 'display:none') + '">📗 Excel</button> ' +
        '<button class="inv-btn small" onclick="renderBurns(true)" title="רענן">🔄</button></div></div>' +
      '<div class="push-tiles">' +
        '<div class="push-tile" style="--c:#334155"><div class="push-tile-n">' + t.total + '</div><div class="push-tile-l">סה״כ</div></div>' +
        '<div class="push-tile" style="--c:#b45309"><div class="push-tile-n">' + t.pending + '</div><div class="push-tile-l">נותרו</div></div>' +
        '<div class="push-tile" style="--c:#059669"><div class="push-tile-n">' + t.burned + '</div><div class="push-tile-l">נצרבו</div></div>' +
        '<div class="push-tile" style="--c:#b91c1c"><div class="push-tile-n">' + t.issue + '</div><div class="push-tile-l">בעיות</div></div></div>' +
      '<div class="burn-filters">' +
        '<input id="burnSearch" class="burn-search" type="search" placeholder="🔍 קיבוץ / מס\' מונה / כתובת / מערכת" value="' + burnEsc(f.q) + '" oninput="burnSetFilter(\'q\', this.value)" onkeydown="if(event.key===\'Enter\')burnEnter()">' +
        '<select class="burn-site-sel" onchange="burnSetFilter(\'site\', this.value)"><option value="">כל הקיבוצים</option>' + sites.map(function (s) { return '<option' + (f.site === s ? ' selected' : '') + '>' + burnEsc(s) + '</option>'; }).join('') + '</select>' +
        seg('status', [['all', 'הכול'], ['pending', 'נותרו'], ['burned', 'נצרבו'], ['issue', 'בעיות']]) +
        seg('kind', [['all', 'PP+CT'], ['PP', '🔌 PP'], ['CT', '🧲 CT']]) + '</div>' +
      (write && nSel ? '<div class="burn-selbar">' + nSel + ' נבחרו · <button class="inv-btn small" onclick="burnBurnSelected()">✅ סמן כנצרבו</button> <button class="inv-btn small" onclick="burnAssignSelected()">⚡ שבץ לגנרטור</button> <button class="inv-btn small" style="background:#64748b" onclick="burnClearSel()">✖</button></div>' : '') +
      (groups.length ? groups.map(function (g) { return burnSiteHtml(g, write); }).join('') : '<div class="dev-empty">אין מונים שמתאימים לחיפוש.</div>') +
      '<div class="push-foot">מציג ' + rows.length + ' מתוך ' + t.total + ' מונים · נתוני EMS מ-7.9.26</div></div>';
    var s = document.getElementById('burnSearch'); if (s && document.activeElement !== s && f.q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
  async function renderBurns(force) {
    if (force || !burnState.rows) { burnRender(); await burnLoad(); }
    burnRender();
  }
```

- [ ] **Step 3: Append the actions**

```js
  // ---------- actions ----------
  var _burnSearchT = null;
  function burnSetFilter(k, v) {
    burnState.f[k] = v;
    try { localStorage.setItem('burn_filter_v1', JSON.stringify(burnState.f)); } catch (e) {}
    if (k === 'q') { clearTimeout(_burnSearchT); _burnSearchT = setTimeout(burnRender, 120); } else burnRender();
  }
  function burnEnter() {  // single hit → open its card
    var rows = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    if (rows.length === 1) burnOpen(rows[0].meter_id);
  }
  function burnToggleSite(site) { burnState.open[site] = !burnState.open[site]; burnRender(); }
  function burnSelect(id, on) { burnState.sel[id] = !!on; burnRender(); }
  function burnClearSel() { burnState.sel = {}; burnRender(); }
  function burnNow() { return new Date().toISOString(); }
  async function burnSafe(fn) { try { await fn(); } catch (e) { emsToast('⚠️ ' + e.message); } burnRender(); }
  function burnToggle(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    if (r.status === 'burned' && !confirm('לבטל את סימון הצריבה של מונה ' + r.serial + '?')) return;
    burnSafe(function () { return burnPatchRow(id, r.status === 'burned' ? B.unburnPatch(burnNow()) : B.burnPatch(getCurrentUser(), burnNow())); });
  }
  function burnIssue(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    var note = prompt('מה הבעיה במונה ' + r.serial + '?', r.note || ''); if (note === null) return;
    burnSafe(function () { return burnPatchRow(id, B.issuePatch(note.trim(), burnNow())); });
  }
  function burnBurnSelected() {
    var ids = Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k]; });
    if (!ids.length || !confirm('לסמן ' + ids.length + ' מונים כנצרבו?')) return;
    burnSafe(async function () { for (var i = 0; i < ids.length; i++) await burnPatchRow(ids[i], B.burnPatch(getCurrentUser(), burnNow())); burnState.sel = {}; emsToast('✅ ' + ids.length + ' מונים סומנו כנצרבו'); });
  }
  // assign: all selected rows must be in ONE site; datalist of that site's generators; new name → create
  function burnAssignSelected(singleId) {
    var ids = singleId ? [singleId] : Object.keys(burnState.sel).filter(function (k) { return burnState.sel[k]; });
    var rows = ids.map(function (id) { return burnState.rows.find(function (x) { return x.meter_id === id; }); }).filter(Boolean);
    if (!rows.length) return;
    var sites = rows.map(function (r) { return r.site; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    if (sites.length > 1) { emsToast('⚠️ שיבוץ לגנרטור הוא בתוך קיבוץ אחד בלבד'); return; }
    var site = sites[0], gens = burnState.gens.filter(function (g) { return g.site === site; });
    var m = document.getElementById('burnAssignModal'), c = document.getElementById('burnAssignContent');
    c.innerHTML = '<h3>⚡ שיבוץ לגנרטור — ' + burnEsc(site) + '</h3><p class="burn-muted">' + rows.length + ' מונים. בחר גנרטור קיים או הקלד שם חדש.</p>' +
      '<input id="burnGenName" list="burnGenList" class="burn-search" placeholder="שם הגנרטור" autocomplete="off"><datalist id="burnGenList">' + gens.map(function (g) { return '<option value="' + burnEsc(g.name) + '">'; }).join('') + '</datalist>' +
      '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-start;"><button class="inv-btn" onclick="burnAssignSave(\'' + burnEsc(site).replace(/'/g, "\\'") + '\')">שמור</button>' +
      '<button class="inv-btn" style="background:#64748b" onclick="burnAssignSave(\'' + burnEsc(site).replace(/'/g, "\\'") + '\', true)">הסר שיבוץ</button>' +
      '<button class="inv-btn" style="background:#94a3b8" onclick="document.getElementById(\'burnAssignModal\').classList.remove(\'open\')">ביטול</button></div>';
    m.dataset.ids = JSON.stringify(ids); m.classList.add('open'); setTimeout(function () { document.getElementById('burnGenName').focus(); }, 50);
  }
  function burnAssignSave(site, clear) {
    var m = document.getElementById('burnAssignModal'), ids = JSON.parse(m.dataset.ids || '[]');
    var name = (document.getElementById('burnGenName').value || '').trim();
    if (!clear && !name) { emsToast('הקלד שם גנרטור'); return; }
    burnSafe(async function () {
      var gid = null;
      if (!clear) { var g = burnState.gens.find(function (x) { return x.site === site && x.name === name; }) || await burnCreateGenerator(site, name); gid = g.id; }
      for (var i = 0; i < ids.length; i++) await burnPatchRow(ids[i], B.assignPatch(gid, burnNow()));
      burnState.sel = {}; m.classList.remove('open'); emsToast(clear ? 'השיבוץ הוסר' : '⚡ שובצו תחת ' + name);
    });
  }
  // meter card (read-only details + per-meter actions)
  function burnOpen(id) {
    var r = burnState.rows.find(function (x) { return x.meter_id === id; }); if (!r) return;
    var gen = burnState.gens.find(function (g) { return g.id === r.generator_id; });
    var st = BURN_STATE_UI[B.rowState(r)], write = burnCanWrite();
    var row = function (k, v) { return '<tr><th>' + k + '</th><td>' + (v == null || v === '' ? '—' : v) + '</td></tr>'; };
    var m = document.getElementById('burnCardModal'), c = document.getElementById('burnCardContent');
    c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><h3 style="margin:0;">' + burnKindTag(r) + ' <bdi>' + burnEsc(r.serial) + '</bdi></h3>' +
      '<span class="burn-state ' + st.cls + '">' + st.icon + ' ' + st.label + '</span></div>' + burnWarn(r) +
      '<table class="burn-card">' +
        row('קיבוץ', burnEsc(r.site)) + row('כתובת', burnEsc(r.address)) + row('סוג', burnEsc(r.meter_type)) +
        row('יחס CT', r.ct_ratio != null ? Number(r.ct_ratio) : null) + row('מונה אב', r.parent_serial ? '<bdi>' + burnEsc(r.parent_serial) + '</bdi>' : null) +
        row('מערכות מקושרות', r.solar_names ? burnEsc(r.solar_names).split(' · ').map(function (s) { return '☀️ ' + s; }).join('<br>') : null) +
        row('גנרטור', gen ? '⚡ ' + burnEsc(gen.name) + (gen.device_serial ? ' (' + burnEsc(gen.device_serial) + ')' : '') : null) +
        row('נצרב', r.burned_at ? new Date(r.burned_at).toLocaleDateString('he-IL') + ' · ' + burnEsc(r.burned_by) : null) +
        row('הערה', burnEsc(r.note)) +
      '</table>' +
      '<div style="margin-top:10px;"><a href="https://sigmatec-ems.com/admin/meters/' + burnEsc(r.meter_id) + '" target="_blank" rel="noopener" class="burn-link">פתח ב-EMS ↗</a></div>' +
      (write ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">' +
        '<button class="inv-btn" onclick="burnToggle(\'' + id + '\');document.getElementById(\'burnCardModal\').classList.remove(\'open\')">' + (r.status === 'burned' ? '↩ בטל צריבה' : '✅ נצרב') + '</button>' +
        '<button class="inv-btn" style="background:#b45309" onclick="burnIssue(\'' + id + '\');document.getElementById(\'burnCardModal\').classList.remove(\'open\')">⚠ בעיה</button>' +
        '<button class="inv-btn" style="background:#475569" onclick="document.getElementById(\'burnCardModal\').classList.remove(\'open\');burnAssignSelected(\'' + id + '\')">⚡ גנרטור</button></div>' : '');
    m.classList.add('open');
  }
  window.renderBurns = renderBurns; window.burnCanSee = burnCanSee; window.burnCanWrite = burnCanWrite;
  window.burnSetFilter = burnSetFilter; window.burnEnter = burnEnter; window.burnToggleSite = burnToggleSite;
  window.burnSelect = burnSelect; window.burnClearSel = burnClearSel; window.burnToggle = burnToggle; window.burnIssue = burnIssue;
  window.burnBurnSelected = burnBurnSelected; window.burnAssignSelected = burnAssignSelected; window.burnAssignSave = burnAssignSave; window.burnOpen = burnOpen;
```

- [ ] **Step 4: index.html — nav button + view + two modals**

Add after the `navDev` button (index.html:36):
```html
    <button id="navBurns" data-page="burns" onclick="showPage('burns')"><span class="nav-icon">🔥</span><span class="nav-label">צריבות</span></button>
```
Add right after the `dev-view` block (`<div id="dev-view" …>…</div>`, ~index.html:737-739):
```html
<div id="burns-view" style="display:none;padding:16px 0;">
  <div id="burnsContent">טוען...</div>
</div>
<div class="modal-backdrop" id="burnCardModal" style="z-index:1150;" onclick="if(event.target.id==='burnCardModal') this.classList.remove('open')">
  <div class="modal" onclick="event.stopPropagation()" style="max-width:520px;"><div id="burnCardContent"></div></div>
</div>
<div class="modal-backdrop" id="burnAssignModal" style="z-index:1160;" onclick="if(event.target.id==='burnAssignModal') this.classList.remove('open')">
  <div class="modal" onclick="event.stopPropagation()" style="max-width:420px;"><div id="burnAssignContent"></div></div>
</div>
```

- [ ] **Step 5: showPage wiring** (`js/src/02-init-attendance.js`)

After the `pushlog` gate line add:
```js
    if (page === 'burns' && !(typeof burnCanSee === 'function' && burnCanSee())) page = 'kibbutz'; // 🔥 צריבות — everyone but מתניה
```
After the `_pl` show/hide line add:
```js
    var _bv = document.getElementById('burns-view'); if (_bv) _bv.style.display = page === 'burns' ? '' : 'none';
```
After the `pushlog` render line add:
```js
    if (page === 'burns' && typeof renderBurns === 'function') renderBurns();
```
In the `_pv` map add `, burns: 'burns-view'` before the closing `}`.

- [ ] **Step 6: nav visibility** (`js/src/11-search-login.js`, after the `plog` lines ~182-183)

```js
    const nb = document.getElementById('navBurns');        // 🔥 צריבות — everyone except מתניה (viewer read-only)
    if (nb) nb.style.display = (typeof burnCanSee === 'function' && burnCanSee()) ? '' : 'none';
```

- [ ] **Step 7: CSS** (append to `css/app.css`)

```css
  /* ===== 🔥 צריבות ===== */
  .burn-wrap { max-width: 980px; }
  .burn-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
  .burn-search { flex: 1 1 260px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; font: inherit; font-size: 15px; }
  .burn-site-sel { min-height: 40px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 10px; font: inherit; background: #fff; }
  .burn-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .burn-seg button { min-height: 40px; padding: 0 12px; border: 0; background: #fff; font: inherit; font-size: 13px; cursor: pointer; }
  .burn-seg button + button { border-inline-start: 1px solid var(--border); }
  .burn-seg button.on { background: var(--primary); color: #fff; }
  .burn-selbar { position: sticky; top: 0; z-index: 5; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 8px 12px; margin: 8px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .burn-site { border: 1px solid var(--border); border-radius: 12px; background: #fff; margin: 10px 0; overflow: hidden; }
  .burn-site-head { display: grid; grid-template-columns: auto 1fr auto auto; grid-template-areas: "c t l m" "b b b b"; gap: 4px 10px; align-items: center; padding: 10px 12px; cursor: pointer; min-height: 48px; }
  .burn-site-head h3 { grid-area: t; margin: 0; font-size: 16px; }
  .burn-caret { grid-area: c; color: #94a3b8; font-size: 12px; }
  .burn-left { grid-area: l; font-weight: 700; color: #b45309; white-space: nowrap; }
  .burn-left.done { color: #059669; }
  .burn-mini { grid-area: m; font-size: 12px; color: #64748b; white-space: nowrap; }
  .burn-bar { grid-area: b; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .burn-bar i { display: block; height: 100%; background: #059669; }
  .burn-site-body { border-top: 1px solid var(--border); }
  .burn-gen { padding: 6px 12px; background: #f8fafc; font-size: 13px; font-weight: 600; color: #334155; border-bottom: 1px solid var(--border); }
  .burn-row { display: grid; grid-template-columns: auto auto 1fr auto auto; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; border-inline-start: 4px solid transparent; }
  .burn-row:last-child { border-bottom: 0; }
  .burn-row.burn-pending { border-inline-start-color: #f59e0b; }
  .burn-row.burn-burned { border-inline-start-color: #059669; background: #f0fdf4; }
  .burn-row.burn-burned-ct { border-inline-start-color: #7c3aed; background: #f5f3ff; }
  .burn-row.burn-issue { border-inline-start-color: #dc2626; background: #fef2f2; }
  .burn-chk { width: 22px; height: 22px; }
  .burn-tag { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 6px; white-space: nowrap; }
  .burn-tag-ct { background: #ede9fe; color: #5b21b6; }
  .burn-tag-pp { background: #dbeafe; color: #1e40af; }
  .burn-main { min-width: 0; }
  .burn-serial { font-weight: 700; font-size: 15px; }
  .burn-addr { font-weight: 400; color: #334155; font-size: 13px; }
  .burn-sub { font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .burn-muted { color: #94a3b8; }
  .burn-warn { font-size: 12px; color: #b91c1c; margin-top: 2px; }
  .burn-state { font-size: 12px; white-space: nowrap; }
  .burn-burned-ct .burn-state { color: #6d28d9; font-weight: 700; }
  .burn-actions { display: flex; gap: 6px; }
  .burn-btn-on { background: #64748b; }
  .burn-btn-issue { background: #b45309; }
  .burn-card { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
  .burn-card th { text-align: right; color: #64748b; font-weight: 600; padding: 6px 8px; width: 32%; vertical-align: top; }
  .burn-card td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
  .burn-link { color: #1e40af; text-decoration: none; font-weight: 600; }
  @media (max-width: 768px) {
    .burn-row { grid-template-columns: auto auto 1fr; grid-template-areas: "k t m" "s s a"; }
    .burn-row .burn-chk { grid-area: k; } .burn-row .burn-tag { grid-area: t; } .burn-row .burn-main { grid-area: m; }
    .burn-row .burn-state { grid-area: s; } .burn-row .burn-actions { grid-area: a; justify-content: flex-end; }
    .burn-site-head { grid-template-columns: auto 1fr auto; grid-template-areas: "c t l" "m m m" "b b b"; }
  }
```
Note: `.burn-row` rows in the mobile grid rely on element order: checkbox, tag, main, state, actions — which is the order `burnRowHtml` emits.

- [ ] **Step 8: Build + boot check**

```bash
node build.mjs
node test-meter-burns.mjs
node -e "new Function(require('fs').readFileSync('js/app.js','utf8')); console.log('bundle parses')"
```
Expected: `built js/app.js from 25 modules…`, test ✅, `bundle parses`.

- [ ] **Step 9: Manual smoke in the browser (preview of the worktree)**

Open the worktree's `index.html` via a static server (`npx serve .` or the `run` skill) with `?login=0`, pick user **אביאם** with PIN → nav shows 🔥 צריבות → tab loads (until עידן runs the SQL it will show `meter_burns 404`/`PGRST205` error with 🔄 — that's the expected pre-migration state). With `?sb=0` nothing renders (module bypasses the mock layer — acceptable, note it). Check at 375px width: rows wrap into 2 lines, buttons ≥40px, no horizontal scroll.

- [ ] **Step 10: Commit**

```bash
git add js/src/24-meter-burns.js js/src/02-init-attendance.js js/src/11-search-login.js index.html css/app.css js/app.js VERSION sw.js
git commit -m "feat(burns): 🔥 צריבות tab — per-kibbutz list, search, one-tap burn/issue, generator grouping, meter card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Excel export

**Files:**
- Modify: `js/src/24-meter-burns.js` (append)
- Modify: `test-meter-burns.mjs` (append)

**Interfaces:**
- Consumes: `xlDownload(spec, filename)` and `xlStr/xlNum/xlDate` from `21-excel-export.js` (they are module-scope functions — check they're globals; if `xlStr` is not on `window`, use inline `String(v||'')`). Spec shape: `{ sheet, columns:[{header,type:'s'|'n'|'d',width}], rows:[[…]], groupKeys:[…] }`.
- Produces: `B.xlsxSpec(rows, gens)` (PURE) and `window.burnExportXlsx()`.

- [ ] **Step 1: Failing test** — append to `test-meter-burns.mjs` before the final `console.log`:

```js
// --- Excel spec: one row per meter, grouped by site (groupKeys = site index) ---
const spec = B.xlsxSpec(rows, gens);
assert.equal(spec.sheet, 'צריבות');
assert.deepEqual(spec.columns.map(c => c.header), ['קיבוץ', 'גנרטור', 'סוג', 'מס\' מונה', 'כתובת', 'מערכות מקושרות', 'יחס CT', 'מונה אב', 'סטטוס', 'נצרב ע"י', 'תאריך צריבה', 'הערה']);
assert.equal(spec.rows.length, 5);
assert.equal(spec.rows[0][0], 'אור הנר', 'sorted by site group order (most pending first, then name)');
assert.deepEqual(spec.groupKeys.slice(0, 2), [0, 0], 'both אור הנר rows share a band');
const issueRow = spec.rows.find(r => r[3] === '22222222');
assert.equal(issueRow[8], 'בעיה'); assert.equal(issueRow[11], 'אין גישה');
const ctBurned = spec.rows.find(r => r[3] === '11111111');
assert.equal(ctBurned[8], 'נצרב · מוכן לעיסוק');
const genRow = spec.rows.find(r => r[3] === '59965612');
assert.equal(genRow[1], 'גנרטור רפת');
```

- [ ] **Step 2: Run → fails** (`B.xlsxSpec is not a function`).

- [ ] **Step 3: Implement** — inside the PURE block, just before `// PURE-END`:

```js
  var XL_STATE = { pending: 'ממתין', burned: 'נצרב', 'burned-ct': 'נצרב · מוכן לעיסוק', issue: 'בעיה' };
  B.xlsxSpec = function (rows, gens) {
    var byId = {}; (gens || []).forEach(function (g) { byId[g.id] = g; });
    var columns = [
      { header: 'קיבוץ', type: 's', width: 16 }, { header: 'גנרטור', type: 's', width: 14 }, { header: 'סוג', type: 's', width: 9 },
      { header: "מס' מונה", type: 's', width: 12 }, { header: 'כתובת', type: 's', width: 26 }, { header: 'מערכות מקושרות', type: 's', width: 26 },
      { header: 'יחס CT', type: 'n', width: 8 }, { header: 'מונה אב', type: 's', width: 12 }, { header: 'סטטוס', type: 's', width: 18 },
      { header: 'נצרב ע"י', type: 's', width: 10 }, { header: 'תאריך צריבה', type: 'd', width: 12 }, { header: 'הערה', type: 's', width: 24 }
    ];
    var out = [], keys = [];
    B.groupBySite(rows).forEach(function (g, gi) {
      g.rows.forEach(function (r) {
        var gen = byId[r.generator_id];
        out.push([r.site, gen ? gen.name : '', r.meter_type, String(r.serial), r.address || '', r.solar_names || '',
                  r.ct_ratio != null ? Number(r.ct_ratio) : null, r.parent_serial || '', XL_STATE[B.rowState(r)],
                  r.burned_by || '', r.burned_at ? new Date(r.burned_at) : null, r.note || '']);
        keys.push(gi);
      });
    });
    return { sheet: 'צריבות', columns: columns, rows: out, groupKeys: keys };
  };
```
And after the actions block (outside PURE):
```js
  function burnExportXlsx() {
    if (typeof xlDownload !== 'function') { emsToast('ייצוא אקסל לא זמין'); return; }
    var rows = B.filterRows(burnState.rows || [], burnState.f, burnState.gens);
    xlDownload(B.xlsxSpec(rows, burnState.gens), 'צריבות-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  window.burnExportXlsx = burnExportXlsx;
```
Check `xlDownload` is reachable: `grep -n "function xlDownload" js/src/21-excel-export.js` — module-scope functions in the shared bundle scope are callable by bare name (all modules live in one scope), so no `window.` export is needed.

- [ ] **Step 4: Run tests + build**

```bash
node test-meter-burns.mjs && node build.mjs && node -e "new Function(require('fs').readFileSync('js/app.js','utf8'));console.log('ok')"
```
Expected: ✅, built, ok.

- [ ] **Step 5: Commit**

```bash
git add js/src/24-meter-burns.js test-meter-burns.mjs js/app.js index.html VERSION sw.js
git commit -m "feat(burns): 📗 Excel export of the filtered burn list (עידן/viewer)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Generators helper table (עידן/עמיחי)

**Files:**
- Modify: `js/src/24-meter-burns.js` (append)
- Modify: `test-meter-burns.mjs` (append)

**Interfaces:**
- Produces: `B.genSummary(gens, rows)` (PURE) → `[{id, site, name, device_serial, count}]` sorted site he-IL then name; `window.burnGensOpen()`, `window.burnGenSaveSerial(id, value)`.

- [ ] **Step 1: Failing test** — append before the final `console.log`:

```js
// --- generators helper summary ---
const gs = B.genSummary(gens.concat([{ id: 'g2', site: 'אור הנר', name: 'גנרטור לול', device_serial: null }]), rows);
assert.deepEqual(gs.map(x => [x.name, x.count]), [['גנרטור לול', 0], ['גנרטור רפת', 1]]);
```

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Implement** — in PURE block before `// PURE-END`:

```js
  B.genSummary = function (gens, rows) {
    var cnt = {}; (rows || []).forEach(function (r) { if (r.generator_id) cnt[r.generator_id] = (cnt[r.generator_id] || 0) + 1; });
    return (gens || []).map(function (g) { return { id: g.id, site: g.site, name: g.name, device_serial: g.device_serial || '', count: cnt[g.id] || 0 }; })
      .sort(function (a, b) { return a.site.localeCompare(b.site, 'he') || a.name.localeCompare(b.name, 'he'); });
  };
```
Outside PURE (append):
```js
  function burnCanManageGens() { return ['עידן', 'עמיחי'].indexOf(getCurrentUser()) !== -1; }
  function burnGensOpen() {
    if (!burnCanManageGens()) return;
    var m = document.getElementById('burnCardModal'), c = document.getElementById('burnCardContent');
    var list = B.genSummary(burnState.gens, burnState.rows || []);
    c.innerHTML = '<h3 style="margin:0 0 8px;">⚡ גנרטורים (' + list.length + ')</h3><p class="burn-muted" style="margin:0 0 8px;">מספר מונה/בקר של הגנרטור — נשמר ביציאה מהשדה.</p>' +
      (list.length ? '<div style="overflow-x:auto;"><table class="inv-table"><thead><tr><th>קיבוץ</th><th>שם</th><th>מונה/בקר</th><th>מונים</th></tr></thead><tbody>' +
      list.map(function (g) { return '<tr><td>' + burnEsc(g.site) + '</td><td>' + burnEsc(g.name) + '</td><td><input class="burn-search" style="min-height:34px;padding:4px 8px;width:130px;" value="' + burnEsc(g.device_serial) + '" onblur="burnGenSaveSerial(\'' + g.id + '\', this.value)"></td><td>' + g.count + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="dev-empty">עדיין לא נוצרו גנרטורים — שבץ מונה מהרשימה כדי ליצור.</div>');
    m.classList.add('open');
  }
  function burnGenSaveSerial(id, v) {
    var g = burnState.gens.find(function (x) { return x.id === id; }); if (!g || (g.device_serial || '') === v.trim()) return;
    burnSafe(async function () {
      var r = await fetch(SB_URL + '/rest/v1/generators?id=eq.' + id, { method: 'PATCH', headers: Object.assign(burnHdr(true), { Prefer: 'return=minimal' }), body: JSON.stringify({ device_serial: v.trim() || null }) });
      if (!r.ok) throw new Error('שמירת הגנרטור נכשלה (' + r.status + ')');
      g.device_serial = v.trim() || null;
    });
  }
  window.burnGensOpen = burnGensOpen; window.burnGenSaveSerial = burnGenSaveSerial; window.burnCanManageGens = burnCanManageGens;
```
And in `burnRender()`'s header buttons, before the 🔄 button add:
```js
        (burnCanManageGens() ? '<button class="inv-btn small" onclick="burnGensOpen()">⚡ גנרטורים</button> ' : '') +
```

- [ ] **Step 4: Test + build + commit**

```bash
node test-meter-burns.mjs && node build.mjs
git add js/src/24-meter-burns.js test-meter-burns.mjs js/app.js index.html VERSION sw.js
git commit -m "feat(burns): generators helper table (device serial) for עידן/עמיחי

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Docs checkpoint + full test suite + handoff

**Files:**
- Modify: `docs/data-and-security.md` (Tables list), `docs/modules.md`, `docs/CHANGELOG.md`, `docs/backlog.md`, `docs/INDEX.md` (Current state)

- [ ] **Step 1: Run every self-test**

```bash
for f in test-*.mjs; do node "$f" >/dev/null 2>&1 && echo "OK  $f" || echo "FAIL $f"; done
```
Expected: all `OK` (pre-existing failures, if any, must be listed in the report — do not fix them here).

- [ ] **Step 2: Docs**

`docs/data-and-security.md` — add two rows to the Tables table:
```
| `meter_burns` | 🔥 צריבות: one row per Landis E360 generation meter (EMS snapshot cols + status/burned_by/burned_at/generator_id/note). Anon read, auth insert/update. Seed: `db/meter_burns_seed.sql` (generated from `db/meter_burns_seed.csv` by `db/gen_meter_burns_seed.mjs`). |
| `generators` | 🔥 צריבות: generators per site (`unique(site,name)`, `device_serial`). Anon read, auth insert/update. |
```
`docs/modules.md` — add:
```
| `24-meter-burns.js` | 🔥 צריבות tab: `renderBurns`, pure logic `window._burnLogic` (PURE block, tested by `test-meter-burns.mjs`), one-tap burn/issue, multi-select → burn / assign to generator, meter card, generators helper table, Excel export. No EMS writes. |
```
`docs/CHANGELOG.md` — top entry (use the VERSION file's value):
```
## <VERSION> — 2026-09-07 — 🔥 צריבות (meter burn tracker)
New tab for אביאם/ניתאי: 268 Landis E360 generation meters (PP 176 / CT 85 / SP 7) grouped by kibbutz with "נותרו X/Y", search (site/serial/address/solar/generator), one-tap ✅ נצרב / ⚠ בעיה, CT-burned styled 🟣 "מוכן לעיסוק", linked solar systems per meter, multi-select → burn / ⚡ assign to generator (per-kibbutz datalist, new name creates), meter card with EMS link, generators helper table (עידן/עמיחי), 📗 Excel. Tables `meter_burns` + `generators` (`db/meter_burns.sql` + generated seed). Spec: superpowers/specs/2026-09-06-meter-burn-tracker-design.md. Tests: test-meter-burns.mjs.
```
`docs/backlog.md` — under pending: "🔥 צריבות: עידן runs `db/meter_burns.sql` + `db/meter_burns_seed.sql` in Supabase; then dev→main. Deferred: EMS write-back of role, JSON export for the disconnect software, live refresh from EMS `/meters`."
`docs/INDEX.md` — new **🚦 Current state** block at the top of that section:
```
## 🚦 Current state — last: 2026-09-07 (**<VERSION> on `feat/meter-burns` worktree, pending SQL + dev→main**).
**🔥 צריבות — meter burn tracker built (Tasks 0–6 of superpowers/plans/2026-09-07-meter-burn-tracker.md).** Module `24-meter-burns.js`, tables `meter_burns`/`generators`. **Action (עידן):** run `db/meter_burns.sql` then `db/meter_burns_seed.sql` (expect 268 rows, 261 with solar_names), smoke the tab as אביאם on a phone, then merge `feat/meter-burns` → `dev` → `main`. No EMS writes by design.
```

- [ ] **Step 3: Commit + push the branch**

```bash
git add docs/data-and-security.md docs/modules.md docs/CHANGELOG.md docs/backlog.md docs/INDEX.md
git commit -m "docs(burns): checkpoint — tables, module, changelog, current state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/meter-burns
```

- [ ] **Step 4: Report to עידן (Hebrew)** — include: branch + preview link `https://raw.githack.com/PM-Sigma/sigmatec-operations-app/feat/meter-burns/index.html`, the two SQL files to run (local links), expected counts, what was deferred, and any pre-existing failing tests.

---

## Self-review

- **Spec coverage:** tab + per-kibbutz grouping + נותרו (T3) · search across site/serial/address/solar/generator with partial serial, Enter→open (T2/T3) · one-tap burn/issue + undo with confirm (T3) · CT vs PP tags, CT ratio, warnings for missing parent / CT ratio 1 (T3) · CT burned = purple styling only, no extra status (T2 `rowState`) · linked solar systems per meter (seed `solar_names`, T1/T3) · generators: assign within one site, datalist, new-name creates, view kibbutz▸generator▸meters, helper table with device serial (T3/T5) · Excel (T4) · read-only for viewer, hidden from מתניה (T3) · no EMS writes (constraint) · docs checkpoint (T6). Gaps: none. Deferred per עידן: JSON export, EMS role push, live EMS refresh.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `B.*` names identical across T2 test/impl and T3/T4/T5 usage; patch payload keys match DDL columns (`status, burned_by, burned_at, generator_id, note, updated_at`); `generators` columns `site, name, device_serial, created_by` match DDL and `burnCreateGenerator`/`genSummary`.
