// 📝 יומן היום — the LEGACY half of Part L (spec §7i). The pure TS half is covered by
// app/src/lib/daylog.test.ts; this runner pins the parts that live in the old bundle:
//
//   1. the prompt file and the prompt inlined in the Edge Function do not drift;
//   2. `saveVisitFromData` enforces the SAME gates the form does (visitor, date, duration,
//      delivery certificate) and posts the stock movement from the right source;
//   3. `sigma.saveVisitFromData` / `sigma.emsAddComment` / the two catalog readers exist on
//      the bridge — an island calling a name the bridge does not have fails silently in prod;
//   4. עידן's comment wording is ONE sentence shape, identical in the legacy bundle and in
//      app/src/lib/daylog.ts.
//   Run: node test-daylog.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { failures++; console.log('  FAIL - ' + name + ': ' + e.message); }
}

// ───────────────────────────── 1. prompt drift ─────────────────────────────

const promptMd = read('supabase/functions/parse-daylog/prompt.md');
const fnSrc = read('supabase/functions/parse-daylog/index.ts');

check('prompt.md and the inlined PROMPT are the same text', () => {
  const body = promptMd.split(/^---$/m)[1];
  assert.ok(body, 'prompt.md has no `---` separator');
  const inlined = fnSrc.match(/const PROMPT = `([\s\S]*?)`;/);
  assert.ok(inlined, 'index.ts has no PROMPT template');
  const norm = s => s.replace(/\r/g, '').trim();
  assert.equal(norm(inlined[1]), norm(body), 'prompt.md and index.ts PROMPT drifted — change both');
});

check('every placeholder the builder fills exists in the prompt', () => {
  for (const ph of ['{{TODAY}}', '{{KIBBUTZIM}}', '{{PRODUCTS}}', '{{TASKS}}', '{{EXAMPLES}}', '{{TEXT}}']) {
    assert.ok(promptMd.includes(ph), 'missing placeholder ' + ph);
    assert.ok(fnSrc.includes('.replace("' + ph + '"'), 'builder never fills ' + ph);
  }
});

check('the function is EMS-gated and chains Gemini → Groq like parse-order', () => {
  assert.ok(/emsValid\(EMS_API_BASE, body\.token\)/.test(fnSrc), 'no EMS gate');
  assert.ok(fnSrc.indexOf('callGemini') < fnSrc.indexOf('callGroq'), 'Gemini must be tried first');
  assert.ok(/GEMINI_API_KEY.*GROQ_API_KEY|GROQ_API_KEY/.test(fnSrc), 'both provider keys read');
});

check('the day log itself is never stored — only lengths and the two JSON shapes', () => {
  const correction = fnSrc.slice(fnSrc.indexOf('mode === "correction"'), fnSrc.indexOf('const text = String(body.text'));
  assert.ok(/raw_len/.test(correction), 'correction row must carry raw_len');
  assert.ok(!/raw_text|body\.text/.test(correction), 'the correction row must not carry the raw text');
});

const sql = read('db/daylog_corrections.sql');
check('daylog_corrections has RLS with an authenticated-only write', () => {
  assert.ok(/enable row level security/i.test(sql));
  assert.ok(/for insert to authenticated/.test(sql), 'insert must be authenticated-only');
  assert.ok(!/for insert to anon/.test(sql), 'no anon write');
  for (const col of ['person', 'raw_len', 'json_before', 'json_after', 'created_at']) {
    assert.ok(new RegExp('\\b' + col + '\\b').test(sql), 'missing column ' + col);
  }
});

// ───────────────────────────── 4. the comment wording ─────────────────────────────

const calSrc = read('js/src/14-calendar.js');
const libSrc = read('app/src/lib/daylog.ts');

check('emsCommentText is byte-identical in the legacy bundle and in the TS lib', () => {
  const legacy = new Function('return ' + calSrc.match(/function emsCommentText\(person, text\) \{[\s\S]*?\n  \}/)[0] + ';')();
  assert.equal(legacy('אביאם', 'החלפתי מונה'), 'עדכון מאביאם על המשימה: החלפתי מונה');
  assert.ok(libSrc.includes('`עדכון מ${String(person || \'\').trim()} על המשימה: ${String(text || \'\').trim()}`'),
    'app/src/lib/daylog.ts no longer builds the same sentence');
});

check('editing a visit linked to an EMS task uses that same opening sentence', () => {
  assert.ok(/emsCommentText\(next\.visitor \|\| '', 'דוח הביקור עודכן'\)/.test(calSrc),
    'buildVisitEditNote must open with עדכון מ<שם> על המשימה');
});

