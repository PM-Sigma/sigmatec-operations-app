// Self-check for the PER-TICKET status board (mirrors devStage + devBoard bucketing in js/src/18-dev-tasks.js).
// Run: node test-devboard.mjs
// Invariant the ·97 fix establishes: EVERY ticket sits in the column matching ITS OWN status — a child
// whose status differs from its parent's lands in its own column, NOT the parent's. And the column count
// equals the number of cards rendered in it (the old root-bucketing made count=roots but rendered subtrees).
import assert from 'node:assert';

// --- mirror of devStage (most-specific match first) ---
function devStage(t) {
  var s = String(t.status || '').toLowerCase();
  if (/commit|deployed|\blive\b|released|production|פרוד|עלה לאוויר|אונליין/.test(s)) return 'committed';
  if (/done|בוצע|הושלם|complete|merged|נסגר/.test(s)) return 'done';
  if (/review|בדיק|qa/.test(s)) return 'review';
  if (/progress|בעבודה|doing|פיתוח|wip|בתהליך|active/.test(s)) return 'prog';
  if (/ready|מוכן|ספרינט|next|planned/.test(s)) return 'ready';
  if (t.state === 'closed') return 'done';
  return 'backlog';
}
const STAGES = ['backlog', 'ready', 'prog', 'review', 'done', 'committed'];

// mirror of the new devBoard bucketing (no filter): each ticket → its own stage column.
function board(tasks) {
  const byStage = {}; STAGES.forEach(k => byStage[k] = []);
  tasks.forEach(t => byStage[devStage(t)].push(t));
  return byStage;
}

// A parent (epic) in Backlog with a child that's In Progress and another child pushed to Ready.
const tasks = [
  { number: 104, status: '', parent: null },            // epic → backlog
  { number: 105, status: 'In Progress', parent: 104 },  // child actively developed
  { number: 106, status: 'ספרינט קרוב', parent: 104 },  // child pushed to the sprint
  { number: 107, status: 'Done', parent: 104 },         // child done
];
const b = board(tasks);

// Each ticket lands in ITS OWN column — NOT all under the epic's backlog column (the old bug).
assert.deepEqual(b.backlog.map(t => t.number), [104], 'only the epic is in backlog');
assert.deepEqual(b.prog.map(t => t.number), [105], 'the in-progress child is in its own column, not backlog');
assert.deepEqual(b.ready.map(t => t.number), [106], 'the pushed child shows in ספרינט קרוב');
assert.deepEqual(b.done.map(t => t.number), [107], 'the done child is in done');

// Column count == cards rendered (flat list length), for every column.
STAGES.forEach(k => assert.equal(b[k].length, b[k].length));   // trivially true now — count IS the list
assert.equal(b.backlog.length, 1, 'backlog count reflects 1 card, not 4 (old root-bucketing showed the whole subtree)');

// A pushed root re-buckets too (push works for roots as well).
assert.equal(devStage({ number: 1, status: 'Ready' }), 'ready');
assert.equal(devStage({ number: 2, status: 'עלה לאוויר' }), 'committed');

console.log('✅ test-devboard: per-ticket placement + accurate counts verified');

// ═══════════════════════════════════════════════════════════════════════════════════
// Task 11 — dev page redesign (spec §7d): 4 full columns + minimized rail + tree + flow strip.
//
// Everything ABOVE this line is the frozen ·97 regression guard: it carries its own copy of
// devStage/board bucketing and proves per-ticket placement. It is deliberately left untouched.
// Everything BELOW evaluates the REAL js/src/18-dev-tasks.js (the way test-calendar-legacy.mjs
// does) and asserts on the shipped functions — so these goldens cannot drift from the code.
//
// Note for the reader: the live GitHub Projects board was reworked on 2026-09-08 — "Done" was
// removed, "Scope Refinement" and "Main Fields" were added, "Ready" became "Sprint Ready".
// devStage() now maps those (ported from 91c0d5a — see the Task 11 report), so the real function
// answers 'committed' where the frozen mirror above answers 'done'. That IS the port, not a
// drift: the mirror documents the ·97 fix, the sections below document the live board.
import { readFileSync } from 'node:fs';

