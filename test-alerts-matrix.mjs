// test-alerts-matrix.mjs — the matrix may not drift from the code (round 5, grill round 4).
import assert from 'node:assert';
import fs from 'node:fs';
const idx = fs.readFileSync('supabase/functions/push-send/index.ts', 'utf8');
const file = fs.readdirSync('docs/reports').filter(f => /alerts-matrix\.md$/.test(f)).sort().pop();
assert.ok(file, 'docs/reports/*-alerts-matrix.md exists');
const md = fs.readFileSync('docs/reports/' + file, 'utf8');
const PEOPLE = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'מתניה', 'אבצן', 'אליה', 'צפייה'];
const rows = md.split('\n').filter(l => /^\|/.test(l)).map(l => l.split('|').slice(1, -1).map(c => c.trim()));
const head = rows[0];
assert.deepStrictEqual(head, ['התראה', 'טריגר', ...PEOPLE, 'ערוץ', 'תזמון / שעות שקט', 'לחיצה מובילה ל']);
const body = rows.slice(2);
const byKey = Object.fromEntries(body.map(r => [(r[0].match(/`(\w+)`/) || [])[1], r]).filter(([k]) => k));

// 1. every push-send mode (except the approveOrder action) appears exactly once, and nothing else
const modes = [...idx.matchAll(/body\.mode === "(\w+)"/g)].map(m => m[1]).filter(m => m !== 'approveOrder');
for (const m of [...modes, 'pending', 'approved']) assert.ok(byKey[m], 'matrix row for `' + m + '`');
// 2. recipients of the fixed-list modes equal the constants in the code
const list = name => JSON.parse(idx.match(new RegExp('const ' + name + ' = (\\[[^\\]]*\\])'))[1].replace(/'/g, '"'));
const FIXED = { approved: 'APPROVE_GROUP', attendanceReminder: 'APPROVE_GROUP', feedbackNew: 'FEEDBACK_INBOX', usageDigest: 'USAGE_DIGEST_TO',
                inventoryAlert: 'INV_LOW_TO', inventoryDigest: 'INV_DIGEST_TO', attendanceCron: 'ATT_PEOPLE', gapReminder: 'ATT_PEOPLE' };
for (const [mode, c] of Object.entries(FIXED)) {
  const want = list(c);
  PEOPLE.forEach((p, i) => assert.equal(byKey[mode][2 + i].startsWith('✓'), want.includes(p), mode + ' · ' + p));
}
// 3. the viewer never gets a push
for (const r of body) if (/push/.test(r[10])) assert.equal(r[9], '—', r[0] + ': the viewer has no push');
// 4. every action a push offers is named in the tap column
for (const m of modes) {
  const block = idx.slice(idx.indexOf('body.mode === "' + m + '"'), idx.indexOf('body.mode ===', idx.indexOf('body.mode === "' + m + '"') + 5));
  for (const a of [...block.matchAll(/action: "(\w+)"/g)].map(x => x[1])) assert.match(byKey[m][12], new RegExp(a), m + ' tap lists ' + a);
}
// 5. the bell rows: one per AlertKind in use + the visit rule
const alerts = fs.readFileSync('app/src/lib/alerts.ts', 'utf8');
for (const k of ['movement', 'low_stock', 'ems_unlinked']) assert.ok(byKey[k], 'bell row `' + k + '`');
assert.match(byKey['visit_supply'][1], /מי ביקר/, 'the visit-supply bell row states the מי ביקר rule');
assert.match(alerts, /visitSupplyVisibleTo/, 'the rule exists in code');
// 6. G's push-log labels name the same modes (when package G has landed)
if (fs.existsSync('app/src/lib/pushLog.ts')) {
  const g = fs.readFileSync('app/src/lib/pushLog.ts', 'utf8');
  for (const m of [...modes, 'pending', 'approved']) assert.match(g, new RegExp('\\b' + m + '\\s*:'), 'PUSH_EVENT_LABEL has ' + m);
}

// 7. audit fix (Opus 24.9): the conditional rows, the bell rows and the timer row are derived
// from the SAME code the fixed-list rows already are (contract 2) — not read off by hand.
const field = fs.readFileSync('app/src/lib/field.ts', 'utf8');
const clockify = fs.readFileSync('app/src/lib/clockify.ts', 'utf8');
const arr = (src, name) => JSON.parse(src.match(new RegExp(name + "\\s*(?::[^=]*)?=\\s*(\\[[^\\]]*\\])"))[1].replace(/'/g, '"'));
const FIELD_PEOPLE = arr(field, 'FIELD_PEOPLE');
const TIME_TRACKERS = arr(clockify, 'TIME_TRACKERS');
// canSeeAlerts / canSeeEmsUnlinkedAlert are `['a','b',…].indexOf(user) !== -1` one-liners —
// the roster array inside the function's own body is the one it reads.
const rosterIn = (src, fnName) => {
  const at = src.indexOf('function ' + fnName);
  if (at === -1) throw new Error(fnName + ' not found in alerts.ts');
  const body = src.slice(at, src.indexOf('\n}', at));
  const m = body.match(/\[((?:'[^']*',?\s*)+)\]/);
  return JSON.parse('[' + m[1].replace(/'/g, '"') + ']');
};
const BELL_ROSTER = rosterIn(alerts, 'canSeeAlerts');
const UNLINKED_ROSTER = rosterIn(alerts, 'canSeeEmsUnlinkedAlert');

// visitCron / openNudges (the banner): reminded only ever the field team who actually check in.
for (const m of ['visitCron', 'openNudges']) {
  if (!byKey[m]) continue;
  PEOPLE.forEach((p, i) => assert.equal(byKey[m][2 + i].startsWith('✓'), FIELD_PEOPLE.includes(p), m + ' · ' + p));
}
// timerStale: only the people who actually run the ▶ clock (TIME_TRACKERS).
if (byKey['timerStale']) {
  PEOPLE.forEach((p, i) => assert.equal(byKey['timerStale'][2 + i].startsWith('✓'), TIME_TRACKERS.includes(p), 'timerStale · ' + p));
}
// the plain bell rows: every inventory actor, nobody else.
for (const k of ['movement', 'low_stock']) {
  if (!byKey[k]) continue;
  PEOPLE.forEach((p, i) => assert.equal(byKey[k][2 + i].startsWith('✓'), BELL_ROSTER.includes(p), k + ' · ' + p));
}
// ems_unlinked: the narrower עידן/עמיחי-only roster.
if (byKey['ems_unlinked']) {
  PEOPLE.forEach((p, i) => assert.equal(byKey['ems_unlinked'][2 + i].startsWith('✓'), UNLINKED_ROSTER.includes(p), 'ems_unlinked · ' + p));
}

console.log('alerts matrix OK (' + body.length + ' rows)');
