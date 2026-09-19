# Kibbutz ↔ EMS Site Integrity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every kibbutz resolves to the correct EMS site or to nothing (never the wrong one), site-less kibbutzim show a ⚠️ indicator and are hard-blocked from all EMS-task creation, and עידן can audit every link.

**Architecture:** One exact-match resolver replaces the fuzzy `indexOf` matcher. A single sync predicate `kibbutzHasSite(name)` — true iff the kibbutz is in the corrected `KIBBUTZ_SITE_MAP`, **or** (when connected) an exact live `/sites` name match exists — backs both the indicator and every block. The curated map is the offline source of truth; a connected-only audit panel deep-verifies each map UUID against live `/sites`.

**Tech Stack:** Vanilla JS modules in `js/src/*.js` concatenated by `node build.mjs` into `js/app.js` (one shared IIFE scope — cross-file function refs work). Tests are standalone Node scripts (`test-*.mjs`) that load a src file via `new Function` with injected deps. Data fixes via Supabase MCP.

## Global Constraints

- **Never edit `js/app.js` directly** — edit `js/src/*.js`, then run `node build.mjs`.
- Work on branch `feat/kibbutz-site-integrity` (already cut from `dev`; spec + backlog already committed there).
- Respond to the user in English; keep Hebrew UI strings/owner names in Hebrew.
- No secrets in the repo/bundle.
- **Refinement of the spec's `kibbutzHasSite` definition:** use map-membership (+ live exact match when connected), **not** the `ems_cache` cross-check the spec sketched — the cache only holds sites that have OPEN tasks, so a valid site with zero open tasks would false-alarm. Map + live-exact is correct and offline-safe.
- Confirmed EMS site UUIDs (from live `ems_cache`, 2026-07-19): שלוחות=`9a0ba3d3-b7f2-4597-b3ee-3537e4f8d75e`, דפנה=`490a865d-c4f4-4a4a-96da-14a273e7f03b`, ניצנים=`ae9ac4c6-119e-496c-9aad-331e95a2551d`.

---

### Task 1: Rewrite the resolver `emsSiteIdForKibbutz` — exact match, no fuzz

**Files:**
- Modify: `js/src/14-calendar.js:341-349` (`emsSiteIdForKibbutz`)
- Test: `test-site-resolver.mjs` (create)

**Interfaces:**
- Consumes: `getEmsSites()` (async → array of `{id,name}`), `kibbutzSiteIds(name)` (→ `string[]` of UUIDs), `emsNormName(s)` (whitespace-collapse+trim).
- Produces: `emsSiteIdForKibbutz(name)` → `Promise<string>` — exact live match id, else corrected-map first UUID, else `''`. **No containment matching.**

- [ ] **Step 1: Write the failing test**

Create `test-site-resolver.mjs`:
```js
// Self-check for the EMS site resolver (js/src/14-calendar.js) — exact match only, no fuzzy containment.
// Run: node test-site-resolver.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  fn().then(() => console.log('  ok - ' + name))
      .catch(e => { failures++; console.log('  FAIL - ' + name + ': ' + e.message); });
}

// Extract just the resolver helpers from the module, injecting their deps.
function load(sites, map) {
  const body = src.substring(src.indexOf('function emsNormName'), src.indexOf('// Admin-role users'));
  const fn = new Function('getEmsSites', 'kibbutzSiteIds',
    body + '\nreturn { emsNormName, emsSiteIdForKibbutz, kibbutzHasSite, emsSitesCached };');
  return fn(async () => sites, (name) => map[name] || []);
}

const SITES = [{ id: 'S_SHILUHOT', name: 'שלוחות' }, { id: 'S_DAFNA', name: 'דפנה' }, { id: 'S_GAT', name: 'גת' }];

check('exact live name match wins', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('שלוחות'), 'S_SHILUHOT');
});
check('whitespace-normalized exact match', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('  שלוחות '), 'S_SHILUHOT');
});
check('NO containment match (partial name does not resolve)', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('שלו'), '');   // used to wrongly match "שלוחות"
});
check('offline (no live match) falls back to the map', async () => {
  const m = load([], { 'דפנה': ['490a865d-c4f4-4a4a-96da-14a273e7f03b'] });
  assert.strictEqual(await m.emsSiteIdForKibbutz('דפנה'), '490a865d-c4f4-4a4a-96da-14a273e7f03b');
});
check('no match anywhere → empty string', async () => {
  const m = load(SITES, {});
  assert.strictEqual(await m.emsSiteIdForKibbutz('קיבוץ דמיוני'), '');
});

setTimeout(() => { console.log(failures ? `\n${failures} FAILED` : '\nall resolver checks passed'); process.exit(failures ? 1 : 0); }, 200);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-site-resolver.mjs`
Expected: FAIL — "NO containment match" fails (current code matches `שלו`→`שלוחות`), and/or `emsSitesCached`/`kibbutzHasSite` undefined (added in Task 2). It's fine that Task-2 symbols are absent now — the `return {…}` will throw `kibbutzHasSite is not defined`; that still proves the harness runs. If the throw blocks all checks, temporarily change the `return` to only `{ emsNormName, emsSiteIdForKibbutz }` for this step, then restore in Task 2.

