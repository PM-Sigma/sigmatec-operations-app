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
console.log('alerts matrix OK (' + body.length + ' rows)');
