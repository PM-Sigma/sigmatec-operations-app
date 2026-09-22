// Contract sweep for the SERVER-SIDE 2 h timer reminder (עידן 22.9).
//
// THE promise: "the clock you left running gets you a notification after two hours" must hold
// with the phone CLOSED the whole time, and with nobody's PC involved. The in-app auto-stop
// (WorkTimer.tsx) only fires while a screen is open, so the real path is:
//
//   ▶ opens a `work_sessions` row (ended_at = null)
//        → pg_cron every 5 min (db/cron_timer_5min.sql)
//        → push-send mode `timerStale` → `timerStaleSelect` (the pure rule)
//        → a Web Push with ?pushact=timer → js/src/22-push.js → the card's timer sheet
//
// The DECISIONS are goldens (app/src/lib/clockify.test.ts + WorkTimer.test.tsx). What is
// checked here is every link in that chain another task can break from the OUTSIDE.
//   node test-timer-push.mjs
import fs from 'node:fs';

let failures = 0;
const ok = (name) => console.log('  ✓ ' + name);
const check = (name, cond, detail) => { if (cond) ok(name); else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

console.log('\n[1] the Edge Function carries a byte-identical copy of the pure module');
{
  const a = fs.readFileSync(new URL('./app/src/lib/clockify.ts', import.meta.url));
  const b = fs.readFileSync(new URL('./supabase/functions/push-send/clockify.ts', import.meta.url));
  check('app/src/lib/clockify.ts === supabase/functions/push-send/clockify.ts', a.equals(b),
    'copy the app/src file over the function one — Deno cannot import out of app/src');
  const src = read('./app/src/lib/clockify.ts');
  check('the module stays import-free (Deno + vitest + the browser all evaluate it)',
    !/^\s*import\s/m.test(src));
  check('the two-hour constant is ONE constant, shared by the screen and the cron',
    /export const AUTO_STOP_MS = 2 \* 60 \* 60_000;/.test(src));
  check('a paused clock is excluded by the selector, exactly as autoStopDue excludes it',
    /if \(r\.paused_at\) continue;/.test(src));
}

console.log('\n[2] push-send mode timerStale');
{
  const fn = read('./supabase/functions/push-send/index.ts');
  check('the mode exists', /body\.mode === "timerStale"/.test(fn));
  check('it is authenticated (cron key OR a live EMS login)',
    /x-cron-key/.test(fn) && /unauthorized: cron key or valid EMS login required/.test(fn));
  check('the selection is the PURE selector, not a hand-rolled query',
    /timerStaleSelect\(open, Date\.now\(\)\)/.test(fn) && /from\("work_sessions"\)/.test(fn));
  check('only OPEN, never-nudged rows are read', /\.is\("ended_at", null\)\.is\("reminded_at", null\)/.test(fn));
  check('quiet hours are kept, like the visit nudge', /if \(inQuietHours\(Date\.now\(\)\)\) return json/.test(fn));
  check('a row is stamped reminded_at after the send (at most one nudge per clock)',
    /from\("work_sessions"\)\.update\(\{ reminded_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", pick\.id\)/.test(fn));
  check('the words come from the shared builder, not from a string in the handler',
    /timerNudgeFor\(pick\.kibbutz, pick\.started_at\)/.test(fn));
  check('the deep link is ?pushact=timer&kibbutz=…', /\?pushact=timer&kibbutz=/.test(fn));
  check('push_log records it under its own event name', /event: "timerStale"/.test(fn));
}

console.log('\n[3] the row exists from ▶, not from ■ — the whole point');
{
  const timer = read('./app/src/components/home/WorkTimer.tsx');
  const api = read('./app/src/components/home/workTimerApi.ts');
  const stop = read('./app/src/components/home/WorkTimerStopSheet.tsx');
  const edit = read('./app/src/components/home/WorkTimerEditSheet.tsx');
  check('▶ opens the row', /openSessionRow\(s\.person, s\.kibbutz, s\.started_at\)/.test(timer));
  check('…with ended_at null, so the cron can find it', /ended_at: null/.test(api));
  check('…and its id is remembered on the running session', /row_id: id/.test(timer));
  check('🗑 deletes the row rather than leaving it open for ever', /dropSessionRow\(mine\.row_id\)/.test(timer));
  check('■ UPDATEs that row instead of inserting a second one',
    /if \(running\.row_id\)/.test(stop) && /\.eq\('id', running\.row_id\)/.test(stop));
  check('…and still INSERTs when ▶ never got a row (a refused write must not cost hours)',
    /from\('work_sessions'\)\.insert\(fields\)/.test(stop));
  check('⏸ / ▶ / retime keep the row in step with the clock',
    /patchSessionRow\(s\.row_id/.test(edit) && /paused_at: s\.paused_at \|\| null/.test(edit));
  check('every row write is best effort — a refused one never stops the clock',
    /catch \{ return null; \}/.test(api) && (api.match(/catch \{ return false; \}/g) || []).length >= 2);
  check('the in-app auto-stop is still there (the fast path for an open screen)',
    /autoStopDue\(cur\)/.test(timer) && /notifyAutoStop\(kibbutz/.test(timer));
}

console.log('\n[4] the notification lands on the timer sheet');
{
  const push = read('./js/src/22-push.js');
  const timer = read('./app/src/components/home/WorkTimer.tsx');
  check("22-push.js handles act === 'timer'", /act === 'timer'/.test(push));
  check('it announces the kibbutz the push named', /sigma-open-timer'[\s\S]{0,80}kibbutz: kibbutz/.test(push));
  check('the WorkTimer listens for it', /OPEN_TIMER_EVENT = 'sigma-open-timer'/.test(timer)
    && /addEventListener\(OPEN_TIMER_EVENT/.test(timer));
  check('…and only the card whose timer is RUNNING answers', /if \(!cur \|\| cur\.kibbutz !== kibbutz\) return;/.test(timer));
}

console.log('\n[5] the migration + the cron job say what the runbook says');
{
  const mig = read('./db/work_sessions_timer.sql');
  const cron = read('./db/cron_timer_5min.sql');
  check('paused_ms and reminded_at are added idempotently',
    /add column if not exists paused_ms integer not null default 0/.test(mig)
    && /add column if not exists reminded_at timestamptz/.test(mig));
  check('paused_at too — an open pause has no duration to bank yet',
    /add column if not exists paused_at timestamptz/.test(mig));
  check('the cron has an index to read, not a seq scan every five minutes',
    /create index if not exists work_sessions_open_timers/.test(mig));
  check('🗑 can actually delete its own row (מתניה is not עידן/עמיחי)',
    /create policy ws_delete on work_sessions for delete to authenticated/.test(mig));
  check('the job is unscheduled before it is scheduled (re-running leaves ONE job)',
    /cron\.unschedule\('push-timer-5min'\)/.test(cron));
  check('every five minutes, off the hour where the other jobs sit', /'3-58\/5 \* \* \* \*'/.test(cron));
  check('it calls push-send with the mode and the cron secret',
    /"mode":"timerStale"/.test(cron) && /X-Cron-Key":"<CRON_SECRET>"/.test(cron));
  check('the prod steps name the REDEPLOY (the cron 404s on a function without the mode)',
    /Redeploy the `push-send` Edge Function/.test(cron));
}

console.log('\n' + (failures ? '❌ ' + failures + ' failed' : '✅ test-timer-push.mjs — the 2 h clock reminder reaches a closed phone'));
process.exit(failures ? 1 : 0);
