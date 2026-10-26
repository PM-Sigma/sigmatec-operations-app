// test-readings-citymind-dispatch.mjs — the manual CityMind pull: `dispatch` validation, the GitHub call, the
// ingest reusing the manual 'running' row (no 2nd run), the stale-running timeout. FAKE data only (public repo).
//   node test-readings-citymind-dispatch.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ACTIONS_REPO, DISPATCH_STALE_MS, DISPATCH_STALE_TEXT, WORKFLOW_FILE, dispatchRequest, ingestPlan, isDispatchRow,
  mapDispatchError, planDispatch, staleText,
} from './supabase/functions/readings-fetch/dispatch.mjs';

let n = 0;
const t = (name, f) => { f(); n++; console.log('  ok', name); };
const NOW = new Date('2026-10-26T08:00:00Z');                 // 11:00 Israel
const site = (o = {}) => ({ id: 's1', kibbutz: 'קיבוץ דמה', active: true, retention_days: 35, rules: { source: 'citymind' }, ...o });
const run = (o = {}) => ({ id: 'r1', status: 'running', trigger: 'manual', progress: { CityMind: { state: 'pending' } }, started_at: '2026-10-26T07:50:00Z', ...o });
const plan = (o = {}) => planDispatch({ site: site(), date: '2026-10-25', runs: [], now: NOW, ...o });

// ── dispatch validation ──────────────────────────────────────────────────────
t('a fresh yesterday on an active citymind site → start', () => assert.deepStrictEqual(plan(), { action: 'start' }));
t('inactive site / non-citymind site → rejected', () => {
  assert.strictEqual(plan({ site: site({ active: false }) }).error, 'INACTIVE');
  assert.strictEqual(plan({ site: site({ rules: {} }) }).error, 'NOT_CITYMIND');
  assert.strictEqual(plan({ site: null }).error, 'NOT_CITYMIND');
});
t('future date and today → BAD_DATE; malformed → BAD_DATE', () => {
  for (const d of ['2026-10-27', '2026-10-26', '2026-02-30', '25/10/2026', undefined, null]) {
    const p = plan({ date: d });
    assert.deepStrictEqual([p.action, p.status, p.error], ['reject', 400, 'BAD_DATE'], String(d));
  }
});
t('older than the site retention_days → TOO_OLD (35 default, per-site value honoured); the last allowed day passes', () => {
  assert.strictEqual(plan({ date: '2026-09-20' }).error, 'TOO_OLD');          // 36 days back
  assert.strictEqual(plan({ date: '2026-09-21' }).action, 'start');           // 35 days back = cutoff
  assert.strictEqual(plan({ site: site({ retention_days: 10 }), date: '2026-10-10' }).error, 'TOO_OLD');
  assert.strictEqual(plan({ site: site({ retention_days: null }), date: '2026-09-21' }).action, 'start');
});
t('an existing ok / running run → returned, no dispatch (ok wins over running)', () => {
  assert.deepStrictEqual(plan({ runs: [run({ id: 'a', status: 'ok' })] }), { action: 'existing', run_id: 'a', status: 'ok' });
  assert.deepStrictEqual(plan({ runs: [run({ id: 'b' })] }), { action: 'existing', run_id: 'b', status: 'running' });
  assert.strictEqual(plan({ runs: [run({ id: 'b' }), run({ id: 'a', status: 'ok' })] }).run_id, 'a');
});
t('a failed run does not block; a STALE running row (> 25 min) does not block either', () => {
  assert.strictEqual(plan({ runs: [run({ status: 'failed' })] }).action, 'start');
  assert.strictEqual(plan({ runs: [run({ started_at: '2026-10-26T07:30:00Z' })] }).action, 'start');   // 30 min
});

// ── the GitHub call ──────────────────────────────────────────────────────────
t('the request: workflow file, ref main, inputs kibbutz/date/dry_run "false" (strings), no token anywhere', () => {
  const r = dispatchRequest(DEFAULT_ACTIONS_REPO, 'קיבוץ דמה', '2026-10-25');
  assert.strictEqual(r.url, `https://api.github.com/repos/${DEFAULT_ACTIONS_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`);
  assert.strictEqual(WORKFLOW_FILE, 'citymind-arad.yml');
  assert.deepStrictEqual(r.body, { ref: 'main', inputs: { kibbutz: 'קיבוץ דמה', date: '2026-10-25', dry_run: 'false' } });
  assert.deepStrictEqual(Object.keys(r), ['url', 'body']);
});
t('a malformed repo secret is refused (no path injection into the API URL)', () => {
  for (const bad of ['', 'x', 'a/b/c', '../x/y', 'a/b?x=1', 'a b/c']) assert.throws(() => dispatchRequest(bad, 'k', '2026-10-25'), /bad repo/, bad);
});
t('GitHub status → Hebrew error; 401/403 name the missing Actions:write; nothing echoes a body or token', () => {
  for (const s of [401, 403]) {
    const m = mapDispatchError(s);
    assert.deepStrictEqual([m.status, m.error], [502, 'GH_FORBIDDEN']);
    assert.match(m.message, /Actions: write/);
  }
  assert.strictEqual(mapDispatchError(404).error, 'GH_NOT_FOUND');
  assert.strictEqual(mapDispatchError(422).error, 'GH_REJECTED');
  for (const s of [0, 500, 502, 429]) assert.strictEqual(mapDispatchError(s).error, 'GH_DOWN');
  for (const s of [401, 403, 404, 422, 500, 0]) assert.match(mapDispatchError(s).message, /[א-ת]/);
});

