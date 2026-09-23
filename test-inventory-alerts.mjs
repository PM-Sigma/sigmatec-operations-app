// Contract sweep for the inventory alerts (Task 10, inventory spec §4a + §5, master §7k guard ג).
// The DECISIONS are vitest goldens (app/src/lib/alerts.test.ts, orderStrip.test.ts); what is
// checked here is everything another task can break from the OUTSIDE:
//   1. the Edge Function's copy of alerts.ts is byte-identical to app/src/lib/alerts.ts
//   2. push-send's two modes are authenticated, idempotent, and fixed to their recipients
//   3. the quiet-hours EXCEPTION is real and is the ONLY one (§7k ג)
//   4. the trigger can never fail a movement insert (Task 8 review, "Important")
//   5. the SQL ships in a runnable order and carries no secret
//   6. the island is mounted, its placeholders exist, and the copy rules hold
import fs from 'node:fs';

let failures = 0;
const ok = (name) => console.log('  ✓ ' + name);
const check = (name, cond, detail) => { if (cond) ok(name); else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

console.log('\n[1] the Edge Function carries a byte-identical copy of the pure module');
{
  const a = fs.readFileSync(new URL('./app/src/lib/alerts.ts', import.meta.url));
  const b = fs.readFileSync(new URL('./supabase/functions/push-send/alerts.ts', import.meta.url));
  check('app/src/lib/alerts.ts === supabase/functions/push-send/alerts.ts', a.equals(b),
    'copy the app/src file over the function one — Deno cannot import out of app/src');
  check('the module stays import-free (Deno + vitest + the browser all evaluate it)',
    !/^\s*import\s/m.test(read('./app/src/lib/alerts.ts')));
}

console.log('\n[2] push-send · inventoryAlert + inventoryDigest');
{
  const fn = read('./supabase/functions/push-send/index.ts');
  // Each branch, from its own header comment to the start of the next one — so a check can
  // never accidentally read the neighbouring mode's auth or its tag.
  const lowAt = fn.indexOf('מלאי נמוך, immediately');
  const digAt = fn.indexOf('body.mode === "inventoryDigest"');
  const nextAt = fn.indexOf('---- one-tap approve');
  const low = lowAt === -1 ? '' : fn.slice(lowAt, digAt);
  const dig = digAt === -1 ? '' : fn.slice(digAt, nextAt);

  check('inventoryAlert exists', !!low);
  check('inventoryDigest exists', !!dig);
  check('the low-stock push answers the cron secret ONLY (the DB calls it, never a browser)',
    /x-cron-key/.test(low) && !/emsValid/.test(low));
  check('it is capped at one per product per day', /lowStockTag\(/.test(low) && /already sent today/.test(low));
  check('the recipients are fixed server-side', /INV_LOW_TO = \["עידן", "עמיחי"\]/.test(fn));
  check('the digest goes to עמיחי alone (I2)', /INV_DIGEST_TO = \["עמיחי"\]/.test(fn));
  check('the digest is gated on the pure window, not on a cron expression', /digestWindow\(now\)/.test(dig));
  check('the digest is idempotent on the inv-digest tag',
    /\.eq\("event", "inventoryDigest"\)\.eq\("where_txt", win\.tag\)/.test(dig));
  check('an empty window sends nothing', /skipped: "empty window"/.test(dig));
  check('only עידן may force one off-schedule', /force is עידן/.test(dig));
  // The builder is imported as `invDigestBody` because usageNarrative.ts exports a `digestBody`
  // of its own, and importing both names killed the deployed function at module scope
  // (task-33 FAIL-1). The alias is the fix; what this check cares about is that the digest
  // still calls the SHARED builder rather than growing a second copy of it.
  check('the digest body is the shared builder, not a second copy',
    /(inv)?[dD]igestBody\(alerts\)/.test(dig) && /digestTitle\(alerts, win\.hh\)/.test(dig));
}

console.log('\n[3] adoption guard ג — quiet hours and the daily cap');
{
  const fn = read('./supabase/functions/push-send/index.ts');
  const lib = read('./app/src/lib/field.ts');
  const low = fn.slice(fn.indexOf('מלאי נמוך, immediately'), fn.indexOf('body.mode === "inventoryDigest"'));
  check('the immediate low-stock push is the documented quiet-hours EXCEPTION',
    !/inQuietHours/.test(low) && /QUIET HOURS/.test(low));
  check('every other nudge still honours quiet hours', (fn.match(/inQuietHours\(/g) || []).length >= 1);
  check('the digest is exempt from the daily cap',
    /CAP_EXEMPT_EVENTS = \['attendanceCron', 'attendanceReminder', 'usageDigest', 'inventoryDigest'\]/.test(lib));
}

console.log('\n[4] the trigger can never fail a movement insert (Task 8 review)');
{
  const v2 = read('./db/inventory_pool_v2.sql');
  check('db/inventory_pool_v2.sql exists and replaces the function only',
    /create or replace function inventory_alert_on_movement/.test(v2));
  check('the body is wrapped in an exception handler', /exception when others then/.test(v2));
  check('a failure is a notice, never an error', /raise notice/.test(v2) && !/raise exception/.test(v2));
  check('the low_stock branch fires the push', /perform inventory_push_low_stock\(/.test(v2));
}

console.log('\n[5] the SQL runbook');
{
  const hook = read('./db/inventory_alert_webhook.sql');
  const cron = read('./db/cron_inventory_digest.sql');
  check('the webhook uses pg_net (async — the insert never waits on HTTP)', /net\.http_post/.test(hook));
  check('it reads the secret from a PRIVATE table, not from the SQL text',
    /private\.push_config/.test(hook) && /revoke all on private\.push_config from anon/.test(hook));
  check('the webhook function never raises', /exception when others then/.test(hook));
  check('no secret is committed', !/eyJ[A-Za-z0-9_-]{20,}/.test(hook + cron));
  check('the digest rides the hourly cron pattern', /cron\.schedule\(\s*'push-inventory-hourly'/.test(cron)
    && /'10 \* \* \* \*'/.test(cron));
  check('the cron body asks for the digest mode', /"mode":"inventoryDigest"/.test(cron));
}

console.log('\n[6] the islands are wired');
{
  const html = read('./index.html');
  const main = read('./app/src/main.tsx');
  check('#sigma-alerts is in the header', /id="sigma-alerts"/.test(html));
  check('#sigma-inventory-strip is on the מלאי page', /id="sigma-inventory-strip"/.test(html));
  check('main.tsx mounts both', /mountAlerts\(\)/.test(main) && /mountInventoryStrip\(\)/.test(main));

  const island = read('./app/src/islands/Alerts.tsx') + read('./app/src/islands/InventoryStrip.tsx');
  check('the bell is gated by the pure rule, not by a literal role list',
    /canSeeAlerts\(user, isViewer\)/.test(island));
  check('the min_qty editor is gated the same way', /canSetMinQty\(user, isViewer\)/.test(island));
  // openSource/alertTarget moved into components/alerts/AlertsPanel.tsx with the list body
  // it belongs to (round 5, package S task L7) — the frame in Alerts.tsx just renders it.
  check('a row opens the thing that happened', /alertTarget\(/.test(read('./app/src/components/alerts/AlertsPanel.tsx')));

  const lib = read('./app/src/lib/alerts.ts');
  // Quoted strings and single-line JSX text only — a multi-line match would swallow code.
  const hebrew = (src) => [...src.matchAll(/'([^'\\\n]*[\u0590-\u05FF][^'\\\n]*)'/g)].map((m) => m[1])
    .concat([...src.matchAll(/>([^<>{}\n]*[\u0590-\u05FF][^<>{}\n]*)</g)].map((m) => m[1].trim()));
  const strings = hebrew(lib).concat(hebrew(island));
  check('there are visible Hebrew strings to check at all', strings.length > 10, String(strings.length));
  const systemTalk = strings.filter((s) => /Supabase|RLS|\bAPI\b|טריגר|realtime|מחושב אוטומטית/.test(s));
  check('no system talk in the UI', systemTalk.length === 0, systemTalk.join(' | '));
  const whoSees = strings.filter((s) => /(עמיחי|עידן)[^']*(רואה|יראה|ראה)/.test(s));
  check('nobody is told who else sees his data', whoSees.length === 0, whoSees.join(' | '));
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`FAILED  ${failures} check(s)`); process.exit(1); }
console.log('PASSED  inventory alerts contract sweep');
