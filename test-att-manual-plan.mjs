// attManualPlan (js/src/04-attendance-daily.js): a manual save REPLACES the day's row.
// Run: node test-att-manual-plan.mjs
import assert from 'node:assert';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./js/src/04-attendance-daily.js', import.meta.url), 'utf8');
const fn = src.match(/function attManualPlan[\s\S]*?\n  }\n/)[0];
const attManualPlan = new Function('window', fn + '; return attManualPlan;')({});
let bad = 0;
const check = (n, f) => { try { f(); console.log('  ok - ' + n); } catch (e) { bad++; console.log('  FAIL - ' + n + ': ' + e.message); } };

const att = [
  { id: 'att_1_a', person: 'אביאם', date: '2026-10-05T09:00:00.000Z', source: 'manual' },
  { id: 'att_2_b', person: 'אביאם', date: '2026-10-05T09:00:00.000Z' },                    // no source = manual
  { id: 'att_v_20261005_אביאם', person: 'אביאם', date: '2026-10-05T09:00:00.000Z', source: 'visit_auto' },
  { id: 'att_3_c', person: 'ניתאי', date: '2026-10-05T09:00:00.000Z', source: 'manual' },
  { id: 'att_4_d', person: 'אביאם', date: '2026-10-06T09:00:00.000Z', source: 'manual' },
];
check('deterministic id per person+day', () => assert.equal(attManualPlan(att, 'אביאם', '2026-10-05').id, 'att_m_20261005_אביאם'));
check('same day re-pick: older manual rows of that person+day are replaced', () =>
  assert.deepEqual(attManualPlan(att, 'אביאם', '2026-10-05').staleIds, ['att_1_a', 'att_2_b']));
check('never touches visit_auto, other people or other days', () => {
  const s = attManualPlan(att, 'אביאם', '2026-10-05').staleIds;
  assert.ok(!s.includes('att_v_20261005_אביאם') && !s.includes('att_3_c') && !s.includes('att_4_d'));
});
check('second save of the same day does not list its own id as stale', () =>
  assert.deepEqual(attManualPlan([{ id: 'att_m_20261005_אביאם', person: 'אביאם', date: '2026-10-05T09:00:00.000Z', source: 'manual' }], 'אביאם', '2026-10-05').staleIds, []));
check('save path posts the deterministic id', () => assert.ok(/id: plan\.id/.test(src)));
if (bad) process.exit(1);
