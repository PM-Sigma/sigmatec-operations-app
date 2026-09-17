// Self-check for the data-driven kibbutz cards (js/src/24-kibbutzim.js + db/kibbutzim.sql).
// Covers: buildCardHtml goldens · groupBySection ordering · renderKibbutzCards DOM contract ·
// the seed-SQL contract (unique names, valid sections, row count).
// Run: node test-kibbutzim.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/24-kibbutzim.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ───────────────────────── DOM stub ─────────────────────────
function mkEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], dataset: {}, style: {}, _html: '', _text: '',
    className: '',
    set innerHTML(v) { this._html = v; this.children = parseCards(v); },
    get innerHTML() { return this._html; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.dataset[k.replace(/^data-/, '')] = v; },
    querySelectorAll(sel) { return this.children.filter(c => matches(c, sel)); },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
  };
  return el;
}
// minimal parse of the html renderKibbutzCards writes: count cards + region labels
function parseCards(html) {
  const out = [];
  const re = /<div class="([^"]*)"([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cls = m[1], attrs = m[2];
    if (!/^kibbutz\b/.test(cls) && !/^region-label\b/.test(cls)) continue;
    const el = mkEl('div');
    el.className = cls;
    const ar = /data-([a-z-]+)="([^"]*)"/g; let a;
    while ((a = ar.exec(attrs)) !== null) el.dataset[a[1]] = a[2];
    out.push(el);
  }
  return out;
}
const matches = (el, sel) => String(sel).split(',').map(s => s.trim())
  .some(s => (el.className || '').split(/\s+/).includes(s.replace(/^\./, '')));

const els = {};
const getEl = id => (els[id] = els[id] || mkEl('div'));
const document_ = {
  getElementById: id => els[id] || null,
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: t => mkEl(t),
  addEventListener() {}
};
const storage = {};
const localStorage_ = { getItem: k => (k in storage ? storage[k] : null), setItem(k, v) { storage[k] = String(v); }, removeItem(k) { delete storage[k]; } };
const window_ = {};

function load() {
  const fn = new Function('window', 'document', 'localStorage', 'fetch', 'applyFilters',
    src + '\nreturn window;');
  return fn(window_, document_, localStorage_, () => Promise.reject(new Error('no network in tests')), () => {});
}
const W = load();

// ───────────────────────── buildCardHtml ─────────────────────────
console.log('buildCardHtml:');
check('gas card golden', () => {
  const html = W.buildCardHtml({ name: 'אור הנר גז', display_name: 'אור הנר — גז', section: 'active', energy: ['gas'], marketing: false });
  assert.equal(html,
    '<div class="kibbutz active" data-name="אור הנר גז" data-section="active" data-marketing="false">' +
    '<div class="kibbutz-name-row"><div class="kibbutz-name">אור הנר — גז</div>' +
    '<span class="energy-badge">🔥 גז</span></div></div>');
});
check('marketing row emits the 🤝 tag', () => {
  const html = W.buildCardHtml({ name: 'שלוחות', section: 'active', energy: ['electric'], marketing: true });
  assert.ok(html.includes('<span class="tag-marketing">🤝 בתהליך שיווקי</span>'), 'tag-marketing missing');
  assert.ok(html.includes('data-marketing="true"'), 'data-marketing not true');
  assert.ok(html.includes('>שלוחות<'), 'falls back to name when display_name is absent');
});
check('multi-energy label joins with " + "', () => {
  const html = W.buildCardHtml({ name: 'עין המפרץ', section: 'active', energy: ['electric', 'water'], marketing: false });
  assert.ok(html.includes('<span class="energy-badge">⚡ חשמל + 💧 מים</span>'), html);
});
check('new section → class + data-section', () => {
  const html = W.buildCardHtml({ name: 'דפנה', section: 'new', energy: ['electric'], marketing: false });
  assert.ok(html.startsWith('<div class="kibbutz new" data-name="דפנה" data-section="new"'), html);
});
check('a sub-site carries the ↳ tag and data-parent', () => {
  const html = W.buildCardHtml({ name: 'חוצות יגור', section: 'active', energy: ['electric'], kind: 'subsite', parent: 'יגור' });
  assert.ok(html.includes('data-parent="יגור"'), html);
  assert.ok(html.includes('<span class="energy-badge">⚡ חשמל</span><span class="tag-subsite">↳ תת-אתר של יגור</span>'), html);
});

