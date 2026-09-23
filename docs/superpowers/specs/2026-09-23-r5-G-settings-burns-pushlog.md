# Package G: Settings + burns + push log — spec and implementation plan

STATUS: 🟡 OPEN — planned 23.9, NOT built. Resume: run the L tasks now (they need no designer input). The U tasks start only after the designer's PASS on the G mock screens and after packages DS (`r9/DS`, c6eed19) and S are on `origin/main`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the burns page (`js/src/24-meter-burns.js`) and the push log (`js/src/23-push-log.js`) to React on the round-5 design system, redo the ⚙️ settings sheet on the same parts, and delete both legacy files.

**Architecture:** Pure logic goes first into `app/src/lib/burns.ts` (extended) and a new `app/src/lib/pushLog.ts`. Golden and parity tests pin today's behaviour before anything is deleted. The pages then mount into the existing `#burns-view` / `#pushlog-view` containers with the Hours pattern (a MutationObserver lazy-loads the island the first time the view is shown). The gates move off the retiring files into `00-bridge.js` and `00-consts.js`, so `showPage` keeps working after the delete.

**Tech Stack:** React 18 + TanStack Query + supabase-js (islands in `app/src`), vitest, the root `test-*.mjs` runners, Playwright (4 projects + mobile-360-light), legacy vanilla JS in `js/src/*.js` built by `node build.mjs`.

**Spec inputs (binding):** `docs/superpowers/specs/2026-09-23-round-5-design.md` (row G, the Burns/Settings rulings, Phase 3 gates), `docs/superpowers/specs/2026-09-23-design-system-design.md` (tokens, components, the burns title ruling), `docs/design/tools-and-motion.md` (motion, sign-off protocol), OPS GRAPH (`docs/ops-graph`).

---

## 1. Requirements