- [ ] **Step 3: Rewrite the resolver**

In `js/src/14-calendar.js`, replace the body of `emsSiteIdForKibbutz` (lines 341-349) with:
```js
  // Map a kibbutz name → EMS site id. EXACT normalized-name match against live /sites first
  // (self-heals EMS renames); offline / no live match → the curated KIBBUTZ_SITE_MAP. Returns ''
  // when there is no confident site — callers must treat '' as "not linked" (no fuzzy guessing).
  async function emsSiteIdForKibbutz(name) {
    const target = emsNormName(name);
    if (!target) return '';
    try {
      const sites = await getEmsSites();
      const hit = sites.find(s => emsNormName(s.name) === target);
      if (hit) return hit.id;
    } catch (e) { /* offline / API down → fall through to the curated map */ }
    const mapped = (typeof kibbutzSiteIds === 'function') ? kibbutzSiteIds(name) : [];
    return mapped.length ? mapped[0] : '';
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-site-resolver.mjs`
Expected: the 5 resolver checks PASS (the two Task-2 symbols still missing → restore full `return` after Task 2).

- [ ] **Step 5: Commit**

```bash
git add js/src/14-calendar.js test-site-resolver.mjs
git commit -m "fix(ems): exact-match site resolver — drop fuzzy indexOf containment (wrong-site bug)"
```

---

### Task 2: Add `kibbutzHasSite` gate + warm the live sites cache on connect

**Files:**
- Modify: `js/src/14-calendar.js` (add `emsSitesCached` + `kibbutzHasSite` right after `emsSiteIdForKibbutz`)
- Modify: `js/src/13-ems.js:164-173` (`emsOnConnected` — warm `getEmsSites()` so the gate is accurate online)
- Test: `test-site-resolver.mjs` (extend)

**Interfaces:**
- Consumes: `kibbutzSiteIds(name)`, module-local `_emsSites` (populated by `getEmsSites`), `emsNormName`.
- Produces: `kibbutzHasSite(name)` → `boolean` (SYNC) — true iff `kibbutzSiteIds(name).length`, or the live sites cache is loaded and has an exact normalized name match. `emsSitesCached()` → the cached sites array or `null`.

- [ ] **Step 1: Write the failing test** (append before the `setTimeout` in `test-site-resolver.mjs`):
```js
check('kibbutzHasSite: true when in the map (offline)', async () => {
  const m = load([], { 'דפנה': ['490a865d-c4f4-4a4a-96da-14a273e7f03b'] });
  assert.strictEqual(m.kibbutzHasSite('דפנה'), true);
});
check('kibbutzHasSite: false when unmapped and no live sites', async () => {
  const m = load([], {});
  assert.strictEqual(m.kibbutzHasSite('קיבוץ חדש'), false);
});
check('kibbutzHasSite: true via live exact match once sites are cached', async () => {
  const m = load(SITES, {});
  await m.emsSiteIdForKibbutz('גת');          // this call populates the live cache
  assert.strictEqual(m.kibbutzHasSite('גת'), true);
  assert.strictEqual(m.kibbutzHasSite('גת ב'), false);
});
```
Also restore the full `return { emsNormName, emsSiteIdForKibbutz, kibbutzHasSite, emsSitesCached };` in the `load()` harness if you narrowed it in Task 1.

- [ ] **Step 2: Run to verify it fails**

Run: `node test-site-resolver.mjs`
Expected: FAIL — `kibbutzHasSite is not defined`.

- [ ] **Step 3: Implement the gate**

In `js/src/14-calendar.js`, immediately after the rewritten `emsSiteIdForKibbutz`, add:
```js
  // The live /sites list, cached by getEmsSites (module-local _emsSites). Exposed for kibbutzHasSite/tests.
  function emsSitesCached() { return _emsSites; }
  // SYNC gate used by the indicator AND every task-creation block — they can never disagree.
  // True iff the kibbutz is in the curated map, OR (connected) an exact live-site name match exists.
  function kibbutzHasSite(name) {
    if ((typeof kibbutzSiteIds === 'function') && kibbutzSiteIds(name).length) return true;
    const sites = emsSitesCached();
    if (sites && sites.length) { const t = emsNormName(name); return sites.some(s => emsNormName(s.name) === t); }
    return false;
  }
```