check('emsAddCommentTo queues instead of dropping a comment written offline', () => {
  const fn = calSrc.slice(calSrc.indexOf('async function emsAddCommentTo'), calSrc.indexOf('window.emsAddCommentTo'));
  assert.ok(/emsWriteOrQueue/.test(fn), 'must go through emsWriteOrQueue');
});

// ───────────────────────────── 3. the bridge surface ─────────────────────────────

const bridgeSrc = read('js/src/00-bridge.js');
check('the bridge exposes every name the island calls', () => {
  for (const fn of ['saveVisitFromData', 'emsAddComment', 'kibbutzNames', 'productNames']) {
    assert.ok(new RegExp('\\n\\s*' + fn + ': function').test(bridgeSrc), 'sigma.' + fn + ' missing from the bridge');
  }
  assert.ok(/call\('saveVisitFromData'/.test(bridgeSrc));
  assert.ok(/call\('emsAddCommentTo'/.test(bridgeSrc));
});

const islandSrc = read('app/src/islands/DayLog.tsx');
check('the island calls nothing the bridge does not have', () => {
  const used = [...islandSrc.matchAll(/sigma\.(\w+)\??\./g)].map(m => m[1]);
  for (const name of new Set(used)) {
    assert.ok(new RegExp('\\n\\s*' + name + ':').test(bridgeSrc) || name === 'ATT_PEOPLE',
      'island calls sigma.' + name + ' which the bridge does not expose');
  }
});

// ───────────────────────────── 2. the headless save ─────────────────────────────

const visitsSrc = read('js/src/09-visits.js');
const mkEl = (o) => Object.assign({ value: '', innerHTML: '', checked: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false } }, o || {});
const document_ = { getElementById: () => mkEl(), querySelectorAll: () => [], querySelector: () => null, createElement: () => mkEl(), addEventListener() {} };
const window_ = { SHEET_DATA: { visits: [] }, currentKibbutzVisits: [] };
const storage = {}; const localStorage_ = { getItem: k => storage[k] ?? null, setItem(k, v) { storage[k] = v; }, removeItem(k) { delete storage[k]; } };

let posts = []; let certReturn = 0; let emitted = []; let tracked = [];
const fetch_ = (u, o) => {
  if (o && o.body) { try { posts.push(JSON.parse(o.body)); } catch (e) {} }
  return Promise.resolve({ json: async () => ({ ok: true, id: 'SRV_ID' }) });
};

function load() {
  const fn = new Function(
    'window', 'document', 'localStorage', 'fetch', 'alert', 'SHEET_API', 'setBtnLoading',
    'certIssuedForVisit', 'readVisitEmsIntent', 'pushVisitToEms', 'refreshData', 'closeModal',
    'currentKibbutz', 'STOCK_HOLDERS', 'DEFECTIVE_LOCATION', 'POOL_LOCATION', 'POOL_LOCATION', 'computeStock', 'switchTab', 'onVisitorChange',
    'visitReturnedItems', 'renderReturnedItems', 'sigmaEmit', 'sigmaTrack', 'setTimeout',
    visitsSrc + '\nreturn { saveVisitFromData };',
  );
  return fn(
    window_, document_, localStorage_, fetch_, () => {}, 'http://sheet.test', () => {},
    async () => certReturn, () => '', () => {}, () => {}, () => {},
    'שדה אליהו', ['אביאם', 'ניתאי'], 'תקול', 'חברה', 'חברה', () => ({}), () => {}, () => {},
    [], () => {},
    (name, detail) => emitted.push({ name, detail }),
    (a, t, p) => tracked.push([a, t, p]),
    () => 0,                                   // no deferred refreshData in the runner
  );
}

let mod;
check('09-visits exposes saveVisitFromData', () => { mod = load(); assert.equal(typeof mod.saveVisitFromData, 'function'); });

if (mod) {
  const reset = () => { posts = []; emitted = []; tracked = []; window_.SHEET_DATA.visits.length = 0; };
  const base = { kibbutz: 'דפנה', visitor: 'אביאם', date: '2026-09-18', duration: 2, summary: 'החלפתי מונה' };
  const visitPosts = () => posts.filter(p => p.type === 'visit');
  const movePosts = () => posts.filter(p => p.type === 'movement');

  await (async () => {
    reset();
    const bad = [
      ['no kibbutz', { ...base, kibbutz: '' }],
      ['no visitor', { ...base, visitor: '' }],
      ['no date', { ...base, date: '' }],
      ['a date that is not a date', { ...base, date: 'אתמול' }],
      ['no duration and not a workday', { ...base, duration: 0 }],
    ];
    for (const [label, payload] of bad) {
      const r = await mod.saveVisitFromData(payload);
      check('refuses a card with ' + label, () => {
        assert.equal(r.ok, false);
        assert.ok(r.error, 'an error sentence for the card');
      });
    }
    check('nothing was written while refusing', () => assert.equal(posts.length, 0));

    // the cert gate
    reset(); certReturn = 0;
    const gated = await mod.saveVisitFromData({ ...base, products: [{ name: 'Partner Sim', qty: 2 }] });
    check('equipment with no issued certificate is refused, like the form', () => {
      assert.equal(gated.ok, false);
      assert.equal(gated.needsCert, true);
      assert.ok(gated.visitId, 'the refusal names the visit the cert must link to');
      assert.equal(visitPosts().length, 0);
    });

    reset(); certReturn = 7788;
    const ok = await mod.saveVisitFromData({ ...base, products: [{ name: 'Partner Sim', qty: 2 }] });
    check('an issued certificate unlocks the save', () => {
      assert.equal(ok.ok, true);
      assert.equal(ok.id, 'SRV_ID');
      assert.equal(visitPosts().length, 1);
      assert.equal(visitPosts()[0].isNew, true);
      assert.equal(visitPosts()[0].kibbutz, 'דפנה');
    });
    check('the supply leaves the company pool and lands at the kibbutz', () => {
      assert.equal(movePosts().length, 1);
      assert.deepEqual(
        { from: movePosts()[0].fromLocation, to: movePosts()[0].toLocation, qty: movePosts()[0].quantity, ref: movePosts()[0].refId },
        { from: 'חברה', to: 'דפנה', qty: 2, ref: 'SRV_ID' },
      );
    });
    check('the rest of the app is told (visit-saved) and the day is tracked', () => {
      assert.ok(emitted.some(e => e.name === 'visit-saved' && e.detail.kibbutz === 'דפנה'));
      assert.ok(tracked.some(t => t[0] === 'visit-saved' && t[2] === 'daylog'));
    });
    check('the in-memory snapshot carries the new visit immediately', () => {
      assert.equal(window_.SHEET_DATA.visits.length, 1);
      assert.equal(window_.SHEET_DATA.visits[0].id, 'SRV_ID');
    });

    reset(); certReturn = 0;
    const noProducts = await mod.saveVisitFromData({ ...base, workday: true, duration: 0 });
    check('a workday card with no equipment saves with no certificate and 8 hours', () => {
      assert.equal(noProducts.ok, true);
      assert.equal(visitPosts()[0].workday, true);
      assert.equal(visitPosts()[0].duration, 8);
      assert.equal(movePosts().length, 0);
    });

    reset(); certReturn = 9001;
    const office = await mod.saveVisitFromData({ ...base, visitor: 'מתניה', products: [{ name: 'בקר 485', qty: 1 }] });
    check('every visitor supplies from the same pool — there are no personal bags', () => {
      assert.equal(office.ok, true);
      assert.equal(visitPosts()[0].visitor, 'מתניה');
      assert.equal(movePosts()[0].fromLocation, 'חברה');
    });

    // This used to assert the opposite ("an explicit source wins"). Audit C #13: `source` comes
    // out of the day-log PARSER — text a model produced from what somebody dictated — so a
    // person's name there moved stock out of a personal bag that §1 abolished, and the quantity
    // vanished from poolStock() with nothing to reconcile it against. There is one pool, and the
    // client does not get to name the source.
    reset(); certReturn = 9001;
    await mod.saveVisitFromData({ ...base, source: 'עמיחי', products: [{ name: 'בקר 485', qty: 1 }] });
    check('#13 — a source the parser invented is IGNORED; the pool is the only source', () => {
      assert.equal(movePosts()[0].fromLocation, 'חברה');
    });

    reset(); certReturn = 0;
    const linked = await mod.saveVisitFromData({ ...base, emsTaskId: 'T-42' });
    check('a card matched to an EMS task stores the link on the visit', () => {
      assert.equal(linked.ok, true);
      assert.equal(visitPosts()[0].emsTaskId, 'T-42');
    });
  })();
}

console.log(failures === 0 ? '\nPASS — all day-log checks passed' : '\nFAIL — ' + failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