| # | Requirement | Source |
|---|---|---|
| G-R1 | The burns page is React. Title: **"צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק"**, which wraps to two lines (עידן overruled the consultant's shorter title). | round-5 row G; DS rulings |
| G-R2 | The Excel and גנרטורים actions sit in **one row**. | round-5 row G |
| G-R3 | Every burns feature of today survives: tiles (סה״כ / נותרו / נצרבו / בעיות), search (Enter on a single hit opens it), site / status / kind filters (kept per device), site sections with a progress bar, rows grouped by generator, multi-select → mark burned / assign to generator, un-burn with a way back, report a problem → optional EMS fault task, the meter card with its EMS link, the generators list with an editable serial, Excel with one sheet per kibbutz, and the background EMS refresh every 12 h. | `24-meter-burns.js` feature inventory |
| G-R4 | No `prompt()` / `confirm()` / native `<select>` anywhere in the new pages. Problem notes and generator assignment use Sheets. Un-burn uses the 5 s undo toast instead of a confirm. | DS §2 "one confirm pattern", tools §2.2 #7 |
| G-R5 | Burn audience is unchanged: writers אביאם / ניתאי / עידן / עמיחי; the viewer reads; מתניה / אליה never see it; generators are managed by עידן / עמיחי only; when `BURNS_PROJECT_ACTIVE` is false, nobody sees it. | `24-meter-burns.js:168-187,519`, `burns.ts:18-40` |
| G-R6 | The push log is React, for עידן only. It lists one row per recipient, newest first, max 200, with tiles (סה״כ / נשלחו / נכשלו / מנוי מת), the error text readable on the phone (not in a hover tooltip), and every push mode named in Hebrew, not only pending/approved. Empty: "עוד לא נשלחו התראות." | `23-push-log.js`; DS §2 EmptyState |
| G-R7 | The settings sheet is rebuilt on the design system: no native `<select>`, no number steppers, every control a SegmentedControl / Switch / ListRow → sub-sheet. | DS review §1.9; `no-overlap-allow.json` "settings-sheet" |
| G-R8 | The font picker goes. Assistant is locked. | DS review §4 "Unnecessary" |
| G-R9 | The gear sheet holds identity, role, install and "רעיון / באג" (they leave the header — S removes them there, G adds them here). | DS §2 AppHeader |
| G-R10 | **אביאם only** gets a setting in ⚙️: "לראות גם את המשימות של ניתאי". G stores it and exposes it. Package C consumes it in the calendar blocks. | round-5 grill round 2 |
| G-R11 | The ⋯ "יומן היום" row carries the tag "ניסיוני". G adds the data. S renders tags in MoreSheet. | round-5 row G (`main.tsx:397`, the row is at L395-408) |
| G-R12 | Both legacy files, their `index.html` markup, their CSS and their tests are deleted by the end of the package. `no-overlap-allow.json` loses "burns" and "settings-sheet". The impeccable count never rises, and the G files end at 0. | round-5 end rule |

**Not in G:** the home strip "פרויקט צריבות מונים · בוצעו X מתוך Y · לפירוט ›" and removing burns from the cards (package K, `components/home/Burns.tsx`); burns in meeting mode (package M); the Feedback box itself (package R); the header (package S).

**Open questions for עידן (defaults used until he answers):**
1. The push-log page and the 🔔 bell are both called "התראות". Default: the page is renamed **"יומן התראות"**.
2. The "Settings 9" item of your phone list isn't in the repo. This spec implements what the round-5 spec and the design review say about settings (G-R7…G-R10). If item 9 had more, it's missing here.
3. The burns kind icons: the legacy strings carry 🔁 / ⚡. Default: lucide `Repeat` / `Zap` in the Tag, and the words alone in Excel (today's Excel already strips the emoji).

## 2. File ownership

**G owns (creates or rewrites):**
- `app/src/lib/burns.ts` (extend), `app/src/lib/burns.test.ts`, `app/src/lib/burnsParity.test.ts` (temporary, deleted in G-U4)
- `app/src/lib/burnsData.ts` + `app/src/lib/burnsData.test.ts` (new: queries, writes, EMS refresh)
- `app/src/lib/pushLog.ts` + `app/src/lib/pushLog.test.ts` (new)
- `app/src/lib/settings.ts`, `app/src/lib/settings.test.ts`
- `app/src/islands/Settings.tsx`
- `app/src/islands/BurnsPage.tsx` + `BurnsPage.test.tsx` (new), `app/src/islands/burns/*.tsx` (new sheets: `MeterSheet`, `IssueSheet`, `AssignSheet`, `GeneratorsSheet`)
- `app/src/islands/PushLog.tsx` + `PushLog.test.tsx` (new)
- `db/user_settings_partner_tasks.sql` (new migration)
- `qa/playwright/tests/burns.spec.ts`, `qa/playwright/tests/settings.spec.ts`, `qa/playwright/tests/pushlog.spec.ts` (new)
- Deletes: `js/src/24-meter-burns.js`, `js/src/23-push-log.js`, `test-meter-burns.mjs`

**Shared files: G's edits are limited to exactly these regions (rebase onto whoever merged first, never rewrite their lines):**

| File | G may touch | Owner of the rest |
|---|---|---|
| `app/src/main.tsx` | the Settings mount block (L293-297), a new burns-page and push-log mount block modelled on Hours (L236-251), the `field-journal` row (L395-408: add `tag`) | every package keeps its own mount block |
| `app/src/lib/registry.ts` | add the optional `tag?: string` field to `MoreItem` | S renders it in `MoreSheet.tsx` |
| `app/src/lib/ems/adapters/rest.ts`, `ems/gateway.ts`, `ems/types.ts` | **append** `listMetersByRole(roleCodes)`, `searchMeters(q, take)`, `listSolars()` + their `URLS` entries | shared EMS gateway; M only reads existing methods |
| `app/src/components/home/Burns.tsx` | replace its local `fetchBurns` / `fetchGenerators` / `useBurns` / `useBurnGenerators` / `markBurned` / `markUnburned` / `markIssue` / `assignGenerator` / `ensureGenerator` / `emitBurnsChanged` definitions with re-exports from `lib/burnsData.ts` (a pure move, no render change) | K (card + home strip) |
| `js/src/00-bridge.js` | the `case 'burns'` line of `canShowPage` (L234) | shared legacy bridge |
| `js/src/00-consts.js` | add `window.BURNS_PROJECT_ACTIVE = true;` | shared |
| `js/src/02-init-attendance.js` | the `burns` / `pushlog` gate lines (L76-77) and render calls (L100-101) | shared |
| `index.html` | the inner markup of `#pushlog-view` (L583-586) and `#burns-view` (L593-596), plus delete `#burnCardModal` / `#burnAssignModal` (L597-602) | S (header), I (inventory), others |
| `css/app.css` | delete only `burn-*`, `.burns-*`, `pushlog-*` rules | DS tokens, other packages' rules |
| `test-can-show-page.mjs`, `test-integration.mjs` | the burns/pushlog rows only (`test-integration.mjs:256`) | shared |
| `qa/playwright/no-overlap-allow.json` | remove the `burns` and `settings-sheet` keys | each package removes its own keys |
| `docs/ops-graph/retiring_nodes.json` | nothing; the graph session untags after the delete | graph session |

**G never touches:** `components/ui/*` (DS). If a part lacks a prop G needs, G asks the designer for it (DS protocol §4.5) and waits. The one known ask is `PageActionRow` `titleLines={2}`, needed for G-R1.

## 3. Graph blast radius (from `ops_graph.py file …` and `graphify-out/RETIREMENT_MAP.md`)

**`24-meter-burns.js` (51 nodes, degree 71).** Inbound code edges from outside the file, all handled by G-L4 / G-U4:
- `sigma.canShowPage` → `burnCanSee()` (`00-bridge.js:234`) → moves inline (G-L4).
- `showPage()` → `burnCanSee()` / `renderBurns()` (`02-init-attendance.js:77,101`) → G-L4 / G-U4.
- `test-can-show-page.mjs:37,47-50` loads the file and tests `burnsActive` / `burnUser` / `burnIsViewer` / `burnCanSee` → rewritten in G-L4 against `00-bridge.js`.
- `test-meter-burns.mjs` → replaced by the vitest goldens + parity (G-L1), deleted in G-U4.
- `test-integration.mjs:256` lists `24-meter-burns.js` as a `burns-changed` listener → changes to `app/src/islands/BurnsPage.tsx` in G-U4.
- The `BURNS_PROJECT_ACTIVE` flag is **defined** in this file (L168). `burns.ts:18` reads `globalThis.BURNS_PROJECT_ACTIVE !== false`, so deleting the file without moving the flag would silently remove the kill switch. → G-L4 moves it.
- Tables `meter_burns` and `generators` **stay** (RETIREMENT_MAP finding #4).
- Weak links: `21-excel-export.js` `xlDownload` stays and is the Excel writer (`window.xlDownload`, as Hours uses at `Hours.tsx:160`).

**`23-push-log.js` (6 nodes).** Inbound: `showPage()` → `renderPushLog()` (`02-init-attendance.js:100`), `#pushlog-view` markup (`index.html:583`). The `push_log` table stays and is also read by `lib/field.ts:783` and `lib/alerts.ts:269,364` (unchanged).

**Settings.** `ops_graph.py file Settings.tsx` and `table user_settings` before G-L5. The known readers of the font field are `settings.ts` (`fontStack`, `fontHref`, `ensureFontLink`, `applySettings` L146-149), `settings.test.ts:7-8` and `qa/playwright/tests/settings.spec.ts:26-48,96`. The `user_settings.font` column stays (no drop, no reader).

**Docs to update after the delete (G-U4):** `docs/INDEX.md`, `docs/modules.md`, `docs/click-map.md`, `docs/integration-map.md`, `docs/integration-map.annotations.md` (burns L256, push log), `docs/CHANGELOG.md` (entry only).

## 4. Global constraints (every task)

- Work in a worktree off `origin/main`: `git worktree add -b r9/pkg-G ../SigmatecOps-r9-G origin/main`. Before each push, follow the parallel-safe loop in `CLAUDE.md` (fetch, rebase, re-run `node build.mjs`, read `VERSION` on `origin/main` first, ff-only).
- Edit `js/src/*.js`, then `node build.mjs`. Never edit `js/app.js`.
- Run `python docs/ops-graph/ops_graph.py file <name>` / `table <name>` before touching a file or table. Run `python docs/ops-graph/rebuild.py` after the package.
- Copy: noun-form buttons (שמירה, סגירה, ביטול, ייצוא), no "!", no em dash, no emoji in UI strings (lucide icons), ״ and ׳ (never `"` / `'`), Hebrew `aria-label`s. Gate: `node test-copy-rules.mjs`.
- Only tokens (`--s-*`); `absolute` only for a badge / grab handle / focus ring; logical properties; motion only from the `--s-motion-*` tokens.
- New pages are lazy chunks. The boot chunk `ui/sigma.js` stays ≤ 303 kB (it has 150 bytes of headroom).
- Dates via `d.m`, numbers in `<bdi>` with `tabular-nums`.
- Mock mode (`?sb=0`) must render every new screen from fixtures.
- Never run a write against live Supabase or EMS from a test.
- U tasks merge only with the designer's PASS (tools-and-motion §4) and a green `test-impeccable.mjs`.

## 5. Review focus (failure modes no single task's happy path covers)

1. **A burns row with `site` null or `generator_id` pointing at a deleted generator.** Expected: the row lands under "ללא קיבוץ" / "ללא גנרטור", never crashes the grouping. → pinned in G-L1 step 1 (`groupBurnsByGenerator` with a dangling id).
2. **The EMS refresh on a slow phone.** 25 pages × 200 meters. Expected: it runs in the background, never blocks the page, and respects the 12 h throttle key `burn_ems_synced_v1` across the legacy→React switch (same key, so no burst of refreshes on release day). → G-L2 step 1.
3. **Undo after un-burn races a refetch.** Expected: the undo writes the saved patch back (burned_by / burned_at restored exactly), not "burned now by me". → G-L2 step 1 (`unburnWithUndo` returns the exact restore patch).
4. **A push_log row whose `event` is a mode G never saw** (a new mode added later). Expected: the raw event name shows in the neutral Tag, never an empty cell. → G-L3 step 1.
5. **A person who isn't אביאם with `show_partner_tasks: true` in their row** (edited by hand, or a shared device). Expected: `partnerTasksOwner()` returns null for anyone but אביאם. → G-L5 step 1.

---

## 6. Tasks

Layer key: **L** = logic/data, starts now. **U** = screens, starts after the designer's PASS + DS and S on `origin/main`.

### Task G-L1: Port the burns pure logic to `burns.ts`, pinned by parity with the legacy block

**Files:**
- Modify: `app/src/lib/burns.ts` (append)
- Create: `app/src/lib/burnsParity.test.ts` (deleted in G-U4)
- Modify: `app/src/lib/burns.test.ts` (append goldens)

**Interfaces:**
- Consumes: `BurnRow`, `GeneratorRow`, `isCT`, `burnStateLabel`, `burnKindLabel` (already in `burns.ts`)
- Produces:
  - `burnStripMarks(v: unknown): string` — the legacy `B.xs`
  - `burnMatches(r: BurnRow, q: string, gens?: GeneratorRow[]): boolean`
  - `filterBurnRows(rows: BurnRow[], f: BurnFilter, gens?: GeneratorRow[]): BurnRow[]` with `BurnFilter = { site?: string; status?: 'all'|'pending'|'burned'|'issue'; kind?: 'all'|'CT'|'PP'; q?: string }`
  - `sortBurnRows(rows: BurnRow[]): BurnRow[]`
  - `groupBurnsBySite(rows: BurnRow[]): BurnSiteGroup[]` with `BurnSiteGroup = { site: string; rows: BurnRow[]; total: number; pending: number; burned: number; issue: number; ct: number; pp: number }`
  - `groupBurnsByGenerator(rows: BurnRow[], gens: GeneratorRow[]): Array<{ gen: GeneratorRow | null; rows: BurnRow[] }>`
  - `burnXlsxSpec(rows: BurnRow[], gens: GeneratorRow[]): XlsxSpec` (the `xlDownload` shape, same as `lib/hours.ts:134`)
  - `burnGenSummary(gens: GeneratorRow[], rows: BurnRow[]): Array<{ id: string; site: string; name: string; device_serial: string; count: number }>`
  - `emsMeterType(m: any): 'E360PP'|'E360SP'|'E360CT'|null`, `emsSolarNames(solars: any[]): Record<string, string>`, `emsToBurnRows(meters: any[], solars: any[]): { rows: Partial<BurnRow>[]; skipped: number }`, `emsHitLines(items: any[]): Array<{ serial: string; label: string }>`

- [ ] **Step 1: Write the failing parity test.** It runs the legacy block (the same vm trick `test-meter-burns.mjs:8-11` uses) and the new TS on the same fixture.

```ts
// app/src/lib/burnsParity.test.ts — TEMPORARY: proves the TS port equals 24-meter-burns.js
// before the legacy file is deleted (G-U4 deletes this test together with the file).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import * as T from './burns';

const src = fs.readFileSync(path.resolve(__dirname, '../../../js/src/24-meter-burns.js'), 'utf8');
const B: any = vm.runInNewContext('var B = {};' + src.match(/\/\/ PURE-START([\s\S]*?)\/\/ PURE-END/)![1] + '; B', {});

const rows: any[] = [
  { meter_id: 'a', serial: '68369287', site: 'אור הנר', meter_type: 'E360CT', address: 'רפת 7 מונה ייצור', ct_ratio: 50, solar_names: 'סולארי רפת 7', status: 'pending', generator_id: null },
  { meter_id: 'b', serial: '59965612', site: 'אור הנר', meter_type: 'E360PP', address: 'סולארי דיר', ct_ratio: 1, solar_names: null, status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z', generator_id: 'g1' },
  { meter_id: 'c', serial: '11111111', site: 'מעוז חיים', meter_type: 'E360CT', address: 'לול 4', ct_ratio: 40, solar_names: 'סולארי לולים', status: 'burned', generator_id: null },
  { meter_id: 'd', serial: '22222222', site: 'מעוז חיים', meter_type: 'E360SP', address: 'בית 12', ct_ratio: 1, solar_names: null, status: 'issue', note: 'אין גישה', generator_id: null },
  { meter_id: 'e', serial: '33333333', site: 'מעוז חיים', meter_type: 'E360PP', address: 'מוסך‏', ct_ratio: 1, solar_names: 'סולארי מוסך', status: 'pending', generator_id: 'gone' },
];
const gens: any[] = [{ id: 'g1', site: 'אור הנר', name: 'גנרטור רפת', device_serial: '999' }];

describe('burns TS port = legacy 24-meter-burns.js', () => {
  it.each(['', '287', 'רפת', 'גנרטור רפת', 'מעוז  חיים'])('matches(%s)', q => {
    for (const r of rows) expect(T.burnMatches(r, q, gens)).toBe(B.matches(r, q, gens));
  });
  it('filter / sort / group', () => {
    for (const f of [{}, { site: 'אור הנר' }, { status: 'pending' }, { kind: 'CT' }, { kind: 'PP', q: 'מוסך' }] as any[])
      expect(T.filterBurnRows(rows, f, gens)).toEqual(B.filterRows(rows, f, gens));
    expect(T.sortBurnRows(rows)).toEqual(B.sortRows(rows));
    expect(T.groupBurnsBySite(rows)).toEqual(B.groupBySite(rows));
    expect(T.burnGenSummary(gens, rows)).toEqual(B.genSummary(gens, rows));
  });
  it('xlsx spec, cell for cell', () => {
    expect(JSON.parse(JSON.stringify(T.burnXlsxSpec(rows, gens)))).toEqual(JSON.parse(JSON.stringify(B.xlsxSpec(rows, gens))));
  });
  it('EMS mapping', () => {
    const meters = [{ id: 'm1', serialNumber: 123, site: { id: 's1', name: ' גבים ' }, type: { key: 'landis_e360ct' }, currentMultiplier: 40, role: { code: 21 }, parent: { serialNumber: 9 } },
                    { id: 'm2', serialNumber: 5, site: { name: 'גבים' }, type: { name: 'Other' } }];
    const solars = [{ name: 'סולארי ב', solarMeters: [{ meter: { id: 'm1' } }] }, { name: 'סולארי א', solarMeters: [{ meter: { id: 'm1' } }] }];
    expect(T.emsToBurnRows(meters, solars)).toEqual(B.emsToBurnRows(meters, solars));
    expect(T.emsHitLines(meters)).toEqual(B.emsHitLines(meters));
  });
});
```

Append this golden to `burns.test.ts` (it outlives the parity test):

```ts
it('a dangling generator id groups under "no generator", last', () => {
  const g = groupBurnsByGenerator([{ meter_id: 'x', serial: '1', site: 'גבים', meter_type: 'E360PP', status: 'pending', generator_id: 'gone' } as any], []);
  expect(g).toEqual([{ gen: null, rows: [expect.objectContaining({ meter_id: 'x' })] }]);
});
it('a row with no site lands in "ללא קיבוץ" in Excel', () => {
  const x = burnXlsxSpec([{ meter_id: 'y', serial: '2', site: null, meter_type: 'E360PP', status: 'pending' } as any], []);
  expect(x.sheets.map(s => s.sheet)).toEqual(['ללא קיבוץ']);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run: `cd app && node node_modules/vitest/vitest.mjs run src/lib/burnsParity.test.ts src/lib/burns.test.ts`. Expected: FAIL, `burnMatches is not a function`.

- [ ] **Step 3: Implement.** Append to `burns.ts` a line-for-line TS translation of `24-meter-burns.js:15-155`, renamed as in *Produces*. Two differences are deliberate and pinned: `groupBurnsBySite` keys a null site as `''` and `burnXlsxSpec` titles it "ללא קיבוץ" (the legacy already does the second); the kind text in Excel is `burnKindLabel(r)` with the leading icon removed, as the legacy `.replace(/^[^\s]+\s/, '')` does. Core of the port:

```ts
export function burnStripMarks(v: unknown): string {
  return String(v == null ? '' : v).replace(/[‎‏‪-‮]/g, '').replace(/\r?\n/g, ' ').trim();
}
const norm = (s: unknown) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
export function burnMatches(r: BurnRow, q: string, gens: GeneratorRow[] = []): boolean {
  const nq = norm(q); if (!nq) return true;
  const gen = gens.find(g => g.id === r.generator_id);
  return norm([r.site, r.serial, r.address, r.solar_names, gen && gen.name].join(' ')).includes(nq);
}
export function filterBurnRows(rows: BurnRow[], f: BurnFilter = {}, gens: GeneratorRow[] = []): BurnRow[] {
  return rows.filter(r => {
    if (f.site && r.site !== f.site) return false;
    if (f.status && f.status !== 'all' && r.status !== f.status) return false;
    if (f.kind === 'CT' && !isCT(r)) return false;
    if (f.kind === 'PP' && isCT(r)) return false;
    return burnMatches(r, f.q || '', gens);
  });
}
const STATE_ORDER: Record<string, number> = { pending: 0, issue: 1, burned: 2 };
export function sortBurnRows(rows: BurnRow[]): BurnRow[] {
  return rows.slice().sort((a, b) =>
    ((STATE_ORDER[a.status] || 0) - (STATE_ORDER[b.status] || 0))
    || ((isCT(a) ? 0 : 1) - (isCT(b) ? 0 : 1))
    || String(a.serial).localeCompare(String(b.serial)));
}
export function groupBurnsBySite(rows: BurnRow[]): BurnSiteGroup[] {
  const by: Record<string, BurnSiteGroup> = {};
  for (const r of rows) {
    const k = r.site ?? '';
    const g = by[k] ??= { site: k, rows: [], total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 };
    g.rows.push(r); g.total++;
    if (r.status in STATE_ORDER) (g as any)[r.status]++;
    if (isCT(r)) g.ct++; else g.pp++;
  }
  return Object.values(by).map(g => ({ ...g, rows: sortBurnRows(g.rows) }))
    .sort((a, b) => (b.pending - a.pending) || a.site.localeCompare(b.site, 'he'));
}
```

`groupBurnsByGenerator`, `burnXlsxSpec`, `burnGenSummary`, `emsMeterType`, `emsSolarNames`, `emsToBurnRows`, `emsHitLines` translate `24-meter-burns.js:52-63` and `96-154` the same way: same keys, same sort comparators (`localeCompare(…, 'he')`), same column array (9 columns, headers verbatim, `נצרב ע"י` stays as the legacy header so the Excel is byte-identical for עמיחי's existing sheets).

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS, and `npm test` green.
- [ ] **Step 5: Commit.** `git add app/src/lib/burns.ts app/src/lib/burns.test.ts app/src/lib/burnsParity.test.ts && git commit -m "feat(burns): port the pure burns logic to burns.ts, pinned by parity with 24-meter-burns.js"`

**Acceptance:** the parity suite passes on the unchanged legacy file; the two new goldens pass; no UI change.

### Task G-L2: Burns data layer (`burnsData.ts`): queries, writes, undo, EMS refresh

**Files:**
- Create: `app/src/lib/burnsData.ts`, `app/src/lib/burnsData.test.ts`
- Modify: `app/src/lib/ems/adapters/rest.ts`, `app/src/lib/ems/gateway.ts`, `app/src/lib/ems/types.ts` (append only), `app/src/lib/ems/rest.test.ts` (URL goldens)
- Modify: `app/src/components/home/Burns.tsx` (replace local definitions with re-exports, no render change)

**Interfaces:**
- Consumes: G-L1's `emsToBurnRows`, `emsHitLines`; `burnedPatch`, `unburnedPatch`, `issuePatch`, `clearIssuePatch`, `generatorPatch` (existing in `burns.ts`); `supabase` from `lib/supabase.ts`; `emsGateway()`.
- Produces:
  - `BURNS_QUERY_KEY`, `GENERATORS_QUERY_KEY`, `fetchBurns()`, `fetchGenerators()`, `useBurns(enabled?)`, `useBurnGenerators(enabled?)`, `emitBurnsChanged(detail?)` (moved verbatim from `components/home/Burns.tsx:35-80`)
  - `markBurned(ids, user)`, `markIssue(id, note, emsTaskId?)`, `assignGenerator(ids, genId|null)`, `ensureGenerator(site, name, gens, user)` (moved)
  - `unburnWithUndo(rows: BurnRow[]): Promise<{ undo: () => Promise<void> }>` (new: the restore patch is each row's own `status` / `burned_by` / `burned_at`)
  - `saveGeneratorSerial(id: string, serial: string): Promise<void>` (new; PATCH `generators.device_serial`)
  - `refreshBurnsFromEms(opts: { now?: number; force?: boolean }): Promise<{ ran: boolean; upserted: number; skipped: number }>` (new; key `burn_ems_synced_v1`, 12 h, pages of 200, max 25)
  - `searchEmsMeters(q: string): Promise<Array<{ serial: string; label: string }>>`
  - Gateway additions: `listMetersByRole(roleCodes: number[], page: number, take: number)`, `searchMeters(q: string, take: number)`, `listSolars()`; `URLS.metersByRole`, `URLS.meterSearch`, `URLS.solars`

- [ ] **Step 1: Write the failing tests** (supabase and the gateway mocked with `vi.mock`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const upsert = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ in: vi.fn(async () => ({ error: null })), eq: vi.fn(async () => ({ error: null })) }));
vi.mock('./supabase', () => ({ supabase: { from: () => ({ upsert, update }) } }));
const listMetersByRole = vi.fn(); const listSolars = vi.fn(async () => []);
vi.mock('./ems/gateway', () => ({ emsGateway: () => ({ listMetersByRole, listSolars, connected: () => true }) }));
import { refreshBurnsFromEms, unburnWithUndo } from './burnsData';

beforeEach(() => { localStorage.clear(); upsert.mockClear(); listMetersByRole.mockReset(); });

describe('refreshBurnsFromEms', () => {
  it('pages until a short page, upserts on meter_id, stamps the 12 h key', async () => {
    listMetersByRole.mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => ({ id: 'm' + i, serialNumber: i + 1, site: { name: 'גבים' }, type: { key: 'landis_e360pp' } })))
                    .mockResolvedValueOnce([{ id: 'x', serialNumber: 7, site: { name: 'גבים' }, type: { key: 'landis_e360ct' } }]);
    const r = await refreshBurnsFromEms({ now: 1_000 });
    expect(listMetersByRole).toHaveBeenCalledTimes(2);
    expect(listMetersByRole).toHaveBeenCalledWith([20, 21, 22, 23, 24], 0, 200);
    expect(r).toEqual({ ran: true, upserted: 201, skipped: 0 });
    expect(localStorage.getItem('burn_ems_synced_v1')).toBe('1000');
  });
  it('skips inside 12 h, runs again after', async () => {
    localStorage.setItem('burn_ems_synced_v1', String(1_000));
    expect((await refreshBurnsFromEms({ now: 1_000 + 11 * 3600e3 })).ran).toBe(false);
    listMetersByRole.mockResolvedValueOnce([]);
    expect((await refreshBurnsFromEms({ now: 1_000 + 13 * 3600e3 })).ran).toBe(true);
  });
  it('stops at 25 pages', async () => {
    listMetersByRole.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i })));
    await refreshBurnsFromEms({ force: true, now: 5 });
    expect(listMetersByRole).toHaveBeenCalledTimes(25);
  });
});

