// Contract sweep for the field flow (Task 5, spec §5 + §7k 1/4/11/ג). The DECISIONS are
// covered by vitest goldens (app/src/lib/field.test.ts); what is checked here is everything
// another task can break from the OUTSIDE:
//   1. the Edge Function's copy of the pure module is byte-identical to app/src/lib/field.ts
//   2. push-send's visitCron is authenticated, guarded, idempotent and uses the pure planner
//   3. the adoption guards (ג) are real numbers in the shipped code, not prose
//   4. the deep links exist on both sides (22-push.js ↔ push-send ↔ sw.js actUrls)
//   5. the island is mounted, its placeholders exist, and the bridge carries the prefill
//   6. the migration + the cron job say what the runbook says
//   7. the UI copy rules (no system talk, nobody is told who else sees his data)
import fs from 'node:fs';

let failures = 0;
const ok = (name) => console.log('  ✓ ' + name);
const check = (name, cond, detail) => { if (cond) ok(name); else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

console.log('\n[1] the Edge Function carries a byte-identical copy of the pure module');
{
  const a = fs.readFileSync(new URL('./app/src/lib/field.ts', import.meta.url));
  const b = fs.readFileSync(new URL('./supabase/functions/push-send/field.ts', import.meta.url));
  check('app/src/lib/field.ts === supabase/functions/push-send/field.ts', a.equals(b),
    'copy the app/src file over the function one — Deno cannot import out of app/src');
  const src = read('./app/src/lib/field.ts');
  check('the module stays import-free (Deno + vitest + the browser all evaluate it)',
    !/^\s*import\s/m.test(src));
}

console.log('\n[2] push-send mode visitCron');
{
  const fn = read('./supabase/functions/push-send/index.ts');
  check('the mode exists', /body\.mode === "visitCron"/.test(fn));
  check('it is authenticated (cron key OR a live EMS login)',
    /x-cron-key/.test(fn) && /unauthorized: cron key or valid EMS login required/.test(fn));
  check('the selection is the PURE planner, not a hand-rolled query',
    /visitCronSelect\(\{/.test(fn) && /from\("field_checkins"\)/.test(fn));
  check('the 14 h window is applied in the query too', /14 \* 3600 \* 1000/.test(fn));
  check('a row is stamped reminded_at after the send (at most one nudge per arrival)',
    /update\(\{ reminded_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", pick\.id\)/.test(fn));
  check('rows the planner calls finished are settled, not re-scanned',
    /const settled = plan\.settle\.map\(\(x\) => x\.id\);/.test(fn));
  check('the words come from the rotating pool', /nudgeFor\(pick\.id, pick\.kibbutz, pick\.hasDraft\)/.test(fn));
  check('both notification actions are offered', /"כתיבת סיכום"/.test(fn) && /"לא היום"/.test(fn));
  // Audit fix (Opus, 24.9, two rounds): visits must not be pre-filtered by NAME at all — the
  // first `.in("visitor", people)` never fetched a visit filed under a co-visitor's name, and a
  // second attempt keyed to a `people`/`kibbutzim` allow-list still missed a visit filed by
  // someone who never checked in (e.g. עידן checks in alone, מתניה already filed the visit —
  // exactly the non-field-worker settlement checkinSettledByVisits decides). Every per-checkin
  // kibbutz/day/visitor decision happens once, inside checkinSettledByVisits — the query itself
  // only narrows by date.
  check('visits are selected by date only, not by a visitor/people/kibbutz allow-list',
    /\.from\("visits"\)\.select\([^)]*\)\.gte\("date", fromDay\)/.test(fn));
  check('the old visitor-name filter on visits is gone', !/\.from\("visits"\)[^;]*\.in\("visitor", people\)/.test(fn));
  check('no allow-list filter (people/kibbutzim) narrows the visits query either',
    !/\.from\("visits"\)[^;]*\.in\("kibbutz", kibbutzim\)/.test(fn));
  check('push_log gets the kibbutz as where_txt', /event: "visitCron", order_id: null, where_txt: pick\.kibbutz/.test(fn));
}

console.log('\n[3] adoption guards ג — the caps, quiet hours, the 20:00 gate (fix round 1)');
{
  const lib = read('./app/src/lib/field.ts');
  const fn = read('./supabase/functions/push-send/index.ts');
  check('the global ceiling is three', /PUSH_DAILY_CAP = 3/.test(lib));
  check('visits get two a day, gaps one', /VISIT_DAILY_CAP = 2/.test(lib) && /GAP_DAILY_CAP = 1/.test(lib));
  check('attendance and both digests are exempt',
    /CAP_EXEMPT_EVENTS = \['attendanceCron', 'attendanceReminder', 'usageDigest', 'inventoryDigest'\]/.test(lib));
  check('attendanceCron is NOT gated on the cap any more',
    !/PUSH_DAILY_CAP/.test(fn.slice(fn.indexOf('attendanceCron'), fn.indexOf('visitCron'))));
  check('the counter skips the exempt modes in BOTH directions',
    /CAP_EXEMPT_EVENTS\.indexOf\(String\(r\.event\)\) !== -1\) continue;/.test(fn));
  check('the counter reports the per-mode figure too', /if \(r\.event === "visitCron"\)/.test(fn));
  check('visitCron feeds both counts into the planner',
    /sentToday: sent\.total/.test(fn) && /sentTodayVisit: sent\.visit/.test(fn));
  check('quiet hours are 21:00 → 06:30', /QUIET_FROM_HH = 21/.test(lib) && /QUIET_TO_HH = 6/.test(lib) && /QUIET_TO_MM = 30/.test(lib));
  check('20:00 is a gate, never an accelerator (≥ 30 min after the arrival, else no push)',
    /REMINDER_LATEST_HH = 20/.test(lib) && /REMINDER_MIN_GAP_MS = 30 \* 60_000/.test(lib)
    && /return latest - at >= REMINDER_MIN_GAP_MS \? latest : null;/.test(lib));
  check('a day with no sendable moment is settled as `late`, not retried',
    /drop\('late'\); settle\.push\(\{ id: c\.id, reason: 'late' \}\)/.test(lib));
}

console.log('\n[4] the deep links, on both sides');
{
  const push = read('./js/src/22-push.js');
  const fn = read('./supabase/functions/push-send/index.ts');
  const sw = read('./sw.js');
  // Round 5 V-L4b: the ONE door, sigma.openVisitEditor (owns its own retry loop) — never the legacy form.
  check('?pushact=visit opens the sheet with the kibbutz', /act === 'visit'/.test(push) && /sigma\.openVisitEditor\(\{ kibbutz: kibbutz \}\)/.test(push));
  check('?pushact=visitDismiss reaches the island', /act === 'visitDismiss'/.test(push) && /sigmaField\.dismiss\(cid\)/.test(push));
  check('the island is given time to load (lazy chunk)', /waitField/.test(push));
  check('a dismissal that never landed does NOT claim it did',
    !/toast\('בסדר, לא היום\.'\)/.test(push) && /לא הצלחתי לסמן/.test(push));
  check('the function builds both URLs', /pushact=visit&kibbutz=/.test(fn) && /pushact=visitDismiss&cid=/.test(fn));
  check('the service worker routes notification actions through actUrls', /actUrls/.test(sw));
}

console.log('\n[5] the island, its placeholders and the bridge');
{
  const idx = read('./index.html');
  check('#sigma-field exists', idx.includes('<div id="sigma-field"></div>'));
  check('#sigma-today sits ABOVE the cards',
    idx.includes('<div id="sigma-today"></div>')
    && idx.indexOf('id="sigma-today"') < idx.indexOf('id="sigma-home"'));

  const main = read('./app/src/main.tsx');
  check('main.tsx mounts the field chunk lazily', /import\('@\/islands\/Field'\)/.test(main));

  const island = read('./app/src/islands/Field.tsx');
  check('both roots are mounted from one chunk', /mount\('sigma-field', Field\)/.test(island) && /mount\('sigma-today', Today\)/.test(island));
  check('a new check-in announces itself on the bus', /CHECKIN_CREATED = 'checkin-created'/.test(island));
  // TWO sheets in this file, and exactly two: the arrival/briefing one that MORPHS in place
  // (§7k #1 — one surface, two states) and the §7p chapters sheet, which is a separate
  // surface on purpose because it is opened from five places the briefing knows nothing
  // about. A third would mean the morph was broken up again.
  check('the sheet morphs in place (one briefing Sheet + the §7p chapters Sheet)',
    (island.match(/<Sheet\b/g) || []).length === 2 && /AnimatePresence/.test(island));
  check('the sheet’s motion stays inside the 320 ms budget', /const dur = reduce \? 0 : 0\.28;/.test(island));
  check('🚚 waits for the form before asking for the certificate', /addEventListener\('visit-form-open', once\)/.test(island));
  check('🚚 is only offered when there is something to deliver', /canDeliver && \(/.test(island));
  check('the day plan is feature-detected, never assumed', /day_plans/.test(island) && /if \(error\) return \[\];/.test(island));
  check('open orders are filtered server-side and paged, never truncated',
    /not\('status', 'in'/.test(island) && /\.range\(page \* ORDER_PAGE/.test(island) && !/limit\(300\)/.test(island));
  check('the uninvited sheet is latched PER DAY, not per session',
    /arrival_dismissed_/.test(island) && /readStr\(arrivalPromptKey\(today\)\) === '1'/.test(island));

  const bridge = read('./js/src/00-bridge.js');
  check('the bridge carries the checklist prefill', /prefillOpenItems: function \(kibbutz, text\)/.test(bridge));
  check('the prefill never overwrites what he typed', /if \(!el \|\| String\(el\.value \|\| ''\)\.trim\(\)\) return;/.test(bridge));

  const nav = read('./app/src/components/Nav.tsx');
  check('the raised 📍 offers the arrival sheet when there is no check-in', /field\?\.maybeOpen\?\.\(\)/.test(nav));
  // Round 3 · Package S: `maybeOpen` is an auto-invite ELIGIBILITY check (FIELD_PEOPLE only) —
  // a manual tap by any OTHER writer (עידן included) must still reach the chapters sheet, so
  // Nav also tries `openManual` before it ever falls to the legacy `sigma.openVisitQuick()`.
  check('a manual tap by every writer role also reaches the chapters sheet', /field\?\.openManual\?\.\(\)/.test(nav));
}

console.log('\n[6] the migration and the cron job');
{
  const sql = read('./db/field_checkins.sql');
  check('the table has the five columns the flow needs',
    ['person', 'kibbutz', 'checked_in_at', 'reminded_at', 'dismissed'].every((c) => sql.includes(c)));
  check('RLS is on, writes are authenticated-only', /enable row level security/.test(sql) && /for all to authenticated/.test(sql));
  const cron = read('./db/cron_visit_15min.sql');
  check('the job runs every quarter hour', /'7-52\/15 \* \* \* \*'/.test(cron));
  check('it proves itself with X-Cron-Key', /X-Cron-Key/.test(cron));
  check('it never races the hourly jobs', /never on the hour/.test(cron));
  check('the secret is a placeholder, never a value', /<CRON_SECRET>/.test(cron) && !/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(cron.replace(/<ANON>/g, '')));
}

console.log('\n[7] the copy rules (spec, before §7i)');
{
  const lib = read('./app/src/lib/field.ts');
  const island = read('./app/src/islands/Field.tsx');
  // Hebrew strings only, and COMMENTS STRIPPED FIRST: this file's own prose explains the
  // rules in Hebrew-adjacent terms, and a comment is not something a user ever reads.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hebrew = (raw) => {
    const src = strip(raw);
    const q = String.fromCharCode(39), b = String.fromCharCode(96);
    const line = (open, close) => new RegExp(open + '[^' + close + '\n]*[א-ת][^' + close + '\n]*' + close, 'g');
    return (src.match(line(q, q)) || [])
      .concat(src.match(line(b, b)) || [])
      .concat(src.match(new RegExp('>[^<>{}' + String.fromCharCode(10) + ']*[א-ת][^<>{}' + String.fromCharCode(10) + ']*<', 'g')) || []);
  };

  const strings = hebrew(lib).concat(hebrew(island));
  check('there are visible Hebrew strings to check at all', strings.length > 20, String(strings.length));
  const systemTalk = strings.filter((s) => /Supabase|RLS|\bAPI\b|נשמר אוטומטית|בדיקה אוטומטית|מחושב/.test(s));
  check('no system talk in the UI', systemTalk.length === 0, systemTalk.join(' | '));
  const whoSees = strings.filter((s) => /(עמיחי|עידן)[^']*(רואה|יראה|ראה)/.test(s));
  check('nobody is told who else sees his data', whoSees.length === 0, whoSees.join(' | '));
  const threat = strings.filter((s) => /לא נספר|חובה לסכם|אחרת/.test(s));
  check('the nudges never threaten', threat.length === 0, threat.join(' | '));
}

console.log('\n[8] X-L6: no-ai-slop over every push string in push-send/index.ts');
{
  const raw = read('./supabase/functions/push-send/index.ts');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = strip(raw);
  const literals = (src.match(/"[^"\n]*[א-ת][^"\n]*"/g) || []).map((s) => s.slice(1, -1));
  check('there are strings to check at all', literals.length > 20, String(literals.length));
  check('no "!" in any push string', literals.every((s) => !s.includes('!')),
    literals.filter((s) => s.includes('!')).join(' | '));
  check('no em dash — the title separator is · (grill: no-ai-slop, no em dash)',
    literals.every((s) => !s.includes('—')), literals.filter((s) => s.includes('—')).join(' | '));
  const actionTitles = [...raw.matchAll(/action:\s*"\w+",\s*title:\s*"([^"]*)"/g)].map((m) => m[1]);
  const emoji = /\p{Extended_Pictographic}/u;
  check('no emoji in any action button title', actionTitles.every((t) => !emoji.test(t)),
    actionTitles.filter((t) => emoji.test(t)).join(' | '));
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`FAILED  ${failures} check(s)`); process.exit(1); }
console.log('PASSED  field flow contract sweep');
