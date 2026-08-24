// Contract test for the site-consolidation spec (docs/superpowers/specs/2026-08-24-site-consolidation-design.md):
// A) אור הנר unified card, B) sub-site cards, C) backend integrity (KIBBUTZ_SITE_MAP/KNOWN_UNLINKED),
// D) region on every card, E) procedure-field removal, F) done cards lose construction fields,
// G) nothing else regressed. Run: node test-site-consolidation.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC01 = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');
const SRC10 = fs.readFileSync(path.join(__dirname, 'js/src/10-activity.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'css/app.css'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}
function warn(name, msg) { console.log('  WARN - ' + name + ': ' + msg); }

// ---------- 0.2 extraction spans ----------
function liftFn(src, name) {   // brace-matched `function name(...) { ... }` slice
  const start = src.indexOf('function ' + name);
  assert.ok(start !== -1, 'could not find function ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces reading ' + name);
}

const MAP = new Function(
  SRC01.substring(SRC01.indexOf('const KIBBUTZ_SITE_MAP'), SRC01.indexOf('function kibbutzSiteIds'))
  + '\nreturn KIBBUTZ_SITE_MAP;'
)();

const CODES = new Function(
  SRC01.substring(SRC01.indexOf('const CUSTOMER_CODES'), SRC01.indexOf('function injectCustomerCodes'))
  + '\nreturn CUSTOMER_CODES;'
)();

const dBody = SRC01.substring(SRC01.indexOf('const SHEET_NAME_ALIASES'), SRC01.indexOf('function renderPotentials'));
function buildD(fakeDoc) {
  return new Function('window', 'document',
    dBody + '\nreturn {enrichCardsWithSheet,parseTaskField,serializeTaskField,SHEET_NAME_ALIASES,REGION_FALLBACK,KNOWN_UNLINKED};'
  )({}, fakeDoc);
}

const injectStepperslSrc = liftFn(SRC01, 'injectSteppers');
function buildInjectSteppers(fakeDoc) {
  return new Function('document', 'STEPS', 'TOTAL_STEPS', injectStepperslSrc + '\nreturn injectSteppers;')
    (fakeDoc, Array(14).fill('x'), 14);
}

const gateBody = SRC10.substring(
  SRC10.indexOf('// live card → construction fields'),
  SRC10.indexOf("document.getElementById('editCategory')")
);
const gateEditFields = new Function('document', 'card', gateBody);

const injectCustomerCodesSrc = liftFn(SRC01, 'injectCustomerCodes');

// ---------- 0.3 DOM double ----------
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function mkEl(tag) {
  const el = {
    tagName: tag, className: '', textContent: '', style: {}, dataset: {},
    children: [], parentNode: null,
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = el;
      const i = ref ? el.children.indexOf(ref) : -1;
      if (i === -1) el.children.push(c); else el.children.splice(i, 0, c);
      return c;
    },
    remove() {
      if (!el.parentNode) return;
      const i = el.parentNode.children.indexOf(el);
      if (i !== -1) el.parentNode.children.splice(i, 1);
      el.parentNode = null;
    },
    setAttribute(k, v) {
      el['_attr_' + k] = v;
      if (k.indexOf('data-') === 0) el.dataset[camel(k.slice(5))] = v;
    },
    getAttribute(k) { return el['_attr_' + k]; },
    get firstChild() { return el.children[0] || null; },
    querySelector(sel) { return matchSel(sel, el)[0] || null; },
    querySelectorAll(sel) { return arrLike(matchSel(sel, el)); }
  };
  // minimal innerHTML setter — parses a flat run of <div class="...">text</div> (all
  // injectSteppers ever assigns) into real child doubles, so .step lookups work.
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML || ''; },
    set(html) {
      el._innerHTML = html;
      el.children = [];
      const re = /<div class="([^"]*)"[^>]*>([^<]*)<\/div>/g;
      let m;
      while ((m = re.exec(html))) {
        const child = mkEl('div');
        child.className = m[1];
        child.textContent = m[2];
        child.parentNode = el;
        el.children.push(child);
      }
    }
  });
  return el;
}
function matchSel(sel, root) {
  const classes = sel.split(',').map(s => '.' + s.trim().split(/\s+/).pop().replace(/^\./, ''));
  const out = [];
  (function walk(node) {
    (node.children || []).forEach(c => {
      const cls = ' ' + (c.className || '') + ' ';
      if (classes.some(cl => cls.indexOf(' ' + cl.slice(1) + ' ') !== -1)) out.push(c);
      walk(c);
    });
  })(root);
  return out;
}
function arrLike(arr) { arr.forEach = Array.prototype.forEach.bind(arr); return arr; }