describe('unburnWithUndo', () => {
  it('the undo restores who burned it and when, not "me, now"', async () => {
    const row: any = { meter_id: 'b', status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z' };
    const { undo } = await unburnWithUndo([row]);
    update.mockClear();
    await undo();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z' }));
  });
});
```

Add to `ems/rest.test.ts`:

```ts
expect(URLS.metersByRole([20, 21], 2, 200)).toBe('/meters?roleCodes=20,21&skip=400&take=200');
expect(URLS.meterSearch('68 36', 5)).toBe('/meters?search=68%2036&take=5');
expect(URLS.solars()).toBe('/solars');
```

Before writing the URL builder, read how `burnEmsAll` (`24-meter-burns.js:239-251`) pages today (skip/take or page) and copy that exact query string into the golden. The line above assumes `skip`; change it if the legacy uses something else.

- [ ] **Step 2: Run to verify failure.** `cd app && node node_modules/vitest/vitest.mjs run src/lib/burnsData.test.ts src/lib/ems/rest.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**

```ts
// app/src/lib/burnsData.ts
const SYNC_KEY = 'burn_ems_synced_v1';          // same key as the legacy page: no refresh burst on release day
const TWELVE_H = 12 * 3600e3, PAGE = 200, MAX_PAGES = 25, ROLES = [20, 21, 22, 23, 24];
export async function refreshBurnsFromEms({ now = Date.now(), force = false } = {}) {
  let last = 0; try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { /* private mode */ }
  if (!force && now - last < TWELVE_H) return { ran: false, upserted: 0, skipped: 0 };
  const gw = emsGateway();
  const meters: any[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await gw.listMetersByRole(ROLES, p, PAGE);
    meters.push(...page);
    if (page.length < PAGE) break;
  }
  const { rows, skipped } = emsToBurnRows(meters, await gw.listSolars());
  if (rows.length) {
    const { error } = await supabase.from('meter_burns').upsert(rows, { onConflict: 'meter_id' });
    if (error) throw error;
  }
  try { localStorage.setItem(SYNC_KEY, String(now)); } catch { /* ignore */ }
  emitBurnsChanged({ source: 'ems' });
  return { ran: true, upserted: rows.length, skipped };
}
export async function unburnWithUndo(rows: BurnRow[]) {
  const restore = rows.map(r => ({ id: r.meter_id, patch: { status: r.status, burned_by: r.burned_by ?? null, burned_at: r.burned_at ?? null } }));
  await supabase.from('meter_burns').update(unburnedPatch(new Date().toISOString())).in('meter_id', rows.map(r => r.meter_id));
  emitBurnsChanged();
  return { undo: async () => {
    for (const x of restore) await supabase.from('meter_burns').update({ ...x.patch, updated_at: new Date().toISOString() }).eq('meter_id', x.id);
    emitBurnsChanged();
  } };
}
```

Mock mode (`sigma.isMock?.()`): `refreshBurnsFromEms` returns `{ ran: false, … }` without calling the gateway, as the legacy does. It also never runs for a non-writer (`canWriteBurns`); the page decides that, and a unit test pins it via the page test in G-U2. The gateway methods go through `t.emsApi(URLS.…)` inside `adapters/rest.ts`, the only place `emsApi` may be called (`bridge.ts:86-88`). Then in `components/home/Burns.tsx`, delete the moved definitions and add `export { … } from '@/lib/burnsData';` so K's imports keep resolving.

- [ ] **Step 4: Run to verify pass.** Same command, then `npm test` (includes `test-integration.mjs`'s `sigma.emsApi(` contract).
- [ ] **Step 5: Commit.** `git commit -m "feat(burns): burnsData — queries/writes moved out of the card, EMS refresh via the gateway, exact undo"`

**Acceptance:** the EMS refresh never calls `sigma.emsApi` outside the adapter; the Burns card and strip render exactly as before (their existing `Burns.test.tsx` stays green without edits).

### Task G-L3: Push-log logic (`pushLog.ts`)

**Files:** Create `app/src/lib/pushLog.ts`, `app/src/lib/pushLog.test.ts`

**Interfaces:**
- Produces:
  - `PushLogRow = { sent_at: string; event: string; status: string; where_txt: string|null; qty: number|null; recipient: string; error: string|null; actor: string|null; title?: string|null }`
  - `PUSH_EVENT_LABEL: Record<string, string>`, `PUSH_STATUS: Record<string, { label: string; role: 'ok'|'danger'|'neutral' }>`
  - `pushLogCanSee(user: string, isIdan: boolean): boolean`
  - `pushLogTiles(rows): { total: number; sent: number; failed: number; expired: number }`
  - `pushLogLine(r): { when: string; what: string; where: string; who: string; status: { label: string; role: string }; error: string; actor: string }`
  - `fetchPushLog(limit = 200): Promise<PushLogRow[]>`, `PUSH_LOG_QUERY_KEY = ['pushLog']`

- [ ] **Step 1: Failing golden test.**

```ts
import { describe, it, expect } from 'vitest';
import { PUSH_EVENT_LABEL, pushLogTiles, pushLogLine, pushLogCanSee } from './pushLog';

const rows = [
  { sent_at: '2026-09-23T11:02:00Z', event: 'visitCron', status: 'sent', where_txt: 'גבים', qty: 1, recipient: 'אביאם', error: null, actor: null },
  { sent_at: '2026-09-23T10:00:00Z', event: 'pending', status: 'failed', where_txt: 'לקיבוץ חוקוק', qty: 3, recipient: 'עמיחי', error: '410 Gone', actor: 'אביאם' },
  { sent_at: '2026-09-22T06:00:00Z', event: 'someNewMode', status: 'expired', where_txt: null, qty: null, recipient: 'ניתאי', error: null, actor: null },
];
describe('push log', () => {
  it('names every mode push-send has today', () => {
    for (const m of ['pending', 'approved', 'attendanceCron', 'attendanceReminder', 'gapReminder', 'timerStale', 'visitCron',
                     'usageDigest', 'inventoryAlert', 'inventoryDigest', 'feedbackNew'])
      expect(PUSH_EVENT_LABEL[m], m).toBeTruthy();
  });
  it('tiles', () => expect(pushLogTiles(rows as any)).toEqual({ total: 3, sent: 1, failed: 1, expired: 1 }));
  it('a line', () => expect(pushLogLine(rows[1] as any)).toEqual({
    when: '23.9 13:00', what: 'הזמנה ממתינה', where: 'לקיבוץ חוקוק · 3', who: 'עמיחי',
    status: { label: 'נכשלה', role: 'danger' }, error: '410 Gone', actor: 'אביאם' }));
  it('an unknown mode shows its raw name, never empty', () => expect(pushLogLine(rows[2] as any).what).toBe('someNewMode'));
  it('עידן only', () => {
    expect(pushLogCanSee('עידן', true)).toBe(true);
    expect(pushLogCanSee('עמיחי', false)).toBe(false);
    expect(pushLogCanSee('', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL.** `cd app && node node_modules/vitest/vitest.mjs run src/lib/pushLog.test.ts`
- [ ] **Step 3: Implement.** Labels (humanizer-clean, no emoji): pending "הזמנה ממתינה", approved "הזמנה אושרה", attendanceCron "תזכורת נוכחות", attendanceReminder "בקשת נוכחות", gapReminder "פערים", timerStale "שעון פתוח", visitCron "סיכום ביקור", usageDigest "סיכום שימוש", inventoryAlert "מלאי נמוך", inventoryDigest "תנועות מלאי", feedbackNew "רעיון או באג". Status: sent "נשלחה" (ok), failed "נכשלה" (danger), expired "מנוי לא פעיל" (neutral). `when` uses `israelParts` from `lib/field.ts` + `dm`/`hm` (Israel time, not device time). `where` = `where_txt`, plus ` · <qty>` only when `qty > 1` (qty 3 → "לקיבוץ חוקוק · 3"; qty 1 or null → no suffix). `fetchPushLog` = `supabase.from('push_log').select('sent_at,event,status,where_txt,qty,recipient,error,actor,title').order('sent_at', { ascending: false }).limit(limit)` (authenticated client, not the anon REST the legacy used).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(pushlog): pure push-log model with every push-send mode named"`

**Acceptance:** goldens pass; X's alert matrix (package X) and this label map name the same modes (X's golden test reads `PUSH_EVENT_LABEL`'s keys; see X-L6).

### Task G-L4: Move the burns/push-log gates and the kill flag off the retiring files

**Files:**
- Modify: `js/src/00-consts.js` (add the flag), `js/src/00-bridge.js:234` (`case 'burns'`), `js/src/02-init-attendance.js:76-77`
- Modify: `test-can-show-page.mjs` (burns rows), `test-meter-burns.mjs:149-171` (the "lists identical" check now reads `00-bridge.js`)
- Build: `node build.mjs`

**Interfaces:**
- Produces: `canShowPage('burns')` computed in `00-bridge.js` from `BURN_WRITERS` / `BURN_HIDDEN` literals identical to `burns.ts`; `window.BURNS_PROJECT_ACTIVE` defined in `00-consts.js`; `showPage` uses `window.sigma.canShowPage('burns' | 'pushlog')` only.

- [ ] **Step 1: Failing test.** In `test-can-show-page.mjs`, drop `const burns = src('24-meter-burns.js')`, the `burnAudience` block and the five burns lines from `program` (L37-38, L48-50), and remove `burnCanSee` from the `call` map. The existing identity × page matrix for `burns` must then pass against `00-bridge.js` alone. The file's harness is `gateFor(user, role, { burnsActive })` (L54); `burnsActive: false` must now set `window.BURNS_PROJECT_ACTIVE = false` in the `program` preamble instead of the removed line. Add:

```js
assert.equal(gateFor('עידן', 'idan', { burnsActive: false })('burns'), false, 'flag off → nobody, now read from 00-consts');
assert.ok(!/src\('24-meter-burns\.js'\)/.test(fs.readFileSync(path.join(root, 'test-can-show-page.mjs'), 'utf8')), 'no longer loads the retiring file');
```

The expected burns column (already in the matrix; keep it unchanged): עידן / עמיחי / אביאם / ניתאי ✓, מתניה / אליה / אבצן ✗, viewer ✓.

- [ ] **Step 2: Run, verify FAIL.** `node test-can-show-page.mjs`
- [ ] **Step 3: Implement.** `00-consts.js`: `window.BURNS_PROJECT_ACTIVE = true; // 🔥 צריבות kill switch (moved from 24-meter-burns.js, round 5 G)`. `00-bridge.js`:

```js
case 'burns': {
  if (window.BURNS_PROJECT_ACTIVE === false) return false;
  if (call('isViewer', [], false)) return true;
  var _b = call('getCurrentUser', [], '');
  if (['מתניה', 'אליה'].indexOf(_b) !== -1) return false;            // BURN_HIDDEN (burns.ts)
  return ['אביאם', 'ניתאי', 'עידן', 'עמיחי'].indexOf(_b) !== -1;     // BURN_WRITERS (burns.ts)
}
```

`02-init-attendance.js` L76-77 become `if ((page === 'pushlog' || page === 'burns') && !(window.sigma && window.sigma.canShowPage && window.sigma.canShowPage(page))) page = 'kibbutz';`. In `test-meter-burns.mjs:149-171`, point the identical-lists check at the two literal arrays in `00-bridge.js`. Then `node build.mjs`.
- [ ] **Step 4: Run** `node test-can-show-page.mjs && node test-meter-burns.mjs && npm test`. Expected: PASS; the legacy burns page still opens (it keeps its own `burnCanSee` until G-U4).
- [ ] **Step 5: Commit** `js/src/00-consts.js js/src/00-bridge.js js/src/02-init-attendance.js js/app.js test-can-show-page.mjs test-meter-burns.mjs` + the build's version-stamped files: `git commit -m "refactor(burns): gates + kill flag leave the retiring page files"`

**Acceptance:** `grep -n "burnCanSee\|isIdan()" js/src/02-init-attendance.js` finds no burns/pushlog gate; the role matrix passes.

### Task G-L5: Settings logic: font removed, אביאם's partner-tasks setting, landing choices

**Files:**
- Modify: `app/src/lib/settings.ts`, `app/src/lib/settings.test.ts`, `qa/playwright/tests/settings.spec.ts:26-48,96` (drop the font cases)
- Create: `db/user_settings_partner_tasks.sql`
- Modify: `app/src/islands/Settings.tsx` (only to delete the font `Choice`, L353-360, so the build stays green; the rewrite is G-U1)

**Interfaces:**
- Produces:
  - `UserSettings.show_partner_tasks: boolean` (default `false`)
  - `canSetPartnerTasks(user: string): boolean` (אביאם only)
  - `partnerTasksOwner(user: string, s: UserSettings): string | null` → `'ניתאי'` or null. **Package C reads this** to decide whose tasks the calendar blocks also show.
  - `landingChoices(user: string, isViewer: boolean, canShow: (p: string) => boolean): Array<{ value: string; label: string }>` (extracted from `Settings.tsx:326-342`)
  - Removed: `FONTS`, `fontStack`, `fontHref`, `ensureFontLink`, the `font` field in `mergeSettings` / `applySettings`

- [ ] **Step 1: Failing tests.**

```ts
import { canSetPartnerTasks, partnerTasksOwner, landingChoices, mergeSettings, DEFAULT_SETTINGS } from './settings';
import * as S from './settings';

it('font machinery is gone, Assistant is locked', () => {
  expect((S as any).FONTS).toBeUndefined();
  expect((S as any).ensureFontLink).toBeUndefined();
  expect('font' in mergeSettings({ font: 'Rubik' } as any)).toBe(false);
});
it('partner tasks: אביאם only, and only when switched on', () => {
  expect(canSetPartnerTasks('אביאם')).toBe(true);
  for (const p of ['ניתאי', 'עידן', 'עמיחי', '']) expect(canSetPartnerTasks(p)).toBe(false);
  expect(partnerTasksOwner('אביאם', { ...DEFAULT_SETTINGS, show_partner_tasks: true })).toBe('ניתאי');
  expect(partnerTasksOwner('אביאם', DEFAULT_SETTINGS)).toBe(null);
  expect(partnerTasksOwner('עידן', { ...DEFAULT_SETTINGS, show_partner_tasks: true })).toBe(null);
});
it('landing choices follow the page gates; reports is the viewer\'s alone', () => {
  const all = () => true;
  expect(landingChoices('עידן', false, all).map(c => c.value)).toEqual(['auto', 'kibbutz', 'calendar', 'attendance', 'inventory', 'dev']);
  expect(landingChoices('', true, all).map(c => c.value)).toContain('reports');
  expect(landingChoices('מתניה', false, p => p !== 'inventory').map(c => c.value)).not.toContain('inventory');
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** Delete the font code paths (`settings.ts` L52, 59-62, 79, 146-149, 158-186); `applySettings` no longer sets `--font` (the DS tokens set Assistant). Add `show_partner_tasks` to `UserSettings`, the default, `mergeSettings` (boolean-coerced), the upsert payload (L257-267) and the read (L233). Migration:

```sql
-- db/user_settings_partner_tasks.sql — round 5 G: אביאם's "לראות גם את המשימות של ניתאי".
alter table public.user_settings add column if not exists show_partner_tasks boolean not null default false;
comment on column public.user_settings.show_partner_tasks is 'Honoured for אביאם only (lib/settings.ts partnerTasksOwner). Read by the calendar blocks (package C).';
```

The column is additive and defaulted, so it can be applied before the code ships. Apply it with עידן's go, like every migration (it inherits `user_settings`' RLS; `ops_graph.py table user_settings` shows the policies first).
- [ ] **Step 4: Run** vitest + `npx playwright test settings.spec.ts --config qa/playwright/playwright.config.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): lock Assistant, add אביאם's partner-tasks setting, extract landing choices"`

**Acceptance:** no `fonts.googleapis.com` link is added at runtime (Playwright: `page.locator('link[href*="fonts.googleapis"]')` count unchanged from the static `index.html`); C can import `partnerTasksOwner`.

### Task G-L6: The "ניסיוני" tag on the ⋯ "יומן היום" row (data only)

**Files:** Modify `app/src/lib/registry.ts` (`MoreItem.tag?: string`), `app/src/main.tsx:395-408` (`tag: 'ניסיוני'`), `app/src/lib/registry.test.ts`

- [ ] **Step 1: Failing test** in `registry.test.ts`: `registerMoreItem({ id: 't', label: 'x', icon: 'Notebook', onSelect() {}, tag: 'ניסיוני' }); expect(listMoreItems('field' as any).find(i => i.id === 't')!.tag).toBe('ניסיוני');`
- [ ] **Step 2: Run, verify FAIL** (TypeScript: `tag` not in `MoreItem`).
- [ ] **Step 3: Implement** the optional field and add `tag: 'ניסיוני'` to the `field-journal` row.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(more): MoreItem.tag; יומן היום is tagged ניסיוני"`

**Acceptance:** S's MoreSheet renders `tag` as a neutral `Tag` (S's spec). Until S lands, the field is simply unused.