- [ ] **Step 4: Warm the sites cache on connect**

In `js/src/13-ems.js`, inside `emsOnConnected` (after the cache sync, ~line 169), add a best-effort warm-up so `kibbutzHasSite` is accurate while connected:
```js
    try { if (typeof getEmsSites === 'function') await getEmsSites(); } catch (e) { /* gate falls back to the map */ }
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test-site-resolver.mjs`
Expected: all 8 checks PASS.

- [ ] **Step 6: Commit**

```bash
git add js/src/14-calendar.js js/src/13-ems.js test-site-resolver.mjs
git commit -m "feat(ems): kibbutzHasSite gate + warm live sites cache on connect"
```

---

### Task 3: Correct `KIBBUTZ_SITE_MAP` (fix שלוחות, add דפנה + ניצנים)

**Files:**
- Modify: `js/src/01-data.js:666-714` (`KIBBUTZ_SITE_MAP`)
- Test: `test-site-map.mjs` (create)

**Interfaces:**
- Produces: corrected `KIBBUTZ_SITE_MAP` — שלוחות→`9a0ba3d3-…`, plus new דפנה→`490a865d-…` and ניצנים→`ae9ac4c6-…`.

- [ ] **Step 1: Write the failing test**

Create `test-site-map.mjs`:
```js
// Asserts the corrected kibbutz→EMS-site UUIDs (js/src/01-data.js KIBBUTZ_SITE_MAP).
// Run: node test-site-map.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');
const body = src.substring(src.indexOf('const KIBBUTZ_SITE_MAP'), src.indexOf('function kibbutzSiteIds'));
const MAP = new Function(body + '\nreturn KIBBUTZ_SITE_MAP;')();
let failures = 0;
const eq = (n, a, b) => { try { assert.deepStrictEqual(a, b); console.log('  ok - ' + n); } catch (e) { failures++; console.log('  FAIL - ' + n + ': ' + e.message); } };
eq('שלוחות → correct UUID', MAP['שלוחות'], ['9a0ba3d3-b7f2-4597-b3ee-3537e4f8d75e']);
eq('דפנה mapped', MAP['דפנה'], ['490a865d-c4f4-4a4a-96da-14a273e7f03b']);
eq('ניצנים mapped', MAP['ניצנים'], ['ae9ac4c6-119e-496c-9aad-331e95a2551d']);
eq('שלוחות no longer points at the stale UUID', MAP['שלוחות'].includes('07ab3dee-7192-4f19-a004-0fae7c09d3fd'), false);
console.log(failures ? `\n${failures} FAILED` : '\nmap checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test-site-map.mjs`
Expected: FAIL — שלוחות has the stale UUID; דפנה/ניצנים absent.

- [ ] **Step 3: Correct the map**

