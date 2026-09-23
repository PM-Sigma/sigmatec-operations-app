// test-rls-policies.mjs — the static RLS sweep (Task 31 fix round 1, audit C #1/#2/#3).
//
// `create policy … for select using (true)` with NO `to` clause grants to `public`, and
// `public` includes `anon` — i.e. the public key baked into the client bundle. That single
// missing clause is what left internal tasks, meeting minutes, kibbutz_details (ח.פ. +
// addresses), the recount audit and the alert feed readable by anyone with the bundle, right
// through four "lockdown" migrations. Nothing in the repo could see it, because the mistake
// is an ABSENCE. This file is the reader that notices.
//
// Six contracts over db/*.sql, evaluated in FILE ORDER with the lockdowns applied last, the
// way the migrations are actually run:
//   1. no table outside the deliberate allowlist ends up with a SELECT policy granted to
//      `public` or `anon`
//   2. no table gets a write grant to `anon` at all
//   3. the audit-trail tables (inventory_alerts, stock_recounts) end up with no client
//      UPDATE or DELETE policy
//   4. the twelve legacy tables are governed and closed
//   5. `messages` is recorded in db/ and refuses the view-only session
//   6. every client write policy is paired with a restrictive policy that refuses the
//      view-only session (VIEWER_WRITE_OK lists the deliberate exceptions)
//
//   node test-rls-policies.mjs
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DB = new URL('./db/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

/**
 * Tables that may legitimately answer the anon key, each with the reason. Anything not here
 * must be `to authenticated` — add a line WITH a reason, never a bare name.
 */
const PUBLIC_READ_OK = new Map([
  ['push_log', 'the 📨 push-log screen\'s own table; holds no customer data (audit C, "minor")'],
]);

/**
 * The lockdown files are applied AFTER the per-table ones, so the sweep must read them in
 * that order or it judges a table by a policy that is later replaced.
 */
const LOCKDOWN_LAST = [
  'rls_staged.sql',
  'rls_authenticated_only.sql',
  'rls_corrections_lockdown.sql',
  'rls_certs_checkins_lockdown.sql',
  'rls_2_00_lockdown.sql',
  'rls_legacy_lockdown.sql',
  'rls_viewer_readonly.sql',
];

/**
 * The twelve ORIGINAL Apps-Script-era tables (task-33 D14). They are the reason this sweep
 * needs a roster at all: no db/*.sql file defined a policy for any of them, so the sweep
 * never heard of them and passed — while all twelve answered the public anon key. A sweep
 * that can only judge what it was told about is a sweep with a hole in it, and the hole is
 * exactly the shape of the mistake it exists to catch.
 *
 * Every name here must end up with a SELECT policy in db/*.sql, granted to `authenticated`
 * and to nothing else. Adding a table to this list is how a table becomes visible to the
 * sweep; removing one requires a reason, in writing, right here.
 */
const LEGACY_TABLES = [
  'attendance', 'ems_cache', 'ems_queue', 'movements', 'orders', 'potentials',
  'products', 'regions', 'requirements', 'returns', 'settings', 'tasks',
];

const files = readdirSync(DB).filter(f => f.endsWith('.sql'));
const ordered = [
  ...files.filter(f => !LOCKDOWN_LAST.includes(f)).sort(),
  ...LOCKDOWN_LAST.filter(f => files.includes(f)),
];
ok(files.includes('rls_2_00_lockdown.sql'),
  'db/rls_2_00_lockdown.sql is missing — it is the migration that closes the public reads');

/** Strip `--` line comments so a commented-out ROLLBACK block is not read as live SQL. */
const live = sql => sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const norm = t => String(t).replace(/^public\./, '').replace(/"/g, '').toLowerCase();

// table → { select: Set<role>, update: Set, delete: Set, insert: Set, all: Set } by policy name
/** @type {Map<string, Map<string, {cmd:string, roles:string[], where:string}>>} */
const state = new Map();
const policies = t => { if (!state.has(t)) state.set(t, new Map()); return state.get(t); };

const CREATE = /create\s+policy\s+(?:if\s+not\s+exists\s+)?([\w"]+)\s+on\s+([\w".]+)([\s\S]*?);/gi;
const DROP = /drop\s+policy\s+(?:if\s+exists\s+)?([\w"]+)\s+on\s+([\w".]+)\s*;/gi;

for (const f of ordered) {
  const sql = live(readFileSync(join(DB, f), 'utf8'));
  // Order matters inside a file too (drop, then create), so walk the statements in position.
  const events = [];
  for (const m of sql.matchAll(DROP)) events.push({ at: m.index, kind: 'drop', name: m[1], table: m[2] });
  for (const m of sql.matchAll(CREATE)) {
    events.push({ at: m.index, kind: 'create', name: m[1], table: m[2], body: m[3] });
  }
  events.sort((a, b) => a.at - b.at);

  for (const e of events) {
    const t = norm(e.table);
    if (e.kind === 'drop') { policies(t).delete(e.name.replace(/"/g, '')); continue; }
    const body = e.body.replace(/\s+/g, ' ');
    const cmd = (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(body) || [, 'all'])[1].toLowerCase();
    const to = /\bto\s+([\w\s,"]+?)\s*(?:using|with\s+check|\()/i.exec(body);
    const roles = to
      ? to[1].split(',').map(s => s.trim().replace(/"/g, '').toLowerCase()).filter(Boolean)
      : ['public'];
    const restrictive = /\bas\s+restrictive\b/i.test(body);
    // the view-only gate: a restrictive policy whose predicate refuses the `viewer` claim
    const viewerGate = restrictive && /auth\.jwt\(\)\s*->>\s*'viewer'/i.test(body)
      && /is\s+distinct\s+from\s+'true'/i.test(body);
    policies(t).set(e.name.replace(/"/g, ''), { cmd, roles, where: `${f}`, restrictive, viewerGate });
  }
}

ok(state.size > 20, `the sweep parsed only ${state.size} tables out of db/*.sql — the parser is broken, not the schema`);

const reaches_anon = roles => roles.includes('public') || roles.includes('anon');

// ── (1) no public/anon SELECT outside the allowlist ──────────────────────────
const leaks = [];
for (const [table, ps] of state) {
  for (const [name, p] of ps) {
    if (p.cmd !== 'select' && p.cmd !== 'all') continue;
    if (!reaches_anon(p.roles)) continue;
    if (PUBLIC_READ_OK.has(table)) continue;
    leaks.push(`${table}.${name} (${p.where}) — for ${p.cmd} to ${p.roles.join(', ')}`);
  }
}
ok(leaks.length === 0,
  'these tables still answer the PUBLIC anon key after every migration has run. `for select '
  + 'using (true)` with no `to` clause grants to `public`, which includes `anon`:\n    '
  + leaks.join('\n    ')
  + '\n  Fix: re-create the policy `for select to authenticated`, or add the table to '
  + 'PUBLIC_READ_OK in this file WITH the reason it must stay open.');

// ── (2) no write grant to anon, ever ─────────────────────────────────────────
const writes = [];
for (const [table, ps] of state) {
  for (const [name, p] of ps) {
    if (p.cmd === 'select') continue;
    if (!p.roles.includes('anon') && !p.roles.includes('public')) continue;
    writes.push(`${table}.${name} (${p.where}) — for ${p.cmd} to ${p.roles.join(', ')}`);
  }
}
ok(writes.length === 0,
  'these policies let the PUBLIC anon key WRITE. push_subscriptions was `for all to anon`, '
  + 'i.e. anyone with the bundle could delete every push subscription in the company:\n    '
  + writes.join('\n    '));

// ── (3) the audit trail keeps no client UPDATE/DELETE ────────────────────────
// §4b promises "every change is linked and auditable". A row a client can rewrite or drop is
// neither. The one legitimate write — marking an alert seen — goes through the SECURITY
// DEFINER RPC `alert_mark_seen`, not through a table policy.
for (const table of ['inventory_alerts', 'stock_recounts']) {
  ok(state.has(table), `db/*.sql no longer defines any policy for ${table}`);
  const bad = [...state.get(table)].filter(([, p]) => ['update', 'delete', 'all'].includes(p.cmd));
  ok(bad.length === 0,
    `${table} is an audit trail, but a signed-in client can still rewrite or delete it:\n    `
    + bad.map(([n, p]) => `${n} — for ${p.cmd} to ${p.roles.join(', ')} (${p.where})`).join('\n    '));
}

// ── (4) the twelve legacy tables are GOVERNED, and closed ────────────────────
// Contracts 1–3 can only judge a table some db/*.sql file mentions. These twelve were
// mentioned by none, which is why they stayed public through four lockdowns and a green
// sweep. Naming them makes the absence itself a failure.
ok(files.includes('rls_legacy_lockdown.sql'),
  'db/rls_legacy_lockdown.sql is missing — it is the migration that closes the twelve '
  + 'Apps-Script-era tables (task-33 D14)');

for (const table of LEGACY_TABLES) {
  ok(state.has(table),
    `${table} is in LEGACY_TABLES but NO db/*.sql file defines a policy for it. That is the `
    + 'task-33 D14 blind spot itself: a table this sweep cannot see is a table it cannot '
    + 'protect. Add its policy to db/rls_legacy_lockdown.sql.');
  const reads = [...state.get(table)].filter(([, p]) => p.cmd === 'select' || p.cmd === 'all');
  ok(reads.length > 0, `${table} ends up with no SELECT policy at all — the app could not read it`);
  const open = reads.filter(([, p]) => reaches_anon(p.roles));
  ok(open.length === 0,
    `${table} still answers the public anon key:\n    `
    + open.map(([n, p]) => `${n} — for ${p.cmd} to ${p.roles.join(', ')} (${p.where})`).join('\n    '));
}

// The lockdown must also turn RLS ON. A policy on a table with RLS disabled is decoration.
const legacySql = readFileSync(join(DB, 'rls_legacy_lockdown.sql'), 'utf8');
for (const table of LEGACY_TABLES) {
  ok(new RegExp('alter\\s+table\\s+public\\.' + table + '\\s+enable\\s+row\\s+level\\s+security', 'i').test(legacySql),
    `db/rls_legacy_lockdown.sql does not \`enable row level security\` on ${table} — the new `
    + 'policy would not be enforced');
}

const rpc = readFileSync(join(DB, 'rls_2_00_lockdown.sql'), 'utf8');
ok(/create\s+or\s+replace\s+function\s+public\.alert_mark_seen/i.test(rpc),
  'db/rls_2_00_lockdown.sql must define alert_mark_seen() — with no UPDATE policy on '
  + 'inventory_alerts it is the only way the bell can mark a row seen');
ok(/security\s+definer/i.test(rpc), 'alert_mark_seen must be SECURITY DEFINER');

const alertsIsland = readFileSync(
  new URL('./app/src/islands/Alerts.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8');
ok(/rpc\('alert_mark_seen'/.test(alertsIsland),
  'app/src/islands/Alerts.tsx must mark an alert seen through the alert_mark_seen RPC — a '
  + 'direct .from(\'inventory_alerts\').update() has no policy to run under any more');

// ── (5) messages is governed by the repo ─────────────────────────────────────
// It lived only in the live database; a table the sweep cannot see is a table it cannot judge.
ok(files.includes('messages.sql'), 'db/messages.sql is missing — the messages table must be recorded in the repo');
ok(/alter\s+table\s+public\.messages\s+enable\s+row\s+level\s+security/i.test(readFileSync(join(DB, 'messages.sql'), 'utf8')),
  'db/messages.sql must enable row level security');
ok(state.has('messages'), 'no db/*.sql file defines a policy for messages');
ok([...state.get('messages').values()].some(p => p.viewerGate && p.cmd === 'all'),
  'messages must carry a restrictive policy that refuses the view-only session for every command');

// ── (6) every client write refuses the view-only session ─────────────────────
// The view-only role is enforced in the UI; this makes the DATABASE agree. For every table with a
// permissive write policy for `authenticated`, each write command it opens must also be covered by a
// restrictive policy that refuses the viewer claim. Exempt tables need a reason, here.
const VIEWER_WRITE_OK = new Map([
  ['feedback', 'the viewer is allowed exactly this one write (spec §7 Part F)'],
  ['storage.objects', 'only the feedback-audio bucket insert — the voice half of the same feedback write'],
  ['usage_events','usage tracking every session sends; no business data'],
]);
const WRITE_CMDS = ['insert', 'update', 'delete'];
const viewerHoles = [];
for (const [table, ps] of state) {
  if (VIEWER_WRITE_OK.has(table)) continue;
  const all = [...ps.values()];
  const opened = new Set();
  for (const p of all) {
    if (p.restrictive || !p.roles.includes('authenticated')) continue;
    if (p.cmd === 'all') WRITE_CMDS.forEach(c => opened.add(c));
    else if (WRITE_CMDS.includes(p.cmd)) opened.add(p.cmd);
  }
  for (const c of opened) {
    if (!all.some(p => p.viewerGate && (p.cmd === c || p.cmd === 'all'))) viewerHoles.push(`${table} — ${c}`);
  }
}
ok(viewerHoles.length === 0,
  'these writes are open to the view-only session at the database level (add restrictive policies '
  + 'to db/rls_viewer_readonly.sql, or list the table in VIEWER_WRITE_OK with a reason):\n    '
  + viewerHoles.join('\n    '));

console.log(`test-rls-policies: ${checks} checks passed over ${ordered.length} db/*.sql files, `
  + `${state.size} tables, ${[...state.values()].reduce((n, m) => n + m.size, 0)} live policies.`);