// ───────────────────────── groupBySection ─────────────────────────
console.log('groupBySection:');
check('regions ordered by REGION_ORDER, rows alphabetical he-IL, "" last', () => {
  const g = W.groupBySection([
    { name: 'יגור', region: 'העמקים', section: 'active' },
    { name: 'אפיקים', region: 'גליל וגולן', section: 'active' },
    { name: 'גבת', region: 'העמקים', section: 'active' },
    { name: 'שלוחות', region: '', section: 'active' }
  ]);
  assert.deepEqual(g.active.map(x => x.region), ['גליל וגולן', 'העמקים', '']);
  assert.deepEqual(g.active[0].rows.map(r => r.name), ['אפיקים']);
  assert.deepEqual(g.active[1].rows.map(r => r.name), ['גבת', 'יגור']);
  assert.deepEqual(g.active[2].rows.map(r => r.name), ['שלוחות']);
  assert.deepEqual(g.new, []);
});
check('unknown regions sort after the known ones, alphabetically', () => {
  const g = W.groupBySection([
    { name: 'א', region: 'תימן', section: 'new' },
    { name: 'ב', region: 'אוגנדה', section: 'new' },
    { name: 'ג', region: 'העמקים', section: 'new' }
  ]);
  assert.deepEqual(g.new.map(x => x.region), ['העמקים', 'אוגנדה', 'תימן']);
});
check('a sub-site sorts directly after its parent', () => {
  const g = W.groupBySection([
    { name: 'תל קציר', region: 'העמקים', section: 'active' },
    { name: 'חוצות יגור', region: 'העמקים', section: 'active', kind: 'subsite', parent: 'יגור' },
    { name: 'אפיקים', region: 'העמקים', section: 'active' },
    { name: 'יגור', region: 'העמקים', section: 'active' }
  ]);
  assert.deepEqual(g.active[0].rows.map(r => r.name), ['אפיקים', 'יגור', 'חוצות יגור', 'תל קציר']);
});
check('display_name wins over name for sorting', () => {
  const g = W.groupBySection([
    { name: 'אור הנר גז', display_name: 'תמר', region: 'העמקים', section: 'active' },
    { name: 'תל קציר', display_name: 'אבן', region: 'העמקים', section: 'active' }
  ]);
  assert.deepEqual(g.active[0].rows.map(r => r.name), ['תל קציר', 'אור הנר גז']);
});