// ---------- 0.4 cards parsed out of index.html ----------
const GRID_ORDER = ['priority', 'new_client', 'done', 'pending'];
const GRID_MARKERS = GRID_ORDER.map(g => 'id="grid-' + g + '"');
const gridIdx = GRID_MARKERS.map(m => HTML.indexOf(m));
gridIdx.forEach((i, n) => assert.ok(i !== -1, 'marker not found: ' + GRID_MARKERS[n]));
const SEGMENTS = {
  priority:   HTML.slice(gridIdx[0], gridIdx[1]),
  new_client: HTML.slice(gridIdx[1], gridIdx[2]),
  done:       HTML.slice(gridIdx[2], gridIdx[3]),
  pending:    HTML.slice(gridIdx[3])
};

// two cards can sit on the same physical source line (no newline between them), so
// walk tag depth from each opening `<div class="kibbutz…" … data-name="…">` to its
// matching `</div>` instead of splitting on '\n'.
function sliceOuterDiv(text, start) {
  const tagRe = /<div\b[^>]*>|<\/div>/g;
  tagRe.lastIndex = start;
  let depth = 0, m;
  while ((m = tagRe.exec(text))) {
    if (m[0] === '</div>') { depth--; if (depth === 0) return text.slice(start, m.index + m[0].length); }
    else depth++;
  }
  throw new Error('unbalanced <div> from ' + start);
}
const CARDS = [];
GRID_ORDER.forEach(grid => {
  const seg = SEGMENTS[grid];
  const openRe = /<div class="kibbutz[^"]*"[^>]*data-name="([^"]+)"[^>]*>/g;
  let m;
  while ((m = openRe.exec(seg))) {
    const tag = m[0];
    const name = m[1];
    const types = (tag.match(/data-types="([^"]+)"/) || [])[1] || '';
    const subsiteOf = (tag.match(/data-subsite-of="([^"]+)"/) || [])[1];
    const step = (tag.match(/data-step="([^"]+)"/) || [])[1];
    const klass = (tag.match(/class="(kibbutz[^"]*)"/) || [])[1] || 'kibbutz';
    const cardHtml = sliceOuterDiv(seg, m.index);
    const card = mkEl('div');
    card.className = klass;
    card.dataset.name = name;
    card.dataset.types = types;
    if (subsiteOf) card.dataset.subsiteOf = subsiteOf;
    if (step) card.dataset.step = step;
    const nameEl = mkEl('div'); nameEl.className = 'kibbutz-name'; nameEl.textContent = name;
    const metaEl = mkEl('div'); metaEl.className = 'kibbutz-meta';
    card.appendChild(nameEl); card.appendChild(metaEl);
    card._grid = grid;
    card._line = cardHtml;
    CARDS.push(card);
    openRe.lastIndex = m.index + cardHtml.length;
  }
});

const GRIDS = {};
['grid-priority', 'grid-new_client', 'grid-done', 'grid-pending'].forEach(id => {
  const g = mkEl('div'); g.appendChild = function (c) { g.children.push(c); c.parentNode = g; return c; };
  GRIDS[id] = g;
});
const fakeDoc = {
  querySelectorAll: sel => sel === '.kibbutz' ? arrLike(CARDS.slice()) : arrLike([]),
  createElement: mkEl,
  getElementById: id => GRIDS[id] || null
};

// ---------- 0.5 golden Sheet fixture ----------
const SUBSITE_NAMES = ['גשר השלום', 'שדה אליהו - חקלאות', 'מכללת ספיר', 'שלוחות ספק חיצוני', 'שער הגולן מחוץ למחלק'];
const CUSTOM_ROW_NAMES = new Set([...SUBSITE_NAMES, 'אור הנר', 'שדה אליהו', 'דגניה ב', 'דפנה']);
function buildFixture() {
  const tasks = [];
  let seq = 200;
  CARDS.forEach(c => {
    const name = c.dataset.name;
    if (CUSTOM_ROW_NAMES.has(name)) return;
    let task = '';
    if (name === 'יגור') task = 'step=9 | note=בדיקת זרימה';
    if (name === 'כפר גלעדי') task = 'step=9 | note=נותרה: הדרכה';
    if (name === 'לביא') task = 'step=4 | note=ממתין לציוד';
    tasks.push({ name, row: seq++, region: 'העמקים', owners: ['עידן'], status: 'x', expectedTask: '', task, lastModified: '' });
  });
  tasks.push({ name: 'אור הנר חשמל', row: 12, region: 'דרום, עוטף עזה והנגב', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'אור הנר גז',   row: 13, region: 'דרום, עוטף עזה והנגב', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'שדה אליהו', row: 28, region: 'העמקים', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'שדה אליהו', row: 63, region: '', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'שדה אליהו', row: 64, region: '', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'דגניה ב', row: 61, region: '', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  tasks.push({ name: 'דפנה',   row: 62, region: '', owners: ['עידן'], status: 'x', expectedTask: '', task: '', lastModified: '' });
  return { tasks, calendar: {} };
}

// ======================================================================
// A. אור הנר — one unified card
// ======================================================================
const D = buildD(fakeDoc);

check('A1: exactly one אור הנר card', () => {
  const cs = CARDS.filter(c => c.dataset.name === 'אור הנר');
  assert.equal(cs.length, 1);
});
check('A2: אור הנר sits in grid-done, data-types="done"', () => {
  const c = CARDS.find(c => c.dataset.name === 'אור הנר');
  assert.equal(c._grid, 'done');
  assert.equal(c.dataset.types, 'done');
});
check('A3: energy badge shows both types on one card', () => {
  const c = CARDS.find(c => c.dataset.name === 'אור הנר');
  assert.ok(c._line.includes('⚡ חשמל + 🔥 גז'));
});
check('A4: no split card anywhere in the markup', () => {
  assert.equal(HTML.includes('אור הנר גז'), false);
  assert.equal(HTML.includes('אור הנר חשמל'), false);
});
check('A5: map has the unified key only', () => {
  assert.deepStrictEqual(MAP['אור הנר'], ['9d755469-c2f7-4abd-9a48-88d1b07c3146']);
  assert.equal('אור הנר גז' in MAP, false);
  assert.equal('אור הנר חשמל' in MAP, false);
});
check('A6: no אין קוד state for אור הנר', () => {
  assert.equal(CODES['אור הנר'], 915);
  const c = CARDS.find(c => c.dataset.name === 'אור הנר');
  assert.equal(Boolean(CODES[c.dataset.name]), true);
});
check('A7: alias table shape, row 12 first', () => {
  assert.deepStrictEqual(D.SHEET_NAME_ALIASES, { 'אור הנר חשמל': 'אור הנר', 'אור הנר גז': 'אור הנר' });
  assert.equal(Object.keys(D.SHEET_NAME_ALIASES)[0], 'אור הנר חשמל');
});
check('A8: alias fold on real data — row 12 wins, region carried', () => {
  const fix = buildFixture();
  D.enrichCardsWithSheet(fix);
  const c = CARDS.find(c => c.dataset.name === 'אור הנר');
  assert.equal(c.dataset.row, 12);
  assert.equal(c.dataset.region, 'דרום, עוטף עזה והנגב');
  const badges = c.querySelectorAll('.region-badge');
  assert.equal(badges.length, 1);
  assert.equal(badges[0].textContent, '📍 דרום, עוטף עזה והנגב');
});
check('A9: alias does not resurrect a second card', () => {
  const cs = CARDS.filter(c => c.dataset.name.indexOf('אור הנר') === 0);
  assert.equal(cs.length, 1);
});

// ======================================================================
// B. The five sub-site cards
// ======================================================================
const SUBSITE_EXPECT = {
  'גשר השלום':            { parent: 'מעוז חיים',             grid: 'done',    types: 'done',    uuid: 'b7229e14-ff17-4f69-bc94-6d248cdadd7e' },
  'שדה אליהו - חקלאות':      { parent: 'שדה אליהו',              grid: 'done',    types: 'done',    uuid: '14a28537-15a6-4860-8a57-410d9cbf738c' },
  'מכללת ספיר':            { parent: 'מתחם חינוך שער הנגב',    grid: 'done',    types: 'done',    uuid: 'de0b71a3-b0c2-48d8-94b5-67c02561640e' },
  'שלוחות ספק חיצוני':     { parent: 'שלוחות',                 grid: 'pending', types: 'pending', uuid: '60520f2f-a813-41e4-8fbf-783800ca86ad' },
  'שער הגולן מחוץ למחלק':  { parent: 'שער הגולן',              grid: 'pending', types: 'pending', uuid: '9cbdadcd-0c5f-40de-a804-c429bf9bcf3e' }
};
Object.keys(SUBSITE_EXPECT).forEach(name => {
  const exp = SUBSITE_EXPECT[name];
  check('B10: sub-site card "' + name + '" — one card, right parent/grid/types', () => {
    const cs = CARDS.filter(c => c.dataset.name === name);
    assert.equal(cs.length, 1);
    assert.equal(cs[0].dataset.subsiteOf, exp.parent);
    assert.equal(cs[0]._grid, exp.grid);
    assert.equal(cs[0].dataset.types, exp.types);
  });
  check('B11: sub-site "' + name + '" chip renders ↳ parent', () => {
    const c = CARDS.find(c => c.dataset.name === name);
    assert.ok(c._line.includes('class="subsite-chip"'));
    assert.ok(c._line.includes('↳ ' + exp.parent));
  });
  check('B12: sub-site "' + name + '" parent exists as its own card', () => {
    assert.ok(CARDS.some(c => c.dataset.name === exp.parent));
  });
  check('B13: sub-site "' + name + '" own UUID in the map', () => {
    assert.deepStrictEqual(MAP[name], [exp.uuid]);
  });
});
check('B14: parents dropped their second UUID', () => {
  assert.deepStrictEqual(MAP['מעוז חיים'], ['f5becfd4-5193-4b55-b7a1-4c067ba9e2b9']);
  assert.deepStrictEqual(MAP['שדה אליהו'], ['3f91ccf9-67ae-4420-bf30-b7ea57ad16b2']);
});
check('B15: no UUID appears under two different keys (global sweep)', () => {
  const flat = [];
  Object.keys(MAP).forEach(k => MAP[k].forEach(u => flat.push([k, u])));
  const seen = {};
  const dups = [];
  flat.forEach(([k, u]) => {
    (seen[u] = seen[u] || []).push(k);
  });
  Object.keys(seen).forEach(u => { if (seen[u].length > 1) dups.push([u, seen[u]]); });
  assert.deepStrictEqual(dups, []);
  assert.equal(flat.length, new Set(flat.map(x => x[1])).size);
  assert.equal(flat.length, 55);
});
check('B16: sub-sites exempt from אין קוד (injectCustomerCodes references subsiteOf)', () => {
  assert.ok(/subsiteOf|data-subsite-of/.test(injectCustomerCodesSrc));
});
check('B17: .subsite-chip has a CSS rule', () => {
  assert.equal(CSS.includes('.subsite-chip'), true);
});

// ======================================================================
// C. Backend integrity
// ======================================================================
const CARD_NAMES = CARDS.map(c => c.dataset.name);
check('C18: every card is accounted for (mapped or KNOWN_UNLINKED)', () => {
  const offenders = CARD_NAMES.filter(n => !(n in MAP) && !D.KNOWN_UNLINKED.includes(n));
  assert.deepStrictEqual(offenders, []);
});
check('C19: KNOWN_UNLINKED is exact', () => {
  assert.deepStrictEqual(D.KNOWN_UNLINKED, ['ניר עציון', 'עין דור', 'דגניה ב']);
});
check('C20: unlinked cards are really unmapped', () => {
  D.KNOWN_UNLINKED.forEach(n => assert.equal(n in MAP, false));
});
check('C21: the two restored links', () => {
  assert.deepStrictEqual(MAP['כפר עזה'], ['d1ed862f-a03a-4a43-8c22-1f19028a1b68']);
  assert.deepStrictEqual(MAP['דביר'], ['52b24c7f-dfb8-4985-bd25-51f9ad082a83']);
});
check('C22: every mapped UUID is well-formed', () => {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const malformed = [];
  Object.keys(MAP).forEach(k => {
    assert.ok(Array.isArray(MAP[k]) && MAP[k].length > 0, k + ' has no UUIDs');
    MAP[k].forEach(u => { if (!uuidRe.test(u)) malformed.push([k, u]); });
  });
  assert.deepStrictEqual(malformed, []);
});
check('C23: no orphan map key', () => {
  const orphans = Object.keys(MAP).filter(k => !CARD_NAMES.includes(k));
  assert.deepStrictEqual(orphans, []);
  assert.equal(Object.keys(MAP).length, 55);
});
check('C24: arithmetic closes (55 + 3 === 58)', () => {
  assert.equal(Object.keys(MAP).length + D.KNOWN_UNLINKED.length, CARD_NAMES.length);
  assert.equal(55 + 3, 58);
});
check('C25: no duplicate card name', () => {
  assert.equal(new Set(CARD_NAMES).size, CARD_NAMES.length);
  assert.equal(CARD_NAMES.length, 58);
});
check('C26: section counts match reality (grid-done=24, grid-pending=17)', () => {
  const doneCountEl = (HTML.slice(0, gridIdx[2]).match(/<div class="section-count">(\d+)<\/div>/g) || []).pop();
  const pendingCountEl = (HTML.slice(0, gridIdx[3]).match(/<div class="section-count">(\d+)<\/div>/g) || []).pop();
  const doneStatic = parseInt((doneCountEl.match(/\d+/) || [])[0]);
  const pendingStatic = parseInt((pendingCountEl.match(/\d+/) || [])[0]);
  const doneActual = CARDS.filter(c => c._grid === 'done').length;
  const pendingActual = CARDS.filter(c => c._grid === 'pending').length;
  assert.equal(doneStatic, 24);
  assert.equal(doneStatic, doneActual);
  assert.equal(pendingStatic, 17);
  assert.equal(pendingStatic, pendingActual);
  const newClientCountEl = (HTML.slice(gridIdx[1], gridIdx[2]).match(/<div class="section-count">(\d+)<\/div>/) || [])[1];
  const newClientActual = CARDS.filter(c => c._grid === 'new_client').length;
  if (String(newClientCountEl) !== String(newClientActual)) {
    warn('C26-new_client', 'grid-new_client section-count(' + newClientCountEl + ') != card count(' + newClientActual + ') — pre-existing, unrelated to this spec');
  }
});

// ======================================================================
// D. A region on every card
// ======================================================================
const FIX = buildFixture();
D.enrichCardsWithSheet(FIX);

check('D27: every card has exactly one .region-badge', () => {
  const missing = [];
  let withBadge = 0;
  let overBadge = 0;
  CARDS.forEach(c => {
    const n = c.querySelectorAll('.region-badge').length;
    if (n === 1) withBadge++;
    else if (n === 0) missing.push(c.dataset.name);
    else overBadge++;
  });
  assert.equal(withBadge, 58);
  assert.deepStrictEqual(missing, []);
  assert.equal(overBadge, 0);
});
check('D28: badge text + data-region attribute correct', () => {
  CARDS.forEach(c => {
    const b = c.querySelector('.region-badge');
    assert.ok(b.textContent.indexOf('📍 ') === 0, c.dataset.name + ' badge text');
    assert.equal(b.dataset.region, c.dataset.region, c.dataset.name + ' data-region');
    assert.ok(c.dataset.region, c.dataset.name + ' non-empty region');
  });
});
check('D29: שדה אליהו shadowing fix — row 28 wins, region העמקים', () => {
  const c = CARDS.find(c => c.dataset.name === 'שדה אליהו');
  assert.equal(c.dataset.region, 'העמקים');
  assert.equal(c.dataset.row, 28);
});
check('D30: דגניה ב via REGION_FALLBACK', () => {
  assert.equal(CARDS.find(c => c.dataset.name === 'דגניה ב').dataset.region, 'העמקים');
});
check('D31: דפנה via REGION_FALLBACK', () => {
  assert.equal(CARDS.find(c => c.dataset.name === 'דפנה').dataset.region, 'גליל וגולן');
});
check('D32: sub-sites with no Sheet row get a synthetic, row-less row', () => {
  ['גשר השלום', 'שדה אליהו - חקלאות', 'שלוחות ספק חיצוני', 'שער הגולן מחוץ למחלק'].forEach(n => {
    const c = CARDS.find(c => c.dataset.name === n);
    assert.equal(c.dataset.region, 'העמקים', n);
    assert.equal(c.dataset.row, undefined, n + ' must stay row-less');
  });
  const sapir = CARDS.find(c => c.dataset.name === 'מכללת ספיר');
  assert.equal(sapir.dataset.region, 'דרום, עוטף עזה והנגב');
  assert.equal(sapir.dataset.row, undefined);
});
check('D33: REGION_FALLBACK shape is exactly the spec 8 keys', () => {
  assert.deepStrictEqual(Object.keys(D.REGION_FALLBACK).sort(),
    ['אור הנר', 'גשר השלום', 'דגניה ב', 'דפנה', 'מכללת ספיר', 'שדה אליהו - חקלאות', 'שלוחות ספק חיצוני', 'שער הגולן מחוץ למחלק'].sort());
});
check('D34: fallback is a fallback, not an override', () => {
  const fix2 = { tasks: [{ name: 'דפנה', row: 62, region: 'גליל וגולן — מהגיליון', owners: [], status: '', expectedTask: '', task: '', lastModified: '' }], calendar: {} };
  D.enrichCardsWithSheet(fix2);
  const c = CARDS.find(c => c.dataset.name === 'דפנה');
  assert.equal(c.dataset.region, 'גליל וגולן — מהגיליון');
  // restore baseline fixture state for the remaining assertions
  D.enrichCardsWithSheet(buildFixture());
});
check('D35: idempotence — badge count stays 1 after a second run', () => {
  D.enrichCardsWithSheet(FIX);
  CARDS.forEach(c => assert.equal(c.querySelectorAll('.region-badge').length, 1, c.dataset.name));
});

// ======================================================================
// E. Procedure removal
// ======================================================================
const PROC_NEEDLES = ['PROC_DONE', 'proc-btn', 'toggleProcedure', 'proc-done', 'proc-pending'];
check('E36: procedure needles absent from the three shipped files', () => {
  const hits = [];
  [['app.js', APP], ['index.html', HTML], ['css/app.css', CSS]].forEach(([label, text]) => {
    PROC_NEEDLES.forEach(needle => { if (text.includes(needle)) hits.push(label + ':' + needle); });
  });
  assert.deepStrictEqual(hits, []);
});
check('E37: procedure needles absent from js/src/*.js (source of truth)', () => {
  const dir = path.join(__dirname, 'js/src');
  const hits = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    PROC_NEEDLES.forEach(needle => { if (text.includes(needle)) hits.push(f + ':' + needle); });
  });
  assert.deepStrictEqual(hits, []);
});
check('E38: parseTaskField has no proc key, exactly 5 keys', () => {
  const p = D.parseTaskField('step=3');
  assert.equal('proc' in p, false);
  assert.deepStrictEqual(Object.keys(p).sort(), ['cat', 'note', 'raw', 'step', 'type']);
});
check('E39: serializeTaskField arity is 4', () => {
  assert.equal(D.serializeTaskField.length, 4);
});
check('E40: serializeTaskField never emits [PROC_DONE]', () => {
  const outs = [
    D.serializeTaskField(null, '', null, null),
    D.serializeTaskField(15, 'x', null, null),
    D.serializeTaskField(3, 'note with | pipe', 'done', 'ongoing')
  ];
  outs.forEach(o => assert.equal(o.includes('PROC_DONE'), false));
  assert.equal(D.serializeTaskField(15, 'x', null, null), 'step=15 | note=x');
  assert.equal(D.serializeTaskField(null, '', null, null), '');
});
check('E41: legacy value still round-trips on read', () => {
  const p = D.parseTaskField('[PROC_DONE] | step=15 | note=x');
  assert.deepStrictEqual(p, { step: 15, note: 'x', cat: null, type: null, raw: '[PROC_DONE] | step=15 | note=x' });
});
check('E42: drops the legacy token on re-save', () => {
  const p = D.parseTaskField('[PROC_DONE] | step=15 | note=x');
  assert.equal(D.serializeTaskField(p.step, p.note, p.cat, p.type), 'step=15 | note=x');
});
check('E43: BOTTOM_CLASSES no longer lists proc-btn', () => {
  const m = SRC10.match(/const BOTTOM_CLASSES = (\[[^\]]*\])/);
  assert.ok(m, 'BOTTOM_CLASSES literal not found');
  const arr = JSON.parse(m[1].replace(/'/g, '"'));
  assert.equal(arr.includes('proc-btn'), false);
  assert.deepStrictEqual(arr, ['kibbutz-note', 'ready-flow-flag', 'flow-active-flag', 'urgent-flag', 'manual-flow-flag', 'new-client-flag', 'flow-bug-flag', 'bug-details', 'stepper', 'current-step-label', 'calendar-event']);
});
check('E44: mock fixtures are clean of [PROC_DONE]', () => {
  assert.equal(SRC01.includes('[PROC_DONE]'), false);
});
{
  const hasLegacy = /\[PROC_DONE\]/.test(fs.readFileSync(path.join(__dirname, 'stats.html'), 'utf8'));
  warn('E45: stats.html', hasLegacy
    ? 'still parses [PROC_DONE] (KPI tile degrades to always-false) — out of this spec\'s file list, flagged for follow-up'
    : 'no longer references [PROC_DONE] (unexpectedly clean — nothing to follow up)');
}

// ======================================================================
// F. Done cards lose the construction fields; non-done keep them
// ======================================================================
check('F46: no card in grid-done carries data-step in static markup', () => {
  assert.equal((SEGMENTS.done.match(/data-step="/g) || []).length, 0);
});
check('F47: no class="kibbutz-note" in grid-done static markup', () => {
  assert.equal((SEGMENTS.done.match(/class="kibbutz-note"/g) || []).length, 0);
});
check('F48: after enrichment, done cards drop step/stepper/label/note', () => {
  const offenders = [];
  CARDS.filter(c => (c.dataset.types || '').split(' ').includes('done')).forEach(c => {
    if (c.dataset.step !== undefined) offenders.push(c.dataset.name + ':step');
    if (c.querySelectorAll('.stepper').length !== 0) offenders.push(c.dataset.name + ':stepper');
    if (c.querySelectorAll('.current-step-label').length !== 0) offenders.push(c.dataset.name + ':label');
    if (c.querySelectorAll('.kibbutz-note').length !== 0) offenders.push(c.dataset.name + ':note');
  });
  assert.deepStrictEqual(offenders, []);
});
check('F49: injectSteppers does not re-add what enrichment stripped', () => {
  const injectSteppers = buildInjectSteppers(fakeDoc);
  injectSteppers();
  CARDS.filter(c => (c.dataset.types || '').split(' ').includes('done')).forEach(c => {
    assert.equal(c.querySelectorAll('.stepper').length, 0, c.dataset.name);
    assert.equal(c.querySelectorAll('.current-step-label').length, 0, c.dataset.name);
  });
});
check('F50: non-done regression guard — יגור keeps step + note + stepper', () => {
  const c = CARDS.find(c => c.dataset.name === 'יגור');
  assert.equal(c.dataset.step, '9');
  const notes = c.querySelectorAll('.kibbutz-note');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].textContent, 'בדיקת זרימה');
  const steppers = c.querySelectorAll('.stepper');
  assert.equal(steppers.length, 1);
  const steps = steppers[0].querySelectorAll('.step');
  assert.equal(steps.length, 14);
  const ninth = steps[8];
  assert.ok((ninth.className || '').split(' ').includes('current'));
});
check('F51: second non-done guard, pending grid — לביא keeps step + note', () => {
  const c = CARDS.find(c => c.dataset.name === 'לביא');
  assert.equal(c._grid, 'pending');
  assert.equal(c.dataset.step, '4');
  const notes = c.querySelectorAll('.kibbutz-note');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].textContent, 'ממתין לציוד');
});
check('F52: edit modal, done card — fields hidden and cleared', () => {
  const doneCard = mkEl('div'); doneCard.dataset.types = 'done';
  const editStep = mkEl('input'); editStep.value = '9';
  const editSetupNote = mkEl('input'); editSetupNote.value = 'x';
  const stepLabel = mkEl('label');
  const noteLabel = mkEl('label');
  const stubs = { editStep, editSetupNote };
  const doc = {
    getElementById: id => stubs[id] || null,
    querySelector: sel => sel.indexOf('editStep') !== -1 ? stepLabel : sel.indexOf('editSetupNote') !== -1 ? noteLabel : null
  };
  gateEditFields(doc, doneCard);
  [editStep, editSetupNote, stepLabel, noteLabel].forEach(el => assert.equal(el.style.display, 'none'));
  assert.equal(editStep.value, '');
  assert.equal(editSetupNote.value, '');
});
check('F53: edit modal, pending card — fields shown, values untouched', () => {
  const pendingCard = mkEl('div'); pendingCard.dataset.types = 'pending';
  const editStep = mkEl('input'); editStep.value = '9';
  const editSetupNote = mkEl('input'); editSetupNote.value = 'x';
  const stepLabel = mkEl('label');
  const noteLabel = mkEl('label');
  const stubs = { editStep, editSetupNote };
  const doc = {
    getElementById: id => stubs[id] || null,
    querySelector: sel => sel.indexOf('editStep') !== -1 ? stepLabel : sel.indexOf('editSetupNote') !== -1 ? noteLabel : null
  };
  gateEditFields(doc, pendingCard);
  [editStep, editSetupNote, stepLabel, noteLabel].forEach(el => assert.equal(el.style.display, ''));
  assert.equal(editStep.value, '9');
  assert.equal(editSetupNote.value, 'x');
});
check('F54: modal gating targets exist in the markup', () => {
  assert.ok(HTML.includes('id="editStep"'));
  assert.ok(HTML.includes('id="editSetupNote"'));
  assert.ok(HTML.includes('for="editStep"'));
  assert.ok(HTML.includes('for="editSetupNote"'));
});

// ======================================================================
// G. Nothing else regressed
// ======================================================================
check('G55: full sibling test suite passes', () => {
  const siblings = fs.readdirSync(__dirname)
    .filter(f => /^test-.*\.mjs$/.test(f))
    .filter(f => f !== 'test-site-consolidation.mjs' && f !== 'test-cert-pdf.mjs');
  const fails = [];
  siblings.forEach(f => {
    const r = spawnSync(process.execPath, [f], { cwd: __dirname, encoding: 'utf8' });
    if (r.status !== 0) {
      const lastLine = (r.stderr || r.stdout || '').trim().split('\n').pop();
      fails.push(f + ' -> ' + lastLine);
    }
  });
  console.log('    (' + siblings.length + ' sibling files run)');
  assert.deepStrictEqual(fails, []);
});
check('G56: build is current (js/src edits are reflected in js/app.js)', () => {
  assert.ok(APP.includes("const KNOWN_UNLINKED = ['ניר עציון', 'עין דור', 'דגניה ב']"));
  assert.ok(APP.includes('function serializeTaskField(step, note, cat, type)'));
});
check('G57: js/app.js was not hand-edited (KIBBUTZ_SITE_MAP byte-identical)', () => {
  const srcSpan = SRC01.substring(SRC01.indexOf('const KIBBUTZ_SITE_MAP'), SRC01.indexOf('function kibbutzSiteIds'));
  const appSpan = APP.substring(APP.indexOf('const KIBBUTZ_SITE_MAP'), APP.indexOf('function kibbutzSiteIds'));
  assert.equal(srcSpan, appSpan);
});

console.log(failures ? '\n' + failures + ' FAILED' : '\nsite-consolidation checks passed');
process.exit(failures ? 1 : 0);