In `js/src/01-data.js`, change the שלוחות line (709) to:
```js
    "שלוחות": ["9a0ba3d3-b7f2-4597-b3ee-3537e4f8d75e"],
```
And add these two entries (keep alphabetical-ish placement; exact position doesn't matter — lookup is by key):
```js
    "דפנה": ["490a865d-c4f4-4a4a-96da-14a273e7f03b"],
    "ניצנים": ["ae9ac4c6-119e-496c-9aad-331e95a2551d"],
```

- [ ] **Step 4: Run to verify it passes**

Run: `node test-site-map.mjs`
Expected: 4 checks PASS.

- [ ] **Step 5: Commit**

```bash
git add js/src/01-data.js test-site-map.mjs
git commit -m "fix(ems): correct KIBBUTZ_SITE_MAP — שלוחות UUID + add דפנה, ניצנים"
```

---

### Task 4: Fix `kibbutz_details` rows (Supabase, via MCP)

**Files:** none in repo — Supabase `kibbutz_details` table only.

**Interfaces:** Produces correct customer-entity rows so the delivery cert (feature D) prefills the right company.

- [ ] **Step 1: Inspect current rows**

Run (Supabase MCP `execute_sql`):
```sql
select kibbutz, legal_name, company_id, contact from kibbutz_details
where kibbutz in ('שלוחות','דפנה','ניצנים');
```
Expected: שלוחות shows `legal_name='שלטרון שילוט אלקטרוני בע"מ'` (wrong); דפנה/ניצנים absent.

- [ ] **Step 2: Apply the corrections**

Run (Supabase MCP `execute_sql`). שלוחות has no known correct legal entity in our data → blank it (editable on the cert) rather than keep the wrong company; דפנה/ניצנים inserted blank-but-present so the cert prefills the kibbutz name:
```sql
update kibbutz_details set legal_name='', company_id='', contact=''
  where kibbutz='שלוחות';
insert into kibbutz_details (kibbutz, legal_name, company_id, contact)
  values ('דפנה','','',''), ('ניצנים','','','')
  on conflict (kibbutz) do nothing;
```
(If the table's PK/unique is not `kibbutz`, first `select` the constraint and adjust the `on conflict` target. If `on conflict` errors, run a guarded insert: `insert … select … where not exists (select 1 from kibbutz_details where kibbutz=…)`.)

- [ ] **Step 3: Verify**

Run:
```sql
select kibbutz, legal_name, company_id from kibbutz_details
where kibbutz in ('שלוחות','דפנה','ניצנים') order by kibbutz;
```
Expected: 3 rows; שלוחות no longer "שלטרון"; דפנה + ניצנים present.

- [ ] **Step 4: Record (no code commit)**

Note the applied SQL in the CHANGELOG task (Task 9). No repo change — this is a data fix.

---

### Task 5: Card ⚠️ "not linked to EMS" indicator

**Files:**
- Modify: `js/src/13-ems.js` (add `applyCardSiteWarnings`, export, and call it from the two `applyCardEmsWidgets` call-sites)
- Modify: `js/src/01-data.js:1012` and `js/src/14-calendar.js:574` (call the new pass alongside `applyCardEmsWidgets`)
- Modify: `css/app.css` (one `.card-no-site` chip style)
- Test: `test-site-indicator.mjs` (create)

**Interfaces:**
- Consumes: `kibbutzHasSite(name)`, `emsEsc(s)`.
- Produces: `applyCardSiteWarnings()` — injects a `⚠️ לא מקושר ל-EMS` chip into every `.kibbutz[data-name]` card where `!kibbutzHasSite(name)`; removes stale chips first. Idempotent.

- [ ] **Step 1: Write the failing test**

Create `test-site-indicator.mjs`:
```js
// Self-check for applyCardSiteWarnings (js/src/13-ems.js) — ⚠️ chip only on site-less cards.
// Run: node test-site-indicator.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/13-ems.js'), 'utf8');

// minimal card DOM double
function mkCard(name) {
  const kids = [];
  return {
    dataset: { name },
    _kids: kids,
    querySelectorAll: () => ({ forEach() {} }),           // no stale chips
    querySelector: () => null,
    appendChild(el) { kids.push(el); },
    insertAdjacentElement(_pos, el) { kids.push(el); },
    get chipCount() { return kids.filter(k => (k.className || '').includes('card-no-site')).length; }
  };
}
const cards = [mkCard('דפנה'), mkCard('שלוחות')];   // דפנה linked (mapped), שלוחות linked
const orphan = mkCard('מקום ללא אתר');
cards.push(orphan);
const document_ = { querySelectorAll: () => cards, createElement: () => ({ className: '', innerHTML: '', style: {} }) };

const fn = new Function('document', 'kibbutzHasSite', 'emsEsc',
  src.substring(src.indexOf('function applyCardSiteWarnings'), src.indexOf('function applyCardEmsWidgets')) +
  '\nreturn applyCardSiteWarnings;');
const linked = new Set(['דפנה', 'שלוחות']);
fn(document_, (n) => linked.has(n), s => s)();

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
t('linked cards get no chip', cards[0].chipCount === 0 && cards[1].chipCount === 0);
t('site-less card gets the ⚠️ chip', orphan.chipCount === 1);
console.log(failures ? `\n${failures} FAILED` : '\nindicator checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test-site-indicator.mjs`
Expected: FAIL — `applyCardSiteWarnings` not found.

- [ ] **Step 3: Implement the pass**

In `js/src/13-ems.js`, directly **above** `function applyCardEmsWidgets()` (line 186), add:
```js
  // ⚠️ indicator: mark every kibbutz card whose name has no confident EMS site. Runs regardless of
  // cache-sync state (unlike applyCardEmsWidgets) so field users offline still see the warning.
  function applyCardSiteWarnings() {
    document.querySelectorAll('.kibbutz[data-name]').forEach(card => {
      card.querySelectorAll('.card-no-site').forEach(e => e.remove());   // clear stale
      const nm = card.dataset.name;
      if (typeof kibbutzHasSite === 'function' && kibbutzHasSite(nm)) return;
      const chip = document.createElement('div');
      chip.className = 'card-no-site';
      chip.innerHTML = '⚠️ לא מקושר ל-EMS';
      const anchor = card.querySelector(':scope > .excel-status')
                  || card.querySelector(':scope > .kibbutz-name-row')
                  || card.querySelector(':scope > .kibbutz-name');
      if (anchor) anchor.insertAdjacentElement('afterend', chip); else card.appendChild(chip);
    });
  }
  window.applyCardSiteWarnings = applyCardSiteWarnings;
```

- [ ] **Step 4: Wire the call-sites**

In `js/src/13-ems.js`, at the end of `applyCardEmsWidgets` add `applyCardSiteWarnings();` — but to keep the site warning independent of the `syncedAt` early-return, instead add the call at **both** existing `applyCardEmsWidgets()` invocations:
- `js/src/01-data.js:1012` → after that line add: `if (typeof applyCardSiteWarnings === 'function') applyCardSiteWarnings();`
- `js/src/14-calendar.js:574` → after that line add: `if (typeof applyCardSiteWarnings === 'function') applyCardSiteWarnings();`

- [ ] **Step 5: Add the chip style**

In `css/app.css`, add:
```css
  .card-no-site { display:inline-block; margin:4px 0; padding:2px 9px; border-radius:12px;
    background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-size:11px; font-weight:700; }
```

- [ ] **Step 6: Run to verify it passes**

Run: `node test-site-indicator.mjs`
Expected: 2 checks PASS.

- [ ] **Step 7: Commit**

```bash
git add js/src/13-ems.js js/src/01-data.js js/src/14-calendar.js css/app.css test-site-indicator.mjs
git commit -m "feat(ems): ⚠️ 'not linked to EMS' indicator on site-less kibbutz cards"
```

---

### Task 6: Hard-block task creation from the kibbutz modal

**Files:**
- Modify: `js/src/14-calendar.js:512-530` (`prepModalEmsSection`) and `:536-550` (`createEmsTaskForKibbutz`)
- Test: `test-site-block.mjs` (create)

**Interfaces:**
- Consumes: `kibbutzHasSite(name)`.
- Produces: `prepModalEmsSection(name)` renders a disabled ⚠️ notice instead of the "create" button when site-less; `createEmsTaskForKibbutz()` refuses (toast) when site-less.

- [ ] **Step 1: Write the failing test**

Create `test-site-block.mjs`:
```js
// Self-check: the kibbutz-modal EMS section blocks task creation when the kibbutz has no site.
// Run: node test-site-block.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');

const box = { style: {}, innerHTML: '' };
const document_ = { getElementById: id => (id === 'modalEmsSection' ? box : { value: '', style: {}, classList: { add() {}, remove() {} } }) };
const body = src.substring(src.indexOf('function prepModalEmsSection'), src.indexOf('async function emsEditTask'));
let hasSite = false, toasts = [];
const fn = new Function('document', 'canUseEms', 'kibbutzSiteIds', 'kibbutzHasSite', 'emsCacheTasksForKibbutz',
  'EMS_PRIORITY_DOT', 'EMS_STATUS', 'emsEsc', 'isEmsConnected', 'closeModal', 'showPage', 'emsToast',
  'emsCreateTaskModal', 'emsSiteIdForKibbutz', 'currentKibbutz',
  body + '\nreturn { prepModalEmsSection, createEmsTaskForKibbutz };');
const api = fn(document_, () => true, () => [], () => hasSite, () => [], {}, {}, s => s,
  () => true, () => {}, () => {}, m => toasts.push(m), async () => {}, async () => '', 'מקום ללא אתר');

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };

hasSite = false; api.prepModalEmsSection('מקום ללא אתר');
t('site-less modal shows the ⚠️ block, not a create button', /לא מקושר/.test(box.innerHTML) && !/createEmsTaskForKibbutz/.test(box.innerHTML));

hasSite = true; box.innerHTML = ''; api.prepModalEmsSection('דפנה');
t('linked modal shows the create button', /createEmsTaskForKibbutz/.test(box.innerHTML));

hasSite = false; toasts = [];
await api.createEmsTaskForKibbutz();
t('createEmsTaskForKibbutz refuses when site-less', toasts.some(m => /לא מקושר|אין אתר/.test(m)));

console.log(failures ? `\n${failures} FAILED` : '\nblock checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test-site-block.mjs`
Expected: FAIL — no block logic yet.

- [ ] **Step 3: Block in `prepModalEmsSection`**

In `js/src/14-calendar.js`, inside `prepModalEmsSection`, after `box.style.display = '';` (line 516) and before the `const ids = …` line, add:
```js
    if (typeof kibbutzHasSite === 'function' && !kibbutzHasSite(name)) {
      box.innerHTML = '<div class="modal-ems-nosite" style="margin-top:6px;padding:9px 12px;background:#fef2f2;' +
        'border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-size:13px;font-weight:700;">' +
        '⚠️ לא מקושר ל-EMS — צור או קשר את האתר ב-EMS לפני פתיחת משימה.</div>';
      return;
    }
```

- [ ] **Step 4: Block in `createEmsTaskForKibbutz`**

In the same file, at the top of `createEmsTaskForKibbutz` (after `const name = currentKibbutz;`), add:
```js
    if (typeof kibbutzHasSite === 'function' && !kibbutzHasSite(name)) {
      emsToast('⚠️ אין אתר EMS מקושר לקיבוץ — צור/קשר את האתר ב-EMS תחילה');
      return;
    }
```

- [ ] **Step 5: Run to verify it passes**

Run: `node test-site-block.mjs`
Expected: 3 checks PASS.

- [ ] **Step 6: Commit**

```bash
git add js/src/14-calendar.js test-site-block.mjs
git commit -m "feat(ems): hard-block kibbutz-modal task creation when no EMS site"
```

---

### Task 7: Hard-block customer-order approval when the kibbutz is site-less

**Files:**
- Modify: `js/src/07-orders.js:514+` (`approveCustomerOrder`)
- Test: `test-order-site-gate.mjs` (create)

**Interfaces:**
- Consumes: `kibbutzHasSite(name)`, `isDirectSupply(o)`, `orderKibbutz(o)`.
- Produces: `approveCustomerOrder` aborts (alert + no writes) when the order opens an EMS task (`!isDirectSupply`) and the kibbutz is site-less.

- [ ] **Step 1: Write the failing test**

Create `test-order-site-gate.mjs`:
```js
// Self-check: customer-order approval is blocked when the kibbutz has no EMS site (unless drop-ship).
// Run: node test-order-site-gate.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/07-orders.js'), 'utf8');

// Confirm the guard text exists and sits before the createTask enqueue.
let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
const guardIdx = src.indexOf('kibbutzHasSite(kibbutz)');
const enqueueIdx = src.indexOf("kind: 'createTask'");
t('approveCustomerOrder references kibbutzHasSite', guardIdx !== -1);
t('the site gate precedes the createTask enqueue', guardIdx !== -1 && guardIdx < enqueueIdx);
t('drop-ship path is exempt (isDirectSupply checked in the guard)',
  /isDirectSupply\(o\)[\s\S]{0,120}kibbutzHasSite\(kibbutz\)|kibbutzHasSite\(kibbutz\)[\s\S]{0,160}return/.test(src));
console.log(failures ? `\n${failures} FAILED` : '\norder-gate checks passed');
process.exit(failures ? 1 : 0);
```
(This is a source-contract test — a full behavioral harness for `approveCustomerOrder` would need ~15 injected deps; the contract check plus the manual smoke in Task 9 covers it proportionally. `ponytail:` source-grep test, upgrade to a behavioral harness if this path regresses.)

- [ ] **Step 2: Run to verify it fails**

Run: `node test-order-site-gate.mjs`
Expected: FAIL — no `kibbutzHasSite` reference in `07-orders.js` yet.

- [ ] **Step 3: Add the gate**

In `js/src/07-orders.js`, inside `approveCustomerOrder`, after the ספק-ישיר short-circuit block (around line 517-518, where `isDirectSupply` is handled) and **before** any stock movement / the `emsWriteOrQueue({ kind: 'createTask' … })` call, add:
```js
      // Hard gate: a customer supply opens an EMS "אספקת ציוד" task. Refuse to approve if the kibbutz
      // has no confident EMS site (would create a wrong-site / dead-lettered task). Drop-ship opens no
      // task, so it is exempt.
      if (!isDirectSupply(o) && typeof kibbutzHasSite === 'function' && !kibbutzHasSite(kibbutz)) {
        alert('⚠️ לקיבוץ "' + kibbutz + '" אין אתר EMS מקושר — קשר או צור את האתר ב-EMS לפני אישור ההזמנה.');
        return;
      }
```
(Place it immediately after `var kibbutz = orderKibbutz(o);` and the drop-ship handling, so it guards both the movement and the task enqueue.)

- [ ] **Step 4: Run to verify it passes**

Run: `node test-order-site-gate.mjs`
Expected: 3 checks PASS.

- [ ] **Step 5: Commit**

```bash
git add js/src/07-orders.js test-order-site-gate.mjs
git commit -m "feat(ems): block customer-order approval for site-less kibbutz (no wrong-site task)"
```

---

### Task 8: עידן-only linkage audit panel

**Files:**
- Modify: `index.html` (add a collapsible `#emsSiteAudit` panel in the EMS view, near the `+ משימה חדשה` toolbar ~line 594)
- Modify: `js/src/14-calendar.js` (add `renderEmsSiteAudit()` + a toggle; call on EMS view show)
- Test: `test-site-audit.mjs` (create)

**Interfaces:**
- Consumes: `SHEET_DATA` kibbutz names, `kibbutzSiteIds`, `getEmsSites()`, `isIdan()`, `emsEsc`.
- Produces: `renderEmsSiteAudit()` — builds rows `{kibbutz, siteName|'—', ok:boolean}` and paints ✅/⚠️; visible only when `isIdan()`.

- [ ] **Step 1: Write the failing test**

Create `test-site-audit.mjs`:
```js
// Self-check for the linkage audit row builder (js/src/14-calendar.js).
// Run: node test-site-audit.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');
const body = src.substring(src.indexOf('function emsSiteAuditRows'), src.indexOf('function renderEmsSiteAudit'));
const emsNorm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const fn = new Function('emsNormName', body + '\nreturn emsSiteAuditRows;');
const emsSiteAuditRows = fn(emsNorm);

const kibbutzim = ['דפנה', 'שלוחות', 'מקום ללא אתר'];
const sites = [{ id: 'a', name: 'דפנה' }, { id: 'b', name: 'שלוחות' }];
const map = { 'דפנה': ['a'], 'שלוחות': ['b'], 'מקום ללא אתר': [] };
const rows = emsSiteAuditRows(kibbutzim, sites, name => map[name] || []);

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
t('linked kibbutz → ok with site name', rows.find(r => r.kibbutz === 'דפנה').ok === true && rows.find(r => r.kibbutz === 'דפנה').siteName === 'דפנה');
t('site-less kibbutz → not ok', rows.find(r => r.kibbutz === 'מקום ללא אתר').ok === false);
t('all kibbutzim represented', rows.length === 3);
console.log(failures ? `\n${failures} FAILED` : '\naudit checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node test-site-audit.mjs`
Expected: FAIL — `emsSiteAuditRows` not found.

- [ ] **Step 3: Implement the row builder + renderer**

In `js/src/14-calendar.js`, add (near the other EMS helpers):
```js
  // Pure: build audit rows — for each kibbutz name, resolve its site id via the map, then look up the
  // matching live site NAME to confirm the UUID is real. ok = mapped AND the UUID exists in live /sites.
  function emsSiteAuditRows(kibbutzNames, sites, resolveIds) {
    const byId = {}; (sites || []).forEach(s => { byId[s.id] = s.name; });
    return (kibbutzNames || []).map(nm => {
      const ids = (resolveIds || (() => []))(nm);
      const siteName = ids.length ? (byId[ids[0]] || '') : '';
      return { kibbutz: nm, siteName: siteName || '—', ok: !!siteName };
    });
  }
  async function renderEmsSiteAudit() {
    const box = document.getElementById('emsSiteAudit');
    if (!box) return;
    if (!(typeof isIdan === 'function' && isIdan())) { box.style.display = 'none'; return; }
    box.style.display = '';
    let sites = []; try { sites = await getEmsSites(); } catch (e) {}
    const names = Object.keys(((window.SHEET_DATA && window.SHEET_DATA.statuses) || {}))
      .concat(((window.SHEET_DATA && window.SHEET_DATA.kibbutzim) || []).map(k => k.name || k))
      .filter((v, i, a) => v && a.indexOf(v) === i);
    const rows = emsSiteAuditRows(names, sites, (typeof kibbutzSiteIds === 'function') ? kibbutzSiteIds : () => []);
    const bad = rows.filter(r => !r.ok).length;
    box.querySelector('.audit-body').innerHTML =
      '<div style="font-size:12px;color:#64748b;margin-bottom:6px;">' + rows.length + ' קיבוצים · ' +
      (bad ? ('<b style="color:#b91c1c;">' + bad + ' לא מקושרים</b>') : '✅ הכל מקושר') + '</div>' +
      rows.sort((a, b) => a.ok - b.ok).map(r =>
        '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">' +
        '<span>' + (r.ok ? '✅' : '⚠️') + ' ' + emsEsc(r.kibbutz) + '</span>' +
        '<span style="color:#64748b;">' + emsEsc(r.siteName) + '</span></div>').join('');
  }
  window.renderEmsSiteAudit = renderEmsSiteAudit;
```
(Adjust `names` source to however kibbutz card names are enumerated elsewhere — mirror the source used by the card render loop; the `statuses` keys + `kibbutzim` names union is the safe superset.)

- [ ] **Step 4: Add the panel markup + trigger**

In `index.html`, just below the EMS toolbar with `+ משימה חדשה` (~line 594), add:
```html
        <div id="emsSiteAudit" style="display:none;margin:10px 0;border:1px solid #e2e8f0;border-radius:10px;">
          <button type="button" onclick="const b=this.nextElementSibling;b.style.display=b.style.display==='none'?'':'none';"
            style="width:100%;text-align:right;background:#f8fafc;border:none;padding:9px 12px;font-weight:800;color:#1e3a8a;cursor:pointer;border-radius:10px;">
            🔗 בדיקת קישור אתרים (עידן)</button>
          <div class="audit-body" style="display:none;padding:8px 12px;"></div>
        </div>
```
Then call `renderEmsSiteAudit()` where the EMS view is shown — find the EMS view show/`loadEmsTasks` entry (`js/src/14-calendar.js`) and add `if (typeof renderEmsSiteAudit === 'function') renderEmsSiteAudit();`.

- [ ] **Step 5: Run to verify it passes**

Run: `node test-site-audit.mjs`
Expected: 3 checks PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html js/src/14-calendar.js test-site-audit.mjs
git commit -m "feat(ems): עידן-only kibbutz↔site linkage audit panel"
```

---

### Task 9: Build, full-suite green, manual smoke, memory checkpoint

**Files:**
- Modify: `js/app.js` (generated), `VERSION`, `index.html`/`css/app.css` `?v=` stamps (generated by build)
- Modify: `docs/CHANGELOG.md`, `docs/backlog.md`, `docs/INDEX.md`, spec STATUS header

- [ ] **Step 1: Build**

Run: `node build.mjs`
Expected: `js/app.js` regenerated, VERSION bumped, no errors.

- [ ] **Step 2: Run the full suite**

Run each: `node test-site-resolver.mjs && node test-site-map.mjs && node test-site-indicator.mjs && node test-site-block.mjs && node test-order-site-gate.mjs && node test-site-audit.mjs`
Then the regression suites touched by shared files: `node test-dropship.mjs && node test-order-patch.mjs && node test-visit-cert-gate.mjs`
Expected: all PASS.

- [ ] **Step 3: Manual smoke (record in CHANGELOG)**

On the dev preview (`raw.githack.com/.../feat/kibbutz-site-integrity/…` or after merge to dev), logged in as עידן with EMS connected:
- דפנה + שלוחות cards show their real open EMS tasks (no ⚠️).
- A genuinely-unmapped test name shows ⚠️ and its modal shows the block (no create button).
- The audit panel lists all kibbutzim with ✅/⚠️.
- Approving a customer order for a site-less kibbutz is refused with the alert.

- [ ] **Step 4: Memory checkpoint**

- `docs/CHANGELOG.md`: new entry (resolver fix + data corrections + indicator/block + audit; note the `kibbutz_details` SQL applied via MCP).
- `docs/backlog.md`: flip the 🟡 IN PROGRESS line — mark A ✅ SHIPPED (or dev), leave D/B/C pending.
- `docs/INDEX.md`: refresh the 🚦 Current state block.
- Spec `2026-07-19-kibbutz-site-integrity-design.md`: flip STATUS → ✅ SHIPPED.

- [ ] **Step 5: Commit + ship**

```bash
git add -A
git commit -m "chore: build + docs — kibbutz↔EMS site integrity (spec A) shipped"
```
Then follow the parallel-safe merge protocol (CLAUDE.md): `git fetch origin`, rebase onto `origin/dev` if it moved, re-run `node build.mjs`, merge `feat/kibbutz-site-integrity`→`dev` (ff), verify on preview, then `dev`→`main` ff on עידן's approval.

---

## Self-review

**Spec coverage:**
- Exact-match resolver / no fuzz → Task 1 ✅
- `kibbutzHasSite` single gate → Task 2 ✅
- Data corrections (map + kibbutz_details) → Tasks 3, 4 ✅
- ⚠️ indicator (card + modal) → Tasks 5, 6 ✅
- Hard block on all 3 creation paths → kibbutz modal (Task 6), order approval (Task 7), quick-order (feature B — B's plan will call `kibbutzHasSite`; noted, out of scope here) ✅
- עידן-only audit → Task 8 ✅
- Testing (resolver units, gate matrix, indicator, regression, manual smoke) → Tasks 1-9 ✅

**Placeholder scan:** none — every code/step is concrete. Two `ponytail:`-flagged proportional shortcuts (Task 7 source-contract test; Task 8 `names` enumeration to mirror the card loop) are called out explicitly, not hidden.

**Type consistency:** `kibbutzHasSite(name)→boolean`, `emsSiteIdForKibbutz(name)→Promise<string>`, `emsSitesCached()→array|null`, `applyCardSiteWarnings()→void`, `emsSiteAuditRows(names,sites,resolveIds)→[{kibbutz,siteName,ok}]`, `renderEmsSiteAudit()→Promise<void>` — used consistently across tasks and tests.