// ───────────────────────── renderKibbutzCards ─────────────────────────
console.log('renderKibbutzCards:');
check('fills both grids, region labels, counts, skips archived', () => {
  ['grid-new', 'grid-active', 'cnt-all', 'cnt-new', 'cnt-active', 'cnt-marketing'].forEach(getEl);
  W.renderKibbutzCards([
    { name: 'יגור', region: 'העמקים', section: 'active', energy: ['electric'], marketing: false },
    { name: 'אפיקים', region: 'גליל וגולן', section: 'active', energy: ['electric'], marketing: false },
    { name: 'דפנה', region: 'גליל וגולן', section: 'new', energy: ['electric'], marketing: true },
    { name: 'מגן', region: 'העמקים', section: 'active', energy: ['electric'], marketing: false, archived_at: '2026-09-01T00:00:00Z' }
  ]);
  const setup = els['grid-new'], active = els['grid-active'];
  assert.equal(setup.querySelectorAll('.kibbutz').length, 1, 'new cards');
  assert.equal(setup.querySelectorAll('.region-label').length, 0, 'single region → no region label');
  assert.equal(active.querySelectorAll('.kibbutz').length, 2, 'active cards');
  assert.equal(active.querySelectorAll('.region-label').length, 2, 'two regions → two labels');
  assert.ok(!active.innerHTML.includes('מגן'), 'archived row must not render');
  assert.equal(els['cnt-all'].textContent, '3');
  assert.equal(els['cnt-new'].textContent, '1');
  assert.equal(els['cnt-active'].textContent, '2');
  assert.equal(els['cnt-marketing'].textContent, '1');
});
check('KIBBUTZIM + kibbutzByName after a render', () => {
  assert.equal(W.KIBBUTZIM.length, 4, 'archived rows stay in the model, only the render skips them');
  assert.equal(W.kibbutzByName('יגור').region, 'העמקים');
  assert.equal(W.kibbutzByName('לא קיים'), undefined);
});
check('kibbutzByName also matches display_name', () => {
  W.renderKibbutzCards([{ name: 'אור הנר גז', display_name: 'אור הנר — גז', region: '', section: 'active', energy: ['gas'] }]);
  assert.equal(W.kibbutzByName('אור הנר — גז').name, 'אור הנר גז');
});
check('cached rows are written to localStorage for the offline first paint', () => {
  assert.ok(storage['kibbutzim_v1'], 'kibbutzim_v1 cache missing');
  assert.equal(JSON.parse(storage['kibbutzim_v1'])[0].name, 'אור הנר גז');
});

// ───────────────────────── seed SQL contract ─────────────────────────
console.log('seed SQL contract:');
const sql = fs.readFileSync(path.join(__dirname, 'db/kibbutzim.sql'), 'utf8');
const seedRows = [...sql.matchAll(/^\s*\('((?:[^']|'')*)',\s*(null|'(?:[^']|'')*'),\s*'(new|active)',\s*'(\{[^}]*\})',\s*(true|false),\s*'((?:[^']|'')*)'\)/gm)]
  .map(m => ({ name: m[1].replace(/''/g, "'"), section: m[3], energy: m[4], marketing: m[5] === 'true', region: m[6] }));

check('every seeded row has a valid section', () => {
  assert.ok(seedRows.length > 0, 'no rows parsed out of db/kibbutzim.sql');
  seedRows.forEach(r => assert.ok(r.section === 'new' || r.section === 'active', r.name + ' → ' + r.section));
});
check('no duplicate names (name is the join key everywhere)', () => {
  const seen = new Set(), dup = [];
  seedRows.forEach(r => { if (seen.has(r.name)) dup.push(r.name); seen.add(r.name); });
  assert.deepEqual(dup, []);
});
check('row count matches the legacy card list (54)', () => {
  assert.equal(seedRows.length, 54);
});
check('re-homing per spec §2: former pending/pending-priority land in active + marketing', () => {
  const by = n => seedRows.find(r => r.name === n);
  assert.equal(by('שלוחות').section, 'active'); assert.equal(by('שלוחות').marketing, true);
  assert.equal(by('כנרת').section, 'active'); assert.equal(by('כנרת').marketing, true);
  assert.equal(by('גבת').section, 'new'); assert.equal(by('גבת').marketing, false);
  assert.equal(by('דפנה').section, 'new');
  assert.equal(by('להב').section, 'active'); assert.equal(by('להב').marketing, false);
  assert.equal(by('אור הנר גז').energy, '{"gas"}');
  assert.equal(by('עין המפרץ').energy, '{"electric","water"}');
});
check('the table DDL is in the same file as the seed', () => {
  assert.ok(/create table if not exists kibbutzim/.test(sql));
  assert.ok(/check \(section in \('new','active'\)\)/.test(sql));
  assert.ok(/enable row level security/.test(sql));
});