### Task G-U1: Settings sheet on the design system

**Gate:** the designer's PASS on `settings__360__{light,dark}.png` / `settings__412__…`, DS + S on `origin/main`.

**Files:** Modify `app/src/islands/Settings.tsx`; Modify `qa/playwright/tests/settings.spec.ts`; Modify `qa/playwright/no-overlap-allow.json` (remove `settings-sheet`)

**Interfaces:** Consumes G-L5 (`landingChoices`, `canSetPartnerTasks`, `show_partner_tasks`), DS `Sheet`, `SectionBlock`, `ListRow`, `SegmentedControl`, `Switch` (`components/ui/switch.tsx`), `BubbleButton`; the Feedback opener `window.dispatchEvent(new CustomEvent('sigma-open-feedback'))` (`Feedback.tsx:205` listens for it; R owns that file).

Layout, top to bottom, one `SectionBlock` each:
1. **זהות**: name (16/600), role, device count (from `PersonalArea`, L172-201), "מה נשאר לי לסגור ›" as a ListRow.
2. **תצוגה**: מצב תצוגה = SegmentedControl בהיר / כהה / לפי המכשיר; תיאור משימות בכרטיס = SegmentedControl קצר / מלא.
3. **מסך פתיחה**: one ListRow with the current choice as meta → a pushed sub-sheet with a radio ListRow list from `landingChoices` (replaces the native `<select>`, L326-342).
4. **תזכורת סוף יום** (field team only): SegmentedControl 17:00 / 18:00 / 19:00 / 20:00.
5. **המשימות שלי** (אביאם only): Switch row "לראות גם את המשימות של ניתאי".
6. **התראות**: `NotificationsRow` (enable / test) as ListRows with a trailing BubbleButton.
7. **אפליקציה**: install row (`InstallRow`), "רעיון או באג" row → the Feedback opener.
8. **ניהול** (עידן only): the onboarding template row (`OnboardingTemplateRow`).

