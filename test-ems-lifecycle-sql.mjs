// EMS task lifecycle (H5) — structure of db/ems_task_lifecycle.sql plus the client hook.
// Run: node test-ems-lifecycle-sql.mjs
//
// The behaviour of the differ is pinned by the model + golden tests (app/src/lib/emsLifecycleDiff.test.ts);
// this runner pins what a golden test cannot see: the migration's security shape (RLS on, no client write
// policies, SECURITY DEFINER with a pinned search_path, anon/viewer refused, server-side clock), that the
// file carries BACKUP + ROLLBACK, and that the client hook is silent and guarded.
// Nothing here talks to a database and nothing is applied.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const sql = read('db/ems_task_lifecycle.sql');
const noComments = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ok - ' + name); } catch (e) { failed++; console.log('  FAIL - ' + name + '\n    ' + e.message); }
}
const fnBody = name => {
  const i = noComments.indexOf('create or replace function public.' + name);
  assert.ok(i >= 0, name + ' is not defined');
  const j = noComments.indexOf('end $$;', i);
  return noComments.slice(i, j + 7);
};

check('both tables exist with RLS enabled', () => {
  for (const t of ['ems_task_state', 'ems_task_events']) {
    assert.match(noComments, new RegExp('create table if not exists public\\.' + t));
    assert.match(noComments, new RegExp('alter table public\\.' + t + '\\s+enable row level security'));
  }
});
check('no insert/update/delete policy exists: clients cannot write', () => {
  assert.doesNotMatch(noComments, /create policy [^;]*for (insert|update|delete|all)/i);
  assert.match(noComments, /revoke all on public\.ems_task_state, public\.ems_task_events from anon, authenticated/);
  assert.match(noComments, /grant select on public\.ems_task_state, public\.ems_task_events to authenticated/);
});
check('read policies: authenticated only, trusted name claim = עידן or עמיחי, never the viewer', () => {
  const policies = noComments.match(/create policy [^;]+;/g) || [];
  assert.strictEqual(policies.length, 2);
  for (const p of policies) {
    assert.match(p, /for select to authenticated/);
    assert.match(p, /in \('עידן','עמיחי'\)/);
    assert.match(p, /'viewer'/);
    assert.doesNotMatch(p, /to (anon|public)/);
  }
});
check('the client entry point is SECURITY DEFINER, pinned search_path, staff + non-viewer only', () => {
  const b = fnBody('ems_apply_snapshot(');
  assert.match(b, /security definer set search_path = public, pg_temp/);
  assert.match(b, /auth\.jwt\(\) ->> 'role'.*<> 'authenticated'/);
  assert.match(b, /auth\.jwt\(\) ->> 'name'/);
  assert.match(b, /'viewer','false'\) = 'true'/);
});
check('input shape is validated: array only, size cap, empty full snapshot refused', () => {
  const b = fnBody('ems_apply_snapshot(');
  assert.match(b, /jsonb_typeof\(p_tasks\) <> 'array'/);
  assert.match(b, /jsonb_array_length\(p_tasks\) > 5000/);
  assert.match(b, /p_full.*jsonb_array_length\(p_tasks\) = 0/s);
});
check('the timestamp is the server clock: the client cannot pass or back-date one', () => {
  const b = fnBody('ems_apply_snapshot(');
  assert.doesNotMatch(b, /p_at/);
  assert.match(b, /ems_apply_snapshot_core\(p_tasks, now\(\)/);
});
check('grants: client function to authenticated only (never anon/public); core + helpers to nobody', () => {
  assert.match(noComments, /revoke all on function public\.ems_apply_snapshot\(jsonb, boolean\) from public, anon;/);
  assert.match(noComments, /grant execute on function public\.ems_apply_snapshot\(jsonb, boolean\) to authenticated;/);
  assert.doesNotMatch(noComments, /grant execute[^;]*\bto (anon|public)\b/);
  assert.match(noComments, /revoke all on function public\.ems_apply_snapshot_core\(jsonb, timestamptz, boolean, text\) from public, anon, authenticated;/);
  assert.doesNotMatch(noComments, /grant execute on function public\.ems_apply_snapshot_core/);
  assert.match(noComments, /revoke all on function public\._ems_ts\(text\), public\._ems_d\(text\) from public, anon, authenticated;/);
});
check('the core is SECURITY DEFINER with a pinned search_path and locks the row it diffs', () => {
  const b = fnBody('ems_apply_snapshot_core');
  assert.match(b, /security definer set search_path = public, pg_temp/);
  assert.match(b, /for update/);
  assert.match(b, /on conflict \(task_id\) do nothing/);
});
check('definitions (עידן 29.9): assigned = assignee AND due date; closed statuses include cancelled', () => {
  const b = fnBody('ems_apply_snapshot_core');
  assert.match(b, /v_both\s+:= v_asg is not null and v_due is not null/);
  assert.match(b, /array\['done','rejected','not_relevant','cancelled'\]/);
});
check('disappeared is only ever written under p_full', () => {
  const b = fnBody('ems_apply_snapshot_core');
  const i = b.indexOf("select task_id,'disappeared'");
  assert.ok(i > b.indexOf('if p_full then'), "'disappeared' appears outside the p_full branch");
});
check('events are unique per (task, kind, sync_key) and never deleted or pruned', () => {
  assert.match(noComments, /unique \(task_id, kind, sync_key\)/);
  assert.doesNotMatch(noComments, /delete from public\.ems_task_(events|state)/i);
  assert.doesNotMatch(noComments, /drop (table|column)(?! if exists public\.ems_task)/i);
});
check('the file declares BACKUP and ROLLBACK and says it is not applied', () => {
  assert.match(sql, /BACKUP before applying/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /drop function if exists public\.ems_apply_snapshot\(jsonb, boolean\);/);
  assert.match(sql, /drop table if exists public\.ems_task_state;/);
  assert.match(sql, /NOT APPLIED/);
});
check('it only ADDS: no alter/drop of any pre-existing table', () => {
  assert.doesNotMatch(noComments, /alter table public\.(?!ems_task_)/);
  assert.doesNotMatch(noComments, /drop table (?!if exists public\.ems_task_)/);
});
check('the file carries no secret, no real host and no row data', () => {
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sql, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  assert.doesNotMatch(sql, /supabase\.co/);
});

// ── the client hook ─────────────────────────────────────────────────────────────────────
const data = read('js/src/01-data.js');
const ems = read('js/src/13-ems.js');
check('client: emsCacheWrite feeds the differ via the RPC, fire-and-forget, after the cache upsert', () => {
  const i = data.indexOf("if (b.type === 'emsCacheWrite')");
  const line = data.slice(i, data.indexOf('\n', i));
  assert.ok(line.indexOf("sbUpsert('ems_cache'") < line.indexOf('emsLifecycleApply('), 'must run after the cache write');
  assert.doesNotMatch(line, /await emsLifecycleApply/, 'must not be awaited');
});
check('client: silent guard - stops for the session on 404/401/403 or a network error, never toasts or throws', () => {
  const i = data.indexOf('const emsLifecycleApply');
  const b = data.slice(i, data.indexOf('const sbDelete', i));
  assert.match(b, /rpc\/ems_apply_snapshot/);
  assert.match(b, /r\.status === 404 \|\| r\.status === 401 \|\| r\.status === 403/);
  assert.match(b, /\.catch\(\(\) => \{ _lifecycleOff = true; \}\)/);
  assert.doesNotMatch(b, /toast|console\.|throw /);
  assert.match(b, /p_full: !!full/);
});
check('client: the crawl reports completeness and the page-cap stop is NOT complete', () => {
  assert.match(ems, /let complete = false/);
  assert.match(ems, /\{ complete = true; break; \}/);
  assert.match(ems, /full: complete/);
  const capLine = ems.split(String.fromCharCode(10)).find(l => l.includes('page >= 20'));
  assert.ok(capLine && !/complete = true/.test(capLine), 'the page-cap branch must not mark the crawl complete');
});
check('client: the slim task carries createdAt/updatedAt and the cache version moved with the shape', () => {
  assert.match(ems, /createdAt: t\.createdAt \|\| t\.created_at \|\| ''/);
  assert.match(read('js/src/00-consts.js'), /const EMS_CACHE_VER = 3;/);
});

if (failed) { console.log('\nFAIL - ' + failed + ' check(s) failed'); process.exit(1); }
console.log('\nPASS - ems lifecycle migration structure + client hook');