// ── ingest fills the manual row (no 2nd run) ─────────────────────────────────
t('a manual running row (dispatch) → ingest FILLS it; never an insert', () => {
  assert.deepStrictEqual(ingestPlan([run({ id: 'm1' })]), { action: 'fill', run_id: 'm1' });
});
t('nothing there → new; an ok run → existing (the once-per-day guard still holds)', () => {
  assert.deepStrictEqual(ingestPlan([]), { action: 'new' });
  assert.deepStrictEqual(ingestPlan(null), { action: 'new' });
  assert.deepStrictEqual(ingestPlan([run({ id: 'o1', status: 'ok', trigger: 'cron' })]), { action: 'existing', run_id: 'o1' });
});
t('an ok row wins over a running one; a running row that is NOT a dispatch row stays "existing"', () => {
  assert.strictEqual(ingestPlan([run({ id: 'm1' }), run({ id: 'o1', status: 'ok' })]).run_id, 'o1');
  assert.deepStrictEqual(ingestPlan([run({ id: 'c1', trigger: 'cron' })]), { action: 'existing', run_id: 'c1' });
  assert.deepStrictEqual(ingestPlan([run({ id: 'c1', progress: {} })]), { action: 'existing', run_id: 'c1' });
});
t('end to end on a fake table: dispatch row → ingest → exactly ONE row for the day', () => {
  const rows = [];
  const startManual = () => { const p = planDispatch({ site: site(), date: '2026-10-25', runs: rows, now: NOW }); if (p.action === 'start') rows.push(run({ id: 'm1' })); return p; };
  const ingest = () => {
    const p = ingestPlan(rows.filter((r) => r.status === 'ok' || r.status === 'running'));
    if (p.action === 'fill') Object.assign(rows.find((r) => r.id === p.run_id), { status: 'ok', progress: { CityMind: { state: 'ok', count: 3 } } });
    else if (p.action === 'new') rows.push({ id: 'n1', status: 'ok', trigger: 'cron' });
    return p;
  };
  assert.strictEqual(startManual().action, 'start');
  assert.strictEqual(startManual().action, 'existing');          // a double tap does not dispatch twice
  assert.strictEqual(ingest().action, 'fill');
  assert.strictEqual(ingest().action, 'existing');               // the scheduled fire afterwards: no duplicate
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual([rows[0].id, rows[0].status, rows[0].trigger], ['m1', 'ok', 'manual']);
});

// ── the stale-running timeout ────────────────────────────────────────────────
t('a dispatch row lives 25 min; an ordinary running row 10 min', () => {
  const at = (min, o = {}) => run({ started_at: new Date(NOW.getTime() - min * 60000).toISOString(), ...o });
  assert.strictEqual(DISPATCH_STALE_MS, 25 * 60000);
  assert.strictEqual(staleText(at(24), NOW.getTime()), null);
  assert.strictEqual(staleText(at(26), NOW.getTime()), DISPATCH_STALE_TEXT);
  assert.strictEqual(DISPATCH_STALE_TEXT, 'המשיכה לא הסתיימה — נסה שוב');
  assert.strictEqual(staleText(at(11, { progress: { SpeedNet: { state: 'running' } } }), NOW.getTime()), 'הריצה נתקעה');
  assert.strictEqual(staleText(at(9, { progress: { SpeedNet: { state: 'running' } } }), NOW.getTime()), null);
  assert.strictEqual(staleText(at(99, { status: 'ok' }), NOW.getTime()), null);
  assert.ok(isDispatchRow(at(1)) && !isDispatchRow(at(1, { status: 'ok' })));
});

// ── source contract of index.ts ──────────────────────────────────────────────
t('index.ts: `dispatch` is user-only, reads GH_TOKEN from env, never logs it; ingest + maintenance use the new rules', () => {
  const src = readFileSync(new URL('./supabase/functions/readings-fetch/index.ts', import.meta.url), 'utf8');
  assert.match(src, /case "dispatch": \{\s*userOnly\(\);/);
  assert.match(src, /env\("GH_TOKEN"\)/);
  assert.ok(!/console\.(log|error|warn)\([^)]*token/i.test(src), 'a log line mentions the token');
  assert.match(src, /Authorization: "Bearer " \+ token/);
  assert.match(src, /ingestPlan\(have \|\| \[\], CITYMIND\)/);
  assert.match(src, /fillId\s*\? await sb\.from\("reading_runs"\)\.update\(okRow\)/);
  assert.match(src, /staleText\(r, now\.getTime\(\)\)/);
  assert.match(src, /NO_MANUAL/, 'the old `run` mode still refuses citymind');
  assert.ok(!/ghp_|github_pat_/.test(readFileSync(new URL('./supabase/functions/readings-fetch/dispatch.mjs', import.meta.url), 'utf8')));
});
t('workflow: a manual dispatch has its own concurrency group per kibbutz+date', () => {
  const wf = readFileSync(new URL('./.github/workflows/citymind-arad.yml', import.meta.url), 'utf8');
  assert.match(wf, /group: \$\{\{ github\.event_name == 'workflow_dispatch' && format\('citymind-arad-\{0\}-\{1\}', inputs\.kibbutz, inputs\.date\) \|\| 'citymind-arad' \}\}/);
  assert.match(wf, /dry_run:/);
});

console.log(`test-readings-citymind-dispatch: ${n} passed`);