- [ ] **Step 1: Failing Playwright cases** in `settings.spec.ts`: no `select` element inside the settings dialog (`await expect(page.locator('[role=dialog] select')).toHaveCount(0)`); the partner-tasks switch is visible for אביאם and absent for ניתאי / עידן (mock users via the existing `?login=0&as=` helper); the landing sub-sheet persists a choice across reload; the "רעיון או באג" row opens the feedback sheet.
- [ ] **Step 2: Run, verify FAIL.** `npx playwright test settings.spec.ts --config qa/playwright/playwright.config.ts`
- [ ] **Step 3: Implement** the layout above. No component outside `components/ui`. Remove `settings-sheet` from `no-overlap-allow.json`.
- [ ] **Step 4: Run** settings.spec + `no-overlap.spec.ts` (all phone widths, both themes) + `node test-copy-rules.mjs` + `node test-impeccable.mjs`. Expected: all green, impeccable count for `Settings.tsx` = 0.
- [ ] **Step 5: Commit** and send the sign-off bundle (PNGs 360/412 × light/dark: default, landing sub-sheet open, אביאם's view, the longest name).

**Acceptance:** designer PASS; overlap sweep green without the allow-list key.

### Task G-U2: The burns page in React

**Gate:** designer PASS on the burns mocks (default, filtered, site open, selection bar, each sheet, empty, loading, error, viewer read-only), DS + S on `origin/main`, the DS `PageActionRow` supports a 2-line title.

**Files:**
- Create: `app/src/islands/BurnsPage.tsx`, `app/src/islands/BurnsPage.test.tsx`, `app/src/islands/burns/MeterSheet.tsx`, `IssueSheet.tsx`, `AssignSheet.tsx`, `GeneratorsSheet.tsx`
- Modify: `index.html` `#burns-view` inner (L593-596) → `<div id="sigma-burns-page"></div>`; delete `#burnCardModal` / `#burnAssignModal` (L597-602)
- Modify: `app/src/main.tsx` (a burns-view observer block, same shape as Hours L236-251, loading `@/islands/BurnsPage` → `mountBurnsPage()`)
- Modify: `app/src/islands/Burns.tsx` (`openBurnsTable` keeps calling `sigma.showPage('burns')`; nothing else)
- Modify: `qa/playwright/tests/burns.spec.ts`, `qa/playwright/no-overlap-allow.json` (remove `burns`)

**Interfaces:** Consumes G-L1 (filters, groups, xlsx), G-L2 (hooks, writes, `unburnWithUndo`, `refreshBurnsFromEms`, `searchEmsMeters`, `saveGeneratorSerial`, `ensureGenerator`), `canSeeBurns` / `canWriteBurns` / `BURN_WRITERS` from `burns.ts`, `window.xlDownload`, `sigma.createTask`.

Screen (phone first, 360–430):
- `PageActionRow` title = the full sentence, `titleLines={2}`, back chevron (2nd-level page). The action row holds **two** bubbles, Excel (`FileSpreadsheet`, shown when `sigma.canExportExcel?.()` is true) and גנרטורים (`Cpu`, עידן / עמיחי only), in one row per G-R2.
- 4 `StatTile`s (2 per row under 480 px): סה״כ, נותרו, נצרבו, בעיות. Tapping נותרו / נצרבו / בעיות sets the status filter (`aria-pressed`), a second tap clears it.
- Search field (16 px, `width:100%`), then `FilterChip`s for kind (הכול / משנה זרם / תלת-פאזי) and a "קיבוץ" chip that opens a site-picker sheet. The filter is saved in `burn_filter_v1`, the same key as today.
- One collapsible `SectionBlock` per site: title = site, count Tag "נותרו X/Y", a ProgressBar (plain CSS, dataviz spec), then generator sub-headers (caption) and ListRows: leading kind icon (`Repeat` for CT, `Zap` otherwise), title = serial in `<bdi>`, meta = address · system · state Tag (`burnStateLabel`), trailing = a 32 check bubble (burn / un-burn) for writers. The whole row opens `MeterSheet`.
- Multi-select: long-press (300 ms) or the leading checkbox in "בחירה" mode; a sticky footer (registers `--sheet-footer-h`) with "סימון כנצרב" and "שיבוץ לגנרטור" + the count.
- Sheets: `MeterSheet` (details, warnings from `burnWarnings`, EMS link, "דיווח על בעיה"), `IssueSheet` (textarea, "גם משימה ב-EMS" switch → `sigma.createTask(burnIssueTask(...))`, saves `ems_task_id`; a "הבעיה נפתרה" action when the row is an issue), `AssignSheet` (one site only; generator ListRows + "גנרטור חדש" name field + serial with EMS search via `searchEmsMeters`), `GeneratorsSheet` (`burnGenSummary` rows, serial field saved on blur).
- Un-burn: immediate, then toast "הסימון בוטל" with "ביטול" for 5 s calling `undo()`.
- States: skeleton after 300 ms (min 400 ms), EmptyState "אין מונים שתואמים לסינון." + "ניקוי סינון", inline error "לא הצלחנו לטעון את הצריבות." + "ניסיון נוסף". The viewer sees no write controls at all.
- On mount, a writer triggers `refreshBurnsFromEms()` in the background (never awaited by the render).

- [ ] **Step 1: Failing tests.** `BurnsPage.test.tsx` (hooks mocked): renders the 2-line title; a viewer sees no check bubbles and no גנרטורים; מתניה gets nothing (the island renders null); tapping the נותרו tile filters to pending and a second tap clears; the un-burn toast has a "ביטול" action that calls `undo`; a writer mount calls `refreshBurnsFromEms` once and a viewer mount never does. `burns.spec.ts`: open from ⋯ → the page, search "287" + Enter opens the meter sheet, the Excel download has one sheet per kibbutz (parse the xlsx back, as the existing spec does), no `prompt`/`confirm` dialogs fire (`page.on('dialog', d => { throw new Error(d.message()) })`).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** as above. `index.html`: replace `#burnsContent` with `#sigma-burns-page` and remove the legacy page-head (PageActionRow is the head). Leave `24-meter-burns.js` in place: with `#burnsContent` gone its `renderBurns` returns early. Check that it does (it looks up `#burnsContent`; if it throws, guard in G-U4, not here). Remove `burns` from `no-overlap-allow.json`.
- [ ] **Step 4: Run** BurnsPage tests, burns.spec (4 projects + mobile-360), no-overlap, copy rules, impeccable, boot size (`ls -l ui/sigma.js` ≤ 303 kB). Expected: all green.
- [ ] **Step 5: Commit** and send the sign-off bundle + the 360 video of burn → undo and select → assign, normal and reduced motion.

**Acceptance:** every G-R3 feature is reachable on a 360 phone; designer PASS.

### Task G-U3: The push log in React

**Gate:** designer PASS on `pushlog__360/412 × light/dark` (list, empty, error, a failed row open).

**Files:** Create `app/src/islands/PushLog.tsx`, `PushLog.test.tsx`, `qa/playwright/tests/pushlog.spec.ts`; Modify `index.html` `#pushlog-view` inner (L583-586) → `<div id="sigma-pushlog"></div>`; Modify `app/src/main.tsx` (observer block for `pushlog-view`)

Screen: `PageActionRow` "יומן התראות" (open question 1) + back; 4 StatTiles from `pushLogTiles` (the "נכשלו" tile filters to failures); a list of ListRows: title = `what` + `where`, meta = recipient · `when` · status Tag, and for failed rows a second meta line with the error text (2-line clamp); the row opens a small sheet with the full error, actor and title. A "רענון" icon bubble refetches (replaces the legacy retry). EmptyState "עוד לא נשלחו התראות.".

- [ ] **Step 1: Failing tests.** Unit: non-עידן renders null; the error text is in the DOM for a failed row (not only in a `title` attribute); unknown modes show the raw name. Playwright: עידן opens it from ⋯, 200-row cap respected with the mock fixture of 250 rows.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** tests + no-overlap + copy + impeccable.
- [ ] **Step 5: Commit** + sign-off bundle.

**Acceptance:** designer PASS; the error of a failed push is readable at 360 without a hover.

### Task G-U4: Delete the legacy files and close the graph

**Gate:** G-U2 and G-U3 merged with PASS.

**Files:**
- Delete: `js/src/24-meter-burns.js`, `js/src/23-push-log.js`, `test-meter-burns.mjs`, `app/src/lib/burnsParity.test.ts`
- Modify: `js/src/02-init-attendance.js:100-101` (remove the two render calls), `css/app.css` (delete `burn-*`, `.burns-*`, `pushlog-*` rules; grep them first), `test-integration.mjs:256` (`'burns-changed'` listener → `app/src/islands/BurnsPage.tsx`), `scripts/test-all.mjs` (nothing to change: the runner globs)
- Docs: `docs/INDEX.md`, `docs/modules.md`, `docs/click-map.md`, `docs/integration-map.md`, `docs/integration-map.annotations.md`
- Build: `node build.mjs`; then `python docs/ops-graph/rebuild.py`

- [ ] **Step 1: Failing contract test.** Add to `test-integration.mjs`:

```js
for (const f of ['js/src/24-meter-burns.js', 'js/src/23-push-log.js'])
  assert.ok(!fs.existsSync(f), f + ' is retired (round 5 G)');
for (const sym of ['renderBurns', 'renderPushLog', 'burnCanSee', '_burnLogic', 'burnCardModal', 'burnAssignModal', 'pushLogContent'])
  assert.ok(!/\b/.test('') && !grepRepo(sym, ['js/src', 'index.html', 'app/src']), sym + ' has no reader left');
```

(`grepRepo(sym, dirs)` is a 6-line helper in the same file: read every file under the dirs, return true on the first `includes(sym)`.)
- [ ] **Step 2: Run, verify FAIL.** `node test-integration.mjs`
- [ ] **Step 3: Delete and edit** as listed. `ops_graph.py file 24-meter-burns.js` / `23-push-log.js` must now report "not found" after `rebuild.py`.
- [ ] **Step 4: Run** `npm test`, the full Playwright suite (4 projects + mobile-360), no-overlap, impeccable (count ≤ baseline; G's files at 0). Loop until green.
- [ ] **Step 5: Commit** `git commit -m "chore(round5-G): retire 24-meter-burns.js and 23-push-log.js"`, then CHANGELOG + backlog + INDEX 🚦 per the memory contract, flip this spec's STATUS, and tell the graph session to untag the `24-meter-burns.js` / `23-push-log.js` entries in `retiring_nodes.json`.

**Acceptance:** zero references to the retired symbols; the graph has no `24-meter-burns.js` / `23-push-log.js` nodes; `no-overlap-allow.json` has no `burns` / `settings-sheet` keys.

---

## 7. Task count and order

| Layer | Tasks | Order |
|---|---|---|
| L (now) | G-L1, G-L2, G-L3, G-L4, G-L5, G-L6 | L1 → L2; L3, L4, L5, L6 independent (parallel-safe: disjoint files except `main.tsx` L6 vs nothing else in L) |
| U (after PASS) | G-U1, G-U2, G-U3, G-U4 | U1, U2, U3 in any order; U4 last |
| **Total** | **10** (6 L + 4 U) | |

## 8. Risks

1. **The kill switch disappears with the file.** `BURNS_PROJECT_ACTIVE` lives in the file being deleted. G-L4 moves it first and tests "flag off → nobody".
2. **`components/home/Burns.tsx` belongs to K.** G only moves definitions out (re-exports keep every import working). Whoever merges second rebases; the move is mechanical.
3. **The 2-line title needs a DS prop.** Asked of the designer; G-U2 is blocked until `PageActionRow` supports it.
4. **EMS paging shape.** The new `URLS.metersByRole` must match what the legacy sends today (G-L2 step 1 tells the implementer to copy it). A wrong param silently returns page 1 twenty-five times, and the upsert would still "succeed".
5. **Settings is also S's gear.** S owns the header bubble and the open event (`sigma-open-settings`); G owns the sheet body. If S renames the event, G follows.