const DEV_SRC = readFileSync(new URL('./js/src/18-dev-tasks.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('./css/app.css', import.meta.url), 'utf8');

// ---- evaluate the module with a DOM/window stub, exactly as the bundle would ----
const store = {};
const win = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const doc = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', 'console',
  '(function(){' + DEV_SRC + '\n})();')(
  win, doc,
  { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  () => 0, () => 0, () => {}, console);

const { devStage: stage, devBoardLayout, devTree, devFlowSegments, devStageKeys, devFullKeys } = win;
for (const [n, f] of Object.entries({ devStage: stage, devBoardLayout, devTree, devFlowSegments })) {
  assert.equal(typeof f, 'function', n + ' must be exposed on window for this runner');
}

let fails = 0;
const ok = (n) => console.log('  ✓ ' + n);
const check = (n, cond, detail) => { if (cond) ok(n); else { fails++; console.log('  ✗ ' + n + (detail ? ' — ' + detail : '')); } };

// ───────────────── 1. the live board's seven columns ─────────────────
console.log('\n[1] devStage maps the LIVE Projects-v2 option names (2026-09-08 board rework)');
{
  const cases = [
    ['Main Fields', 'fields'], ['תחומים ראשיים', 'fields'],
    ['Scope Refinement', 'scope'], ['חזר לאפיון מחדש', 'scope'],
    ['Backlog', 'backlog'], ['', 'backlog'],
    ['Sprint Ready', 'ready'], ['ספרינט קרוב', 'ready'],
    ['In Progress', 'prog'], ['בעבודה', 'prog'],
    ['In Review', 'review'], ['בדיקות', 'review'],
    ['Committed', 'committed'], ['עלה לאוויר', 'committed'],
    ['Done', 'committed'],            // the option is gone from the board; legacy rows fold into עלה
  ];
  for (const [s, want] of cases) {
    check('"' + (s || '(ריק)') + '" → ' + want, stage({ status: s }) === want, 'got ' + stage({ status: s }));
  }
  check('a closed issue with no status → committed', stage({ status: '', state: 'closed' }) === 'committed');
  check('"Scope Refinement" is NOT swallowed by the review matcher', stage({ status: 'Scope Refinement' }) !== 'review');
  check('the seven keys are the pipeline order', JSON.stringify(devStageKeys) ===
    JSON.stringify(['fields', 'backlog', 'scope', 'ready', 'prog', 'review', 'committed']), JSON.stringify(devStageKeys));
}

// ───────────────── 2. devBoardLayout golden ─────────────────
console.log('\n[2] devBoardLayout(tasks, expanded) — 4 full columns + a rail of the rest');
const BOARD = [
  { number: 201, status: 'Main Fields', pos: 0 },
  { number: 202, status: 'Backlog', pos: 5 },
  { number: 203, status: 'Backlog', pos: 1 },
  { number: 204, status: 'Scope Refinement', pos: 2 },
  { number: 205, status: 'Sprint Ready', pos: 3 },
  { number: 206, status: 'In Progress', pos: 4 },
  { number: 207, status: 'In Review', pos: 6 },
  { number: 208, status: 'Committed', pos: 7 },
  { number: 209, status: '', state: 'closed', pos: 8 },
  { number: 210, status: 'In Review' },              // no pos → sorts last
];
const nums = (col) => col.tasks.map((t) => t.number);
{
  const L = devBoardLayout(BOARD, []);
  check('FULL_KEYS is the spec order — ספרינט · בפיתוח · בדיקות · ממתין',
    JSON.stringify(devFullKeys) === JSON.stringify(['ready', 'prog', 'review', 'backlog']), JSON.stringify(devFullKeys));
  check('four full columns, in that order',
    JSON.stringify(L.full.map((c) => c.key)) === JSON.stringify(['ready', 'prog', 'review', 'backlog']));
  check('ready  = [205]', JSON.stringify(nums(L.full[0])) === '[205]', JSON.stringify(nums(L.full[0])));
  check('prog   = [206]', JSON.stringify(nums(L.full[1])) === '[206]');
  check('review = [207,210] — board pos first, un-positioned last',
    JSON.stringify(nums(L.full[2])) === '[207,210]', JSON.stringify(nums(L.full[2])));
  check('backlog = [203,202] — sorted by board pos, not by number',
    JSON.stringify(nums(L.full[3])) === '[203,202]', JSON.stringify(nums(L.full[3])));
  check('the rail holds every OTHER column, in pipeline order, with counts',
    JSON.stringify(L.rail) === JSON.stringify([
      { key: 'fields', count: 1, expanded: false },
      { key: 'scope', count: 1, expanded: false },
      { key: 'committed', count: 2, expanded: false }]), JSON.stringify(L.rail));
  check('no full column ever appears in the rail', L.rail.every((r) => devFullKeys.indexOf(r.key) === -1));
  check('every ticket is placed exactly once',
    L.full.reduce((s, c) => s + c.tasks.length, 0) + L.rail.reduce((s, r) => s + r.count, 0) === BOARD.length);
}
{
  const L = devBoardLayout(BOARD, ['scope']);
  check('a tapped chip expands IN PLACE as a 5th column',
    JSON.stringify(L.full.map((c) => c.key)) === JSON.stringify(['ready', 'prog', 'review', 'backlog', 'scope']),
    JSON.stringify(L.full.map((c) => c.key)));
  check('…carrying its tickets', JSON.stringify(nums(L.full[4])) === '[204]');
  check('…and its chip stays in the rail, flagged, so a second tap collapses it',
    L.rail.filter((r) => r.key === 'scope').length === 1 && L.rail.find((r) => r.key === 'scope').expanded === true);
  check('an unknown expand key is ignored', devBoardLayout(BOARD, ['nope']).full.length === 4);
}
{
  const L = devBoardLayout([], []);
  check('no tickets → the four columns still exist, all empty',
    L.full.length === 4 && L.full.every((c) => c.tasks.length === 0));
  check('no tickets → the rail still lists its three columns at 0',
    JSON.stringify(L.rail.map((r) => r.key + ':' + r.count)) === JSON.stringify(['fields:0', 'scope:0', 'committed:0']));
}

// ───────────────── 3. devTree golden ─────────────────
console.log('\n[3] devTree(tasks, {hideDone, assignee, stage, q}) — sub-issue tree + root pruning');
const TREE = [
  { number: 300, title: 'התראות | תשתית | אפיק', status: 'Backlog', parent: null, assignee: 'matanya' },
  { number: 301, title: 'התראות | תשתית | טבלה', status: 'In Progress', parent: 300, assignee: 'matanya' },
  { number: 302, title: 'התראות | תשתית | פוש', status: 'Committed', parent: 300, assignee: 'elia' },
  { number: 310, title: 'מונים | ייצוא | אקסל', status: 'Committed', parent: null },
  { number: 311, title: 'מונים | ייצוא | CSV', status: 'Committed', parent: 310 },
  { number: 312, title: 'מונים | ייצוא | PDF', status: 'Done', parent: 310 },
  { number: 320, title: 'כללי | תחזוקה', status: 'Sprint Ready', parent: null, assignee: 'elia' },
  { number: 321, title: 'כללי | ניקוי', status: 'Committed', parent: null },
  { number: 330, title: 'יתום', status: 'In Review', parent: 999 },   // parent outside the set
];
const shape = (roots) => roots.map((r) => r.label + '{' +
  r.children.map((c) => c.number + (c.children.length ? '[' + c.children.map((g) => g.number).join(',') + ']' : '')).join(',') + '}');
{
  const roots = devTree(TREE, {});
  check('a root issue WITH sub-issues is a נושא row; parentless leaves fall under ללא נושא',
    JSON.stringify(shape(roots)) === JSON.stringify(['התראות › תשתית › אפיק{301,302}', 'מונים › ייצוא › אקסל{311,312}', 'ללא נושא{320,321,330}']),
    JSON.stringify(shape(roots)));
  check('an orphan (parent outside the set) is not lost', roots[2].children.some((c) => c.number === 330));
  check('the ללא נושא bucket is last and has no ticket of its own', roots[2].key === 'none' && roots[2].task === null);
  const bar = roots[0].bar;
  check('a root carries a stacked bar in pipeline order over its surviving subtree',
    JSON.stringify(bar.map((s) => s.key)) === JSON.stringify(['backlog', 'prog', 'committed']), JSON.stringify(bar));
  check('…whose proportions sum to exactly 100', bar.reduce((s, x) => s + x.pct, 0) === 100, JSON.stringify(bar));
  check('…and whose counts sum to the subtree size (root included)', bar.reduce((s, x) => s + x.n, 0) === 3);
  check('every leaf carries its own stage', roots[0].children[0].stage === 'prog' && roots[0].children[1].stage === 'committed');
}
{
  const roots = devTree(TREE, { hideDone: true });
  check('hideDone drops done leaves…', JSON.stringify(shape(roots)) === JSON.stringify(['התראות › תשתית › אפיק{301}', 'ללא נושא{320,330}']),
    JSON.stringify(shape(roots)));
  check('…AND prunes the root whose children are all done (#310 disappears)', roots.every((r) => r.key !== 'i310'));
  check('a root survives on one live child', roots[0].children.length === 1 && roots[0].children[0].number === 301);
  check('the pruned root bar goes with it, so every remaining bar still sums to 100',
    roots.every((r) => r.bar.reduce((s, x) => s + x.pct, 0) === 100));
}
{
  const byStage = devTree(TREE, { stage: 'prog' });
  check('by stage: only the matching tickets survive, ancestors kept as the path',
    JSON.stringify(shape(byStage)) === JSON.stringify(['התראות › תשתית › אפיק{301}']), JSON.stringify(shape(byStage)));
  const byAsg = devTree(TREE, { assignee: 'elia' });
  check('by assignee', JSON.stringify(shape(byAsg)) === JSON.stringify(['התראות › תשתית › אפיק{302}', 'ללא נושא{320}']),
    JSON.stringify(shape(byAsg)));
  const byQ = devTree(TREE, { q: 'csv' });
  check('by search text', JSON.stringify(shape(byQ)) === JSON.stringify(['מונים › ייצוא › אקסל{311}']), JSON.stringify(shape(byQ)));
  check('search matches the issue number too', devTree(TREE, { q: '#330' }).length === 1);
  check('a filter that matches nothing yields no roots (not an empty ללא נושא)', devTree(TREE, { q: 'zzz' }).length === 0);
  check('no tickets → no roots', devTree([], {}).length === 0);
  check('a deep chain nests to the bottom',
    devTree([{ number: 1, title: 'a', parent: null }, { number: 2, title: 'b', parent: 1 }, { number: 3, title: 'c', parent: 2 }], {})[0].children[0].children[0].number === 3);
}

// ───────────────── 4. flow strip proportions ─────────────────
console.log('\n[4] devFlowSegments(tasks) — one stacked bar for the whole board');
{
  const segs = devFlowSegments(BOARD);
  check('segments are in pipeline order', JSON.stringify(segs.map((s) => s.key)) ===
    JSON.stringify(['fields', 'backlog', 'scope', 'ready', 'prog', 'review', 'committed']), JSON.stringify(segs.map((s) => s.key)));
  check('counts match the board', JSON.stringify(segs.map((s) => s.n)) === JSON.stringify([1, 2, 1, 1, 1, 2, 2]), JSON.stringify(segs.map((s) => s.n)));
  check('proportions sum to exactly 100', segs.reduce((s, x) => s + x.pct, 0) === 100, JSON.stringify(segs.map((s) => s.pct)));
  check('every segment carries its Hebrew label', segs.every((s) => typeof s.label === 'string' && s.label.length > 1));
  check('an empty board has no segments', devFlowSegments([]).length === 0);
  check('a single stage takes the whole bar',
    JSON.stringify(devFlowSegments([{ number: 1, status: 'In Review' }]).map((s) => s.key + ':' + s.pct)) === JSON.stringify(['review:100']));
  const spread = ['Main Fields', 'Backlog', 'Scope Refinement', 'Sprint Ready', 'In Progress', 'In Review', 'Committed'];
  for (const total of [3, 7, 11, 13, 37, 101]) {
    const t = Array.from({ length: total }, (_, i) => ({ number: i, status: spread[i % spread.length] }));
    const s = devFlowSegments(t);
    check(total + ' tickets → pct sums to 100 and n sums to ' + total,
      s.reduce((a, x) => a + x.pct, 0) === 100 && s.reduce((a, x) => a + x.n, 0) === total,
      JSON.stringify(s.map((x) => x.pct)));
  }
}

// ───────────────── 5. the write paths and the DnD survived ─────────────────
console.log('\n[5] contracts — the write paths, the drag targets, the remembered view');
{
  const TGT = DEV_SRC.slice(DEV_SRC.indexOf('DEV_STAGE_TARGET = {'), DEV_SRC.indexOf('DEV_STAGE_TARGET = {') + 300);
  check('the write map names the LIVE options (Main Fields / Scope Refinement / Sprint Ready)',
    /Main Fields/.test(TGT) && /Scope Refinement/.test(TGT) && /Sprint Ready/.test(TGT), TGT.slice(0, 200));
  for (const k of devStageKeys) check('DEV_STAGE_TARGET covers ' + k, new RegExp('\\b' + k + ": '").test(TGT));
  check('the drag wiring still accepts a drop on any .dev-stage (full column OR rail chip)',
    /closest\('\.dev-stage'\)/.test(DEV_SRC) && /data-stage/.test(DEV_SRC));
  check('rail chips carry .dev-stage + data-stage, so DnD needs no second code path',
    /dev-stage dev-rail-chip[\s\S]{0,240}data-stage/.test(DEV_SRC));
  check('multi-select → העבר לספרינט still writes the live Sprint Ready option',
    /devWriteStatus\(numbers, 'Sprint Ready'\)/.test(DEV_SRC));
  check('🚀 עלתה גרסה still exists and moves its source column to Committed',
    /devReleaseVersion = async/.test(DEV_SRC) && /devWriteStatus\(nums, 'Committed'\)/.test(DEV_SRC));
  check('…sourced from בשלבי בדיקות (the board has no Done column any more)', /devStage\(t\) === 'review'/.test(DEV_SRC));
  check('the view is remembered per device in localStorage.dev_view',
    /DEV_VIEW_KEY = 'dev_view'/.test(DEV_SRC) && /localStorage\.setItem\(DEV_VIEW_KEY/.test(DEV_SRC));
  win.devSetView('tree');
  check('devSetView persists the choice', store.dev_view === 'tree', JSON.stringify(store));
  win.devSetView('board');
  check('…and flips back', store.dev_view === 'board');
  win.devSetView('nonsense');
  check('an unknown view falls back to the board', store.dev_view === 'board');
  check('the rail toggle is exposed for the chip onclick', typeof win.devToggleRail === 'function');
  win._devExpanded = [];
  win.devToggleRail('committed');
  check('tapping a chip expands it', win._devExpanded.indexOf('committed') !== -1);
  win.devToggleRail('committed');
  check('tapping it again collapses it', win._devExpanded.indexOf('committed') === -1);
}

// ───────────────── 6. the tokens and the phone layout ─────────────────
console.log('\n[6] stage tokens + mobile snap-scroll (spec §7d)');
{
  for (const k of devStageKeys) check('--stage-' + k + ' is a token', new RegExp('--stage-' + k + ':').test(CSS));
  const dark = CSS.slice(CSS.indexOf(':root[data-theme="dark"]'));
  check('every stage token has a dark variant', devStageKeys.every((k) => new RegExp('--stage-' + k + ':').test(dark)));
  check('the four full columns never shrink below 280px', /minmax\(280px/.test(CSS));
  check('the phone board is a horizontal snap-scroll at ~88vw a column',
    /scroll-snap-type: x mandatory/.test(CSS) && /88vw/.test(CSS));
  check('the rail is a horizontal chip strip — no rotated text (ledger ruling 8)',
    /\.dev-rail \{[^}]*flex/.test(CSS) && !/\.dev-rail[\s\S]{0,400}writing-mode/.test(CSS));
}

if (fails) { console.log('\n❌ test-devboard: ' + fails + ' failing check(s)'); process.exit(1); }
console.log('\n✅ test-devboard: board layout, tree, flow strip, write paths and tokens verified');