// ───────────────────────── Part A removals ─────────────────────────
console.log('Part A removals:');
const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const data01 = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');
check('index.html has the two new grids and no legacy grid', () => {
  assert.ok(idx.includes('id="grid-new"') && idx.includes('id="grid-active"'));
  ['grid-priority', 'grid-new_client', 'grid-done', 'grid-pending'].forEach(g =>
    assert.ok(!idx.includes('id="' + g + '"'), g + ' still present'));
});
check('index.html labels are exactly as specified', () => {
  assert.ok(idx.includes('🆕 לקוחות חדשים'), 'new section label');
  assert.ok(!idx.includes('— בהקמה'), 'the old "— בהקמה" suffix must be gone');
  assert.ok(idx.includes('✅ לקוחות פעילים'), 'active section label');
});
check('compact toggle, progress block and urgent alert are gone', () => {
  ['compactToggle', 'progress-bar', 'progressLegend', 'urgentAlert', 'priority-section'].forEach(s =>
    assert.ok(!idx.includes(s), s + ' still in index.html'));
  assert.ok(!/function toggleCompactMode/.test(data01), 'toggleCompactMode still in 01-data.js');
  assert.ok(!/owners-row/.test(data01), 'owners-row injection still in 01-data.js');
  assert.ok(!/excel-status/.test(data01), '.excel-status injection still in 01-data.js');
});
check('removed modal fields are gone from markup and JS', () => {
  const act = fs.readFileSync(path.join(__dirname, 'js/src/10-activity.js'), 'utf8');
  ['editStatus', 'editTask', 'editOwner1', 'editOwner2', 'editCategory', 'editStep', 'editSetupNote']
    .forEach(f => {
      assert.ok(!idx.includes('id="' + f + '"'), f + ' still in index.html');
      assert.ok(!act.includes("'" + f + "'"), f + ' still read/written in 10-activity.js');
    });
});
check('applyFilters reads data-section / data-marketing', () => {
  assert.ok(/dataset\.section/.test(data01), 'applyFilters does not read data-section');
  assert.ok(/dataset\.marketing/.test(data01), 'applyFilters does not read data-marketing');
  assert.ok(!/dataset\.types/.test(data01), 'data-types still used in 01-data.js');
});

// ───────────────────────── CSS structural contract ─────────────────────────
// A bulk selector/rule removal once swallowed a comment terminator here: the unterminated
// /* ... */ ate the `@media (max-width: 768px) {` opener that follows it, so every phone-only
// rule (fixed bottom nav, 2-column grid, body padding) leaked to the desktop layout while the
// mobile modal/filter rules vanished. These three asserts are what would have caught it.
console.log('CSS structural contract:');
const css = fs.readFileSync(path.join(__dirname, 'css/app.css'), 'utf8');
check('every /* comment is terminated', () => {
  const open = (css.match(/\/\*/g) || []).length;
  const close = (css.match(/\*\//g) || []).length;
  assert.equal(open, close, `${open} "/*" vs ${close} "*/" — an unterminated comment swallows the rules after it`);
});
check('braces balance (and never close below zero)', () => {
  let depth = 0, min = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < min) min = depth; }
  }
  assert.equal(min, 0, 'a stray "}" closes a block that was never opened');
  assert.equal(depth, 0, 'unbalanced braces: ' + depth + ' block(s) left open');
});
check('the phone-only block still opens before the fixed bottom nav', () => {
  const m = /\.page-nav\s*\{\s*position:\s*fixed/.exec(css);
  assert.ok(m, '.page-nav { position: fixed } rule not found');
  const nav = m.index;
  const mq = css.lastIndexOf('@media (max-width: 768px)', nav);
  assert.notEqual(mq, -1, 'no "@media (max-width: 768px)" precedes the fixed bottom nav — it would apply at EVERY width');
  // nothing may close that media query between its opener and the rule it must guard
  let depth = 0;
  for (let i = css.indexOf('{', mq); i < nav; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    assert.ok(depth > 0, 'the media query closes before .page-nav — the rule leaked out of it');
  }
});

console.log(failures === 0 ? '\n✅ all kibbutzim checks passed' : '\n❌ ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
