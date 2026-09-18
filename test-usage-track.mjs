// Contract sweep for 📈 שימוש (Task 17, spec §7j). These are the rules another task can
// break from the OUTSIDE, so they are checked against the real files, plus one behavioural
// test of the showPage wrapper in a fake DOM:
//   1. the bridge exposes sigmaTrack/sigma.track and wraps showPage exactly once per call
//   2. every legacy primary action is instrumented, and always guarded by `typeof`
//   3. the narrative copy in the Edge Function is byte-identical to app/src/lib
//   4. push-send's usageDigest is Sunday-08:00-gated, tagged, and fixed to עידן
//   5. the migration keeps usage_events write-only for the client
//   6. the island is registered for עידן only and the boot bundle stays data-stack-free
import fs from 'node:fs';

let failures = 0;
const ok = (name) => console.log('  ✓ ' + name);
const check = (name, cond, detail) => { if (cond) ok(name); else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

console.log('\n[1] the bridge tracks page views through ONE showPage wrapper');
{
  const src = read('./js/src/00-bridge.js');
  check('window.sigmaTrack is defined', /window\.sigmaTrack = function/.test(src));
  check('sigma.track forwards to it', /track: function \(action, target, page\)/.test(src));
  check('the queue is capped', /TRACK_CAP = 200/.test(src));
  check('a target is truncated, never stored whole', /slice\(0, TRACK_TARGET\)/.test(src));
  check('showPage is wrapped once (guard flag)', /__sigmaShowPageWrapped/.test(src));
  check('the wrapper logs the page actually landed on', /sigmaTrack\('view', null, window\._currentPage \|\| page\)/.test(src));

  // Behaviour, not text: run the wrapper against a minimal fake window and count the events.
  const events = [];
  const fakeWin = {
    __sigmaTrack: events,
    _currentPage: 'kibbutz',
    addEventListener() {},
    showPage(page) { fakeWin._currentPage = page; },
  };
  // Lift just the wrapper out of the bridge (it is self-contained) and run it.
  const wrapperSrc = src.slice(src.indexOf('window.sigmaWrapShowPage = function'), src.indexOf('if (!window.sigmaWrapShowPage())'));
  const trackerSrc = src.slice(src.indexOf('window.sigmaTrack = function'), src.indexOf('// Page views.'));
  const capsSrc = 'var TRACK_CAP = 200, TRACK_TARGET = 40;';
  const run = new Function('window', 'getCurrentUser', capsSrc + '\n' + trackerSrc + '\n' + wrapperSrc + '\nreturn window;');
  run(fakeWin, () => 'אביאם');
  fakeWin.sigmaWrapShowPage();
  fakeWin.showPage('inventory');
  fakeWin.showPage('calendar');
  check('one event per showPage call', events.length === 2, JSON.stringify(events));
  check('the event carries person + page + action', events[0] && events[0].person === 'אביאם'
    && events[0].page === 'inventory' && events[0].action === 'view', JSON.stringify(events[0]));
  check('wrapping twice does not double-count', fakeWin.sigmaWrapShowPage() === true
    && (fakeWin.showPage('dev'), events.length === 3), JSON.stringify(events.map(e => e.page)));
}

console.log('\n[2] every legacy primary action is instrumented, and guarded');
{
  const wants = [
    ['09-visits.js', "sigmaTrack('visit-saved'"],
    ['07-orders.js', "sigmaTrack('order-approved'"],
    ['20-delivery-cert.js', "sigmaTrack('cert-issued'"],
    ['14-calendar.js', "'ems-task-scheduled' : 'ems-task-created'"],
    ['08-inventory.js', "sigmaTrack('stock-report'"],
  ];
  for (const [file, needle] of wants) {
    const src = read('./js/src/' + file);
    check(`${file} calls ${needle.slice(0, 34)}…`, src.includes(needle));
  }
  // A missing bridge (an old cached js/app.js, a legacy-only page) must never throw.
  for (const file of ['09-visits.js', '07-orders.js', '20-delivery-cert.js', '14-calendar.js', '08-inventory.js']) {
    const src = read('./js/src/' + file).split('\n');
    let seen = 0;
    src.forEach((line, i) => {
      if (!/\bsigmaTrack\(/.test(line)) return;
      seen++;
      const guarded = /typeof sigmaTrack === 'function'/.test(src.slice(Math.max(0, i - 2), i + 1).join('\n'));
      check(`${file}:${i + 1} is typeof-guarded`, guarded, line.trim().slice(0, 80));
    });
    check(`${file} has at least one call to guard`, seen > 0);
  }
}

console.log('\n[3] the Edge Function narrative is a byte-identical copy');
{
  const a = read('./app/src/lib/usageNarrative.ts');
  const b = read('./supabase/functions/push-send/usageNarrative.ts');
  check('app/src/lib/usageNarrative.ts === supabase/functions/push-send/usageNarrative.ts',
    a === b, 'the copy drifted — edit app/src/lib and copy it over');
  check('the copy has no imports (so it can BE copied)', !/^import /m.test(a));
}

console.log('\n[4] push-send usageDigest: AUTH, gate, tag, fixed recipient, quiet response');
{
  const fn = read('./supabase/functions/push-send/index.ts');
  const modeBlock = fn.slice(fn.indexOf('body.mode === "usageDigest"'), fn.indexOf('// ---- one-tap approve'));
  check('the mode exists', fn.includes('body.mode === "usageDigest"'));
  // ── fix round 1: the mode must not answer the public anon key at all ──────────
  check('auth is the FIRST thing the mode does', /^[\s\S]{0,900}?const auth = usageDigestAuth\(/.test(modeBlock));
  check('the cron key comes from the X-Cron-Key header', /req\.headers\.get\("x-cron-key"\)/.test(modeBlock));
  check('the secret comes from CRON_SECRET, and is not in the repo',
    /Deno\.env\.get\("CRON_SECRET"\)/.test(modeBlock) && !/CRON_SECRET\s*=\s*["']/.test(fn));
  check('an EMS token is validated with the same emsValid as feedbackNew',
    /emsValid: body\.token \? await emsValid\(String\(body\.token\)\) : false/.test(modeBlock));
  check('a refusal answers the auth status and stops',
    /if \(!auth\.ok\) return json\(\{ error: auth\.error \}, auth\.status\);/.test(modeBlock));
  check('the Sunday gate is skipped only via auth.bypassGate',
    /!auth\.bypassGate && !\(t\.dow === 0 && t\.hh === 8\)/.test(modeBlock)
    // `body.force` may appear ONLY as an argument to usageDigestAuth — never as a gate of its own
    && !/if \(body\.force|body\.force === true/.test(modeBlock));
  check('the week tag is skipped only via auth.bypassTag (a plain force does NOT)',
    /if \(!auth\.bypassTag\) \{/.test(modeBlock));
  // ── and it must never hand the narrative back to the caller ───────────────────
  check('the response carries no sentences',
    /return json\(\{ ok: true, tag, sent: r\.delivered, lines: sentences\.length \}\);/.test(modeBlock)
    && !/sentences,/.test(modeBlock) && !/\.\.\.r \}/.test(modeBlock));

  const authSrc = read('./app/src/lib/usageDigest.ts');
  check('the auth module copy is byte-identical',
    authSrc === read('./supabase/functions/push-send/usageDigest.ts'), 'copy app/src/lib/usageDigest.ts over');
  check('the auth module has no imports (so it can BE copied)', !/^import /m.test(authSrc));
  check('a cron caller can never force', /if \(force && !\(emsOk && owner\)\)/.test(authSrc));
  check('gated on Sunday 08:00 Israel', /t\.dow === 0 && t\.hh === 8/.test(fn));
  check('the gate uses israelNow() (DST-correct)', /const t = israelNow\(\);[\s\S]{0,400}usageDigest|usageDigest[\s\S]{0,400}israelNow\(\)/.test(fn));
  check('force is decided by the auth module, not inline', /force: body\.force,/.test(fn)
    && !/const force = body\.force === true/.test(fn));
  check('idempotent on the week tag via push_log', /\.eq\("event", "usageDigest"\)\.eq\("where_txt", tag\)/.test(fn));
  check('the recipient is fixed server-side to עידן', /const USAGE_DIGEST_TO = \["עידן"\]/.test(fn)
    && /sendTo\(USAGE_DIGEST_TO,/.test(fn));
  check('the body is 3 sentences + the pointer', /digestBody\(sentences\)/.test(fn));
  check('the action opens #usage', /APP \+ "#usage"/.test(fn));
  check('other modes still there (superset of origin/main)',
    ['attendanceCron', 'approveOrder', 'feedbackNew', 'attendanceReminder'].every(m => fn.includes(m)));
}

console.log('\n[5] usage_events is write-only for the client');
{
  const sql = read('./db/usage_events.sql');
  check('RLS is on', /alter table usage_events enable row level security/.test(sql));
  check('INSERT for authenticated only', /create policy usage_events_insert on usage_events for insert to authenticated/.test(sql));
  check('SELECT / UPDATE / DELETE are revoked', /revoke select, update, delete on usage_events from anon, authenticated/.test(sql));
  check('no select policy is granted', !/for select/.test(sql));
  check('reads go through a SECURITY DEFINER RPC', /create or replace function usage_report\(p_days int, p_actor text\)[\s\S]*security definer/.test(sql));
  check('the RPC refuses anyone but עידן', /p_actor is distinct from 'עידן'/.test(sql) && /app_admins where name = p_actor/.test(sql));
  const cron = read('./db/cron_usage_weekly.sql');
  check('the cron job is hourly and posts usageDigest', /'5 \* \* \* \*'/.test(cron) && /"mode":"usageDigest"/.test(cron));
  check('re-running the cron file cannot leave two jobs', /cron\.unschedule\('push-usage-hourly'\)/.test(cron));
  // fix round 1: both scheduled jobs prove themselves with the shared secret header
  check('both jobs send X-Cron-Key', (cron.match(/"X-Cron-Key":"<CRON_SECRET>"/g) || []).length === 2);
  check('the attendance job is re-scheduled with it too', /cron\.schedule\(\s*'push-attendance-hourly'/.test(cron));
  check('no real secret is committed', !/"X-Cron-Key":"(?!<CRON_SECRET>)/.test(cron));
}

console.log('\n[5b] analytics never stores user-typed text (fix round 1 ruling)');
{
  const track = read('./app/src/lib/track.ts');
  const home = read('./app/src/islands/Home.tsx');
  const bridge = read('./js/src/00-bridge.js');
  const narrative = read('./app/src/lib/usageNarrative.ts');
  const sql = read('./db/usage_events.sql');
  check('track.ts offers only the PII-safe shape',
    /export function searchMissTarget/.test(track) && /'results:0,len:' \+/.test(track));
  check('Home.tsx sends searchMissTarget(q), never q',
    /track\('search-no-results', searchMissTarget\(q\)\)/.test(home) && !/track\('search-no-results', q\)/.test(home));
  check('no file still claims a search-term exception',
    ![track, bridge, sql].some(f => /ONE (?:documented )?exception is the failed kibbutz/.test(f)));
  check('the narrative counts misses and quotes nothing',
    /times\(misses\.length\)/.test(narrative) && !/terms\.map/.test(narrative));
}

console.log('\n[5c] the unload flush outlives the page (fix round 1, minor)');
{
  const track = read('./app/src/lib/track.ts');
  check('pagehide uses a keepalive transport',
    /keepalive: true/.test(track) && /if \(reason === 'pagehide'\) \{ await beaconInsert\(rows\); return; \}/.test(track));
  check('insert is told the reason it ran', /insert: \(rows: UsageEvent\[\], reason: FlushReason\)/.test(track));
  check('the pass travels in a HEADER, never a query string',
    /Authorization: 'Bearer ' \+ sbBearer\(pass\)/.test(track) && !/apikey=/.test(track));
  check('why sendBeacon is NOT used is written down', /sendBeacon cannot set request headers/.test(track));
}

console.log('\n[6] the island: עידן only, lazy, and the boot bundle stays lean');
{
  const isl = read('./app/src/islands/Usage.tsx');
  check("registered with roles ['idan']", /roles: \['idan'\]/.test(isl));
  check('and a LIVE visibility predicate', /visible: canSeeUsage/.test(isl));
  check('the gate is isIdan + not viewer', /isIdan\?\.\(\)[\s\S]{0,40}isViewer\?\.\(\)/.test(isl));
  check('data comes from the RPC, never a table select', /\.rpc\('usage_report'/.test(isl) && !/from\('usage_events'\)/.test(isl));
  check('numbers are wrapped in <bdi> (RTL gate)', /<bdi>/.test(isl));
  check('skeletons while loading', /Skeleton/.test(isl));
  // Both themes come for free ONLY if the screen carries no colour of its own (spec §6).
  const hex = isl.match(/#[0-9a-fA-F]{3,8}/g) || [];
  check('no literal colours — tokens only', hex.length === 0, hex.join(', '));
  const raw = isl.match(/(?:bg|text|border)-(?:white|black|(?:slate|gray|zinc|red|green|blue|amber|yellow)-\d{2,3})/g) || [];
  check('no palette utilities either', raw.length === 0, raw.join(', '));
  check('the heat shading is the primary token at four opacities',
    /bg-primary\/15/.test(isl) && /bg-primary\/35/.test(isl) && /bg-primary\/60/.test(isl));
  check('the chart colour is a token', /hsl\(var\(--primary\)\)/.test(isl));

  const main = read('./app/src/main.tsx');
  check('the island is a lazy chunk', /import\('@\/islands\/Usage'\)/.test(main));
  check('tracking starts at boot', /startTracking\(\)/.test(main));
  check('main.tsx still does not import the data stack',
    !main.includes('lib/query') && !main.includes('lib/supabase'));

  const track = read('./app/src/lib/track.ts');
  check('track.ts imports supabase-js lazily (it IS in the boot bundle)',
    /await import\('\.\/supabase'\)/.test(track) && !/^import .*'\.\/supabase'/m.test(track));
  check('one bulk insert per flush', /\.insert\(rows as any\)/.test(track));
  check('offline / unauthenticated drops the buffer', /return 'drop'/.test(track));

  const idx = read('./index.html');
  check('index.html reserves the placeholder', idx.includes('<div id="sigma-usage"></div>'));

  const islands = read('./app/src/islands.tsx');
  check('every island mount is tracked', /trackMount\(id\)/.test(islands));
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`FAILED  ${failures} check(s)`); process.exit(1); }
console.log('PASSED  usage analytics contract sweep');
