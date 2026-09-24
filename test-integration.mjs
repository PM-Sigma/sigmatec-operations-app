// test-integration.mjs — the integration contracts (plan Task 18), part of `npm test`.
//
// "תוודא שיש בין כל דף ופיצר את הקשר בקוד" (עידן, 18.9). This app is React islands beside 13k
// lines of legacy JS, joined by four narrow channels — the bridge, the bus, the island
// placeholders and the Supabase tables. Every one of those joins is a NAME agreed in two files
// that never import each other, so nothing tells you when one side moves. Everything here is
// one shape of that question: is the other end of this wire still attached?
//
// The facts come from scripts/integration-map.mjs (the same analyzer that generates
// docs/integration-map.md) so the document and the assertions can never disagree.
//
//   node test-integration.mjs
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { analyze, code, walk, ROOT } from './scripts/integration-map.mjs';

const a = analyze();
const at = h => `${h.file}:${h.line}`;
const list = xs => xs.map(at).join('\n    ');
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

// ════════════════════ (a) the bridge ════════════════════
// React → legacy goes through `window.sigma` and nothing else. Three ways for that to break:
// calling something the bridge does not provide, the bridge forwarding to a legacy function
// that no longer exists, and the TypeScript declaration drifting from the runtime object.

ok(a.bridge.missing.length === 0,
  'app/src calls sigma.<fn> that nothing provides — not in the 00-bridge.js literal and not '
  + 'installed by any island:\n    ' + list(a.bridge.missing));

ok(a.bridge.unresolved.length === 0,
  'js/src/00-bridge.js forwards to a legacy function that does not exist anywhere in the '
  + 'concat order — the call would silently return the fallback for ever:\n    '
  + a.bridge.unresolved.map(h => `${h.name} (${at(h)})`).join('\n    '));

ok(a.bridge.missingRequired.length === 0,
  'app/src/bridge.ts declares these as NON-optional members of Sigma, but nothing provides '
  + 'them at runtime — TypeScript is promising an island something that is not there: '
  + a.bridge.missingRequired.join(', '));

ok(a.bridge.undeclared.length === 0,
  'these bridge members exist at runtime but are missing from the `Sigma` interface in '
  + 'app/src/bridge.ts, so an island calling one gets no type checking at all: '
  + a.bridge.undeclared.join(', '));

// The bridge is concatenated FIRST (build.mjs sorts js/src by numeric prefix) — that is what
// lets every entry be a lazy thunk over functions declared later in the bundle. A renumbered
// bridge would break `window.sigma` for anything that mounts early.
{
  const files = spawnSync('node', ['-e', "process.stdout.write(require('fs').readdirSync('js/src').filter(f=>f.endsWith('.js')).sort().join(','))"], { cwd: ROOT, encoding: 'utf8' }).stdout;
  ok(files.split(',')[0] === '00-bridge.js',
    'js/src/00-bridge.js must sort FIRST in the concat order — every bridge entry depends on it');
}

// ════════════════════ (b) the bus ════════════════════
// An event with no listener is a write nobody hears; a listener with no emitter is a screen
// waiting for news that never comes. Both are invisible at runtime — no error, just a stale
// surface — which is exactly why they are asserted here.

/**
 * Emitted deliberately with no consumer. Each one is an ANNOUNCEMENT: the island that emits
 * already invalidates its own query, and the event exists so a surface added later can hear
 * about the write without the emitter learning who reads it. Adding a name here is a decision;
 * a new event that is simply unwired fails the build instead of going quiet.
 */
const ANNOUNCE_ONLY = new Map([
  ['checkin-created', 'islands/Field.tsx invalidates [checkins] itself; the row is what starts the 2 h visitCron clock server-side'],
  ['work-session-saved', 'components/home/WorkTimer.tsx invalidates its own key; ▶/■ שעות has no second surface yet'],
  ['kibbutzim-published', 'its one reader, islands/CommandBar.tsx, is deleted with Ctrl+K (round 5, X-L7); kept for the next surface that snapshots the list on open'],
]);

{
  const orphans = a.bus.orphanEmits.filter(n => !ANNOUNCE_ONLY.has(n));
  ok(orphans.length === 0,
    'these sigmaBus events are emitted and NOTHING listens — either wire a consumer or add the '
    + 'name to ANNOUNCE_ONLY in this file with the reason:\n    '
    + orphans.map(n => `${n}  (emitted at ${list(a.bus.emits.filter(e => e.name === n))})`).join('\n    '));
}

ok(a.bus.orphanListens.length === 0,
  'these sigmaBus events are listened for and NOTHING emits them — the surface will never '
  + 'refresh, and the typo is in the listener:\n    '
  + a.bus.orphanListens.map(n => `${n}  (listening at ${list(a.bus.listens.filter(l => l.name === n))})`).join('\n    '));

ok(a.bus.undocumented.length === 0,
  'these event names are used in code but missing from the `SigmaEvent` union in '
  + 'app/src/bridge.ts, so TypeScript cannot spell-check them: ' + a.bus.undocumented.join(', '));

ok(a.bus.unusedVocabulary.length === 0,
  'the `SigmaEvent` union declares names nothing uses — delete them or wire them: '
  + a.bus.unusedVocabulary.join(', '));

// Every event the plan's Task 18 list names, plus the ones the P4 tasks added, must be REAL.
// A renamed event that still has both halves would pass the two checks above while quietly
// breaking the contract this file was written to hold.
for (const name of [
  'user-changed', 'ems-cache-synced', 'visit-saved', 'visit-form-open', 'theme-changed',
  'notes-changed', 'checkin-created', 'dayplan-changed', 'internal-tasks-changed',
  'onboarding-changed', 'work-session-saved', 'kibbutzim-published', 'feedback-changed',
  'session-expired', 'ems-queue-flushed', 'attendance-saved', 'holidays-loaded',
  'visit-draft-changed', 'burns-changed',
]) {
  ok(a.bus.eventNames.includes(name), `the '${name}' bus event has disappeared from the code`);
  ok(a.bus.vocab.has(name), `'${name}' is missing from the SigmaEvent union in app/src/bridge.ts`);
}

// ════════════════════ (c) islands ════════════════════
// A placeholder with no mount is a hole in a page; a mount with no placeholder is dead code.

/** Mounted empty on purpose — §7l landings whose content is a later task (index.html says so). */
const EMPTY_ON_PURPOSE = new Set(['sigma-ceo']);

{
  const unmounted = a.islands.unmounted.filter(n => !EMPTY_ON_PURPOSE.has(n));
  ok(unmounted.length === 0,
    'index.html has these island placeholders and nothing ever mounts into them: ' + unmounted.join(', '));
}
ok(a.islands.phantom.length === 0,
  'app/src mounts into placeholders index.html does not have — the mount silently returns false: '
  + a.islands.phantom.join(', '));

// ════════════════════ (d) supabase tables ════════════════════
ok(a.tables.undeclared.length === 0,
  'the client reads or writes these tables and no db/*.sql declares them — a fresh environment '
  + 'would 404 on them:\n    '
  + a.tables.undeclared.map(n => `${n}  (${list(a.tables.used.filter(u => u.name === n))})`).join('\n    '));

// ════════════════════ (e) pages ════════════════════
// The universe of pages is everything the UI can ask for: showPage() call sites, the ⋯ sheet's
// MORE_PAGES, index.html's legacy nav, and canShowPage's own cases. Ctrl+K's page commands are
// gone with it (round 5, X-L7). A page needs all three of: somewhere to render, a gate, and a
// way in.
{
  const moreSheet = code('app/src/components/MoreSheet.tsx');
  const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const uiPages = new Set([
    ...a.pages.names,
    ...[...moreSheet.matchAll(/\{\s*page:\s*'([\w-]+)'/g)].map(m => m[1]),
    ...[...indexHtml.matchAll(/data-page="([\w-]+)"/g)].map(m => m[1]),
    ...a.pages.gated,
  ]);
  const views = new Set(a.pages.views.map(v => v.name));

  for (const page of [...uiPages].sort()) {
    // THE ONE THAT WAS CAUGHT: `pushlog` had a ⋯ row, a Ctrl+K entry, a canShowPage case, a
    // display toggle in showPage() and a renderPushLog() — and no #pushlog-view in index.html
    // after the 2.00 rewrite. showPage('pushlog') hid every other view and showed nothing.
    ok(views.has(page),
      `the UI can navigate to '${page}' but index.html has no #${page}-view — showPage() would `
      + 'hide every other view and put nothing in their place (a blank screen, no error)');
    ok(a.pages.gated.has(page),
      `'${page}' is reachable but has no case in canShowPage() (js/src/00-bridge.js) — the React `
      + 'nav cannot decide whether to show its entry, so it will show it to everyone');
  }

  // …and the reverse: showPage() has its OWN gate ladder, and the two must agree on the set of
  // pages. One of them knowing about a page the other does not is how a nav entry appears for
  // someone who is then bounced straight back to קיבוצים.
  const ladder = code('js/src/02-init-attendance.js');
  const showPageBody = ladder.slice(ladder.indexOf('function showPage'), ladder.indexOf('window._currentPage'));
  for (const page of [...a.pages.gated].sort()) {
    if (page === 'kibbutz') continue;      // the fallback everything redirects TO
    if (page === 'calendar') continue;     // visible to everyone; no redirect line by design
    ok(showPageBody.includes(`page === '${page}'`),
      `canShowPage() gates '${page}' but showPage() has no matching redirect — the nav would hide `
      + 'the entry while a deep link still opened the page');
  }
}

// ════════════════════ (f) edge functions ════════════════════
ok(a.fns.unknownFn.length === 0,
  'the client calls edge functions that do not exist in supabase/functions/: ' + a.fns.unknownFn.join(', '));

ok(a.fns.unknownMode.length === 0,
  'the client sends a `mode` the edge function does not implement — the request falls through '
  + 'to that function\'s default branch:\n    '
  + a.fns.unknownMode.map(c => `${c.fn} ← mode '${c.name}' (${at(c)})`).join('\n    '));

// The reverse for push-send specifically, per the plan: every mode the sender implements must
// have a caller, and the ones that do not must be cron-triggered on purpose.
{
  const CRON_ONLY = new Set(['attendanceCron', 'visitCron', 'usageDigest', 'approveOrder',
    // Task 10 (inventory spec §5.2): the DATABASE calls `inventoryAlert` — the movements
    // trigger, over pg_net — and pg_cron calls `inventoryDigest` hourly. No browser sends
    // either, by design: a client must not be able to make two people's phones buzz.
    'inventoryAlert', 'inventoryDigest',
    // ⏱ 22.9: pg_cron calls `timerStale` every five minutes (db/cron_timer_5min.sql). No
    // browser sends it — the whole point is that the reminder about a clock left running
    // reaches the phone with no screen open anywhere.
    'timerStale']);
  const stranded = a.fns.pushServerOnly.filter(m => !CRON_ONLY.has(m));
  ok(stranded.length === 0,
    'push-send implements modes nothing sends and that are not cron-only: ' + stranded.join(', '));
  for (const m of CRON_ONLY) {
    ok(a.fns.pushServer.has(m), `push-send no longer implements the cron mode '${m}'`);
  }
}

// ════════════════════ (g) the ⋯ registry ════════════════════
{
  const dynamic = a.registry.filter(r => r.name === '(dynamic)' && !r.file.endsWith('lib/registry.ts'));
  ok(dynamic.length === 0,
    'a registerMoreItem() call with no literal id — the sheet cannot de-duplicate it:\n    ' + list(dynamic));

  const items = a.registry.filter(r => r.name !== '(dynamic)');
  ok(items.length > 0, 'the ⋯ sheet registry is empty — no island registers a row');

  // Every row must name an icon the Nav can actually resolve; an unknown name renders nothing
  // and the row looks broken rather than missing.
  const icons = a.registryIcons;
  if (icons && icons.size) {
    const bad = items.filter(r => r.icon && !icons.has(r.icon));
    ok(bad.length === 0,
      'these ⋯ rows name a lucide icon Nav.tsx does not import:\n    '
      + bad.map(r => `${r.name} → ${r.icon} (${at(r)})`).join('\n    '));
  }
}

// ════════════════════ cross-feature propagation ════════════════════
// The plan's propagation list, asserted structurally: for each "X happened → Y must refresh",
// the WIRE has to exist. This is not a runtime simulation — mounting nineteen islands under a
// DOM stub would test the stub. It asserts the only thing that can silently disappear: that
// the consumer named in the contract still subscribes to the event named in the contract.

const consumersOf = name => a.bus.listens.filter(l => l.name === name).map(l => l.file);
const emittersOf = name => a.bus.emits.filter(e => e.name === name).map(e => e.file);

/** [event, who must still emit it, who must still consume it] */
const PROPAGATION = [
  // visit saved → the card's last visit + open items, the gaps list, the calendar day panel,
  // the attendance grid (a field day is made of visits)
  ['visit-saved', ['js/src/09-visits.js'], ['app/src/islands/Attendance.tsx']],
  // EMS cache synced → the cards' EMS block, the connection gate, the calendar's EMS layer
  ['ems-cache-synced', ['js/src/13-ems.js'], ['app/src/bridge.ts', 'app/src/components/home/EmsTasks.tsx']],
  // kibbutz list published — no current consumer (round 5, X-L7: its one reader, Ctrl+K's
  // CommandBar.tsx, is deleted); kept in the bus vocabulary for the next snapshot reader.
  // day plan reordered in the calendar → the arrival sheet and the "היום" strip
  ['dayplan-changed', ['app/src/islands/Calendar.tsx'], ['app/src/islands/Field.tsx']],
  // meeting notes imported / linked / done → the cards, the modal tab, the briefing
  ['notes-changed', ['app/src/components/home/MeetingNotes.tsx'], ['app/src/components/home/MeetingNotes.tsx']],
  // theme / font changed → the toggle and the toaster follow (islands + legacy read the attr)
  ['theme-changed', ['app/src/lib/theme.ts'], ['app/src/components/ThemeToggle.tsx']],
  // user changed → the nav's roles, the quick actions, the ➕ visibility, the EMS gate
  ['user-changed', ['js/src/11-search-login.js'], ['app/src/bridge.ts']],
  // a 401 anywhere → exactly one re-login sheet
  ['session-expired', ['js/src/00-bridge.js'], ['app/src/components/ReLoginSheet.tsx']],
  // the outbound EMS queue drained → a note stamped pending:<id> picks up its real task id
  ['ems-queue-flushed', ['js/src/13-ems.js'], ['app/src/components/home/MeetingNotes.tsx']],
  // a day was filed from either half → the month grid, the KPIs, the missing chips
  ['attendance-saved', ['js/src/04-attendance-daily.js'], ['app/src/islands/Attendance.tsx']],
  // the 🕎 list landed → the island's six-hour cache must not keep an empty list
  ['holidays-loaded', ['js/src/04-attendance-daily.js'], ['app/src/islands/Attendance.tsx']],
  // a 🔥 burn was marked → the chip, the modal section, the strip, and the legacy table.
  // The emit call moved to lib/burnsData.ts in round 5 G-L2 (Burns.tsx now re-exports it).
  ['burns-changed', ['app/src/lib/burnsData.ts'], ['js/src/24-meter-burns.js']],
  // a feedback was sent or triaged → the 📣 inbox
  ['feedback-changed', ['app/src/islands/Feedback.tsx'], ['app/src/islands/FeedbackInbox.tsx']],
];

for (const [event, emitters, consumers] of PROPAGATION) {
  const es = emittersOf(event), cs = consumersOf(event);
  for (const f of emitters) {
    ok(es.includes(f), `propagation broken: ${f} no longer emits '${event}' (emitters now: ${es.join(', ') || 'none'})`);
  }
  for (const f of consumers) {
    ok(cs.includes(f), `propagation broken: ${f} no longer consumes '${event}' (consumers now: ${cs.join(', ') || 'none'})`);
  }
}

// ── the same question for the query cache ──────────────────────────────────────────────────
// Some propagation is a shared TanStack key rather than an event: the writer invalidates, every
// reader of that key repaints. A key spelled two ways is the same class of silent failure.
{
  const src = ['app/src/islands/Field.tsx', 'app/src/components/home/MeetingNotes.tsx'];
  for (const f of src) {
    ok(/invalidateQueries/.test(code(f)),
      `${f} writes but never invalidates a query key — its readers would keep the stale rows`);
  }
}

// ════════════════════ gates that are about wiring, not features ════════════════════

// The two permission gates that exist in two copies on purpose (the bridge answers, the island
// has a fallback for the seconds before the legacy bundle evaluates) must list the same people.
{
  const bridge = code('js/src/00-bridge.js');
  const body = bridge.slice(bridge.indexOf('function canManageStaff'), bridge.indexOf('window.canManageStaff'));
  const bridgeNames = new Set([...body.matchAll(/'([֐-׿]+)'/g)].map(m => m[1]));
  ok(bridgeNames.size > 0, 'canManageStaff no longer names anyone — has it been rewritten?');
  // The bridge reaches עידן through `isIdan()` rather than by name, so the island's literal
  // fallback is the bridge's literal names PLUS him.
  ok(/isIdan/.test(body), 'canManageStaff must still fold in isIdan() — the island fallback assumes it');
  const expected = [...new Set([...bridgeNames, 'עידן'])].sort();
  for (const f of ['app/src/islands/Presenter.tsx', 'app/src/islands/DevPresenter.tsx']) {
    const fn = code(f);
    const slice = fn.slice(fn.indexOf('function isAdminNow'), fn.indexOf('function isAdminNow') + 400);
    const names = new Set([...slice.matchAll(/'([֐-׿]+)'/g)].map(m => m[1]));
    assert.deepStrictEqual([...names].sort(), expected,
      `${f}'s isAdminNow fallback has drifted from canManageStaff() in js/src/00-bridge.js — `
      + 'the two are copies of one permission rule and must name the same people');
    checks++;
  }
}

// `devArg()` builds a value that is HTML-decoded and THEN parsed as JavaScript, inside a
// double-quoted attribute. A GitHub issue title carrying a double quote used to end the
// attribute early (ledger: filed from Task 11 as a repo-wide convention fix).
{
  const src = code('js/src/18-dev-tasks.js');
  const devEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = src.slice(src.indexOf('function devArg'), src.indexOf('function devArg') + 400);
  ok(/&quot;/.test(body),
    'js/src/18-dev-tasks.js devArg() must escape `"` — it is interpolated into onclick="fn(\'…\')" '
    + 'and a topic name with a double quote would close the attribute');
  // …and the ORDER: the JS-string escaping has to survive HTML decoding, so devEsc must NOT
  // turn a quote into an entity (the browser would decode it back and break the JS string).
  ok(!/&#39;|&quot;/.test(devEsc(`a'b"c`)),
    'devEsc must not entity-escape quotes — devArg JS-escapes them, and HTML decoding runs first');
}

// ── every inline handler argument goes through an approved escaper (audit C #6/#7) ──
// `onclick="fn('${x}')"` is a DOUBLE context: the browser HTML-decodes the attribute and only
// then parses it as JavaScript. Escaping only `'` (11-search-login.js) or only `"` as an
// entity (09-visits.js) both left the hole open — a kibbutz or product name carrying the other
// quote broke out of the string or ended the attribute. There is no way to see that by reading
// one line, so this sweep reads all 39 of them.
//
// Three ways for a value to be acceptable:
//   1. it IS a call to an approved escaper — `jsArgEsc(x)`, `devArg(x)`, `attJsStr(x)`, …
//   2. it is a local assigned from one in the same file (`const arg = jsArgEsc(p);`)
//   3. it cannot carry user text at all — a database id, a loop index, a boolean, or a value
//      the code itself chose from a fixed set. Those are listed below, each with its reason.
{
  const ESCAPER = /^(jsArgEsc|devArg|attJsStr|attrEsc|certEsc|calEsc|emsEsc|_staffEsc|burnAttr)\s*\(/;
  /** Identifiers/paths that provably cannot carry user text. */
  const NOT_USER_TEXT = [
    // Supabase/Sheets row ids: uuid or integer, never typed by a person.
    /^[\w.]+\.id$/,
    // loop counters and numbers built in the same expression
    /^(i|idx|ci|n|year|month|day|qty|available|maxAllowed)$/,
    // a boolean the code computed
    /^!?[\w.]+\.(active|done|open)$/,
    // ids.join(',') — an array of integer message ids (17-messages.js)
    /^ids\.join\(','\)$/,
    // the next status the code picked from its own fixed table (07-orders.js orderQuick)
    /^quick\.next$/,
    // `it.onClick` (11-search-login.js) and `act` (04-attendance-daily.js:296) are whole
    // handler EXPRESSIONS the file just built, with every argument inside them already run
    // through jsArgEsc / attJsStr. Escaping them again would escape the JavaScript itself.
    /^it\.onClick$/,
    /^act$/,
  ];
  const offenders = [];
  for (const f of walk('js/src', n => n.endsWith('.js'))) {
    const src = code(f);
    // locals assigned from an approved escaper, e.g. `const arg = jsArgEsc(p);`
    const safeLocals = new Set(
      [...src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*\(/g)]
        .filter(m => ESCAPER.test(m[2] + '('))
        .map(m => m[1]));
    src.split('\n').forEach((line, i) => {
      const handler = /\bon[a-z]+\s*=\s*"([^"]*)"/gi;
      let h;
      while ((h = handler.exec(line))) {
        for (const m of h[1].matchAll(/\$\{([^}]*)\}/g)) {
          const expr = m[1].trim();
          if (ESCAPER.test(expr)) continue;
          if (safeLocals.has(expr)) continue;
          if (NOT_USER_TEXT.some(re => re.test(expr))) continue;
          offenders.push(`${f}:${i + 1}  \${${expr}}  in  ${h[0].slice(0, 70)}`);
        }
      }
    });
  }
  ok(offenders.length === 0,
    'these inline handlers interpolate a value that no approved escaper produced. In '
    + 'onclick="fn(\'${x}\')" the value is HTML-decoded and THEN parsed as JS, so it needs '
    + 'jsArgEsc() (js/src/00-bridge.js); a plain attribute needs attrEsc(). If the value truly '
    + 'cannot carry user text, add it to NOT_USER_TEXT in this file WITH the reason:\n    '
    + offenders.join('\n    '));

  // …and the two shared helpers must keep their shape, in the right order.
  const bridge = code('js/src/00-bridge.js');
  const jsArg = bridge.slice(bridge.indexOf('function jsArgEsc'), bridge.indexOf('window.attrEsc'));
  ok(/&quot;/.test(jsArg),
    'js/src/00-bridge.js jsArgEsc() must turn `"` into &quot; — otherwise a name with a double '
    + 'quote ends the onclick attribute early (audit C #6/#7)');
  ok(jsArg.indexOf("\\'") < jsArg.indexOf('&quot;'),
    'jsArgEsc() must JS-escape the apostrophe BEFORE entity-escaping the double quote; the '
    + 'apostrophe must never become an entity, because HTML decoding runs before JS parsing');
  const attr = bridge.slice(bridge.indexOf('function attrEsc'), bridge.indexOf('function jsArgEsc'));
  for (const ent of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
    ok(attr.includes(ent), `js/src/00-bridge.js attrEsc() must escape ${ent}`);
  }
}

// ════════════════════ (h) the EMS gateway (§7o) ════════════════════
// "No feature imports fetch/emsApi directly — a contract test greps for it." The EMS is about
// to grow an MCP server; the whole point of EmsGateway is that the swap touches one adapter
// and nothing else. A direct call added anywhere else is what would quietly make that false.

ok(a.ems.stray.length === 0,
  'direct EMS call(s) outside app/src/lib/ems/adapters/ and outside the migration allowlist '
  + '(scripts/integration-map.mjs EMS_LEGACY_ALLOWLIST) — use `emsGateway()` (spec §7o):\n    '
  + a.ems.stray.map(h => `${at(h)}  ${h.text.slice(0, 90)}`).join('\n    '));

ok(a.ems.staleAllowlist.length === 0,
  'EMS_LEGACY_ALLOWLIST names files that no longer call the EMS at all — delete the line so the '
  + 'list keeps meaning "still to migrate": ' + a.ems.staleAllowlist.join(', '));

ok(a.ems.adapter.length > 0,
  'no EMS call left in app/src/lib/ems/adapters/ — the REST adapter must be the one place that '
  + 'talks to the EMS; if it stopped, every operation is a no-op');

// `sigma.ems` is INSTALLED by the React bundle (one gateway instance shared with legacy), so
// the bridge object must NOT re-implement the operations — two implementations would drift.
{
  const bridge = code('js/src/00-bridge.js');
  ok(!/^\s{6}ems\s*:/m.test(bridge),
    'js/src/00-bridge.js must not define an `ems:` member — app/src/lib/ems/gateway.ts '
    + '`installEmsBridge()` publishes the single EmsGateway instance as `sigma.ems`');
  ok(/emsWrite\s*:/.test(bridge),
    'js/src/00-bridge.js must expose `emsWrite` — the gateway createTask/updateTask/addComment '
    + 'go through it so the offline queue semantics stay exactly as they were');
  ok(/installEmsBridge\(\)/.test(code('app/src/main.tsx')),
    'app/src/main.tsx must call installEmsBridge() on boot — without it `sigma.ems` is undefined '
    + 'and legacy has no typed way to reach the EMS');
}

// The queue must understand every kind the gateway can write, or a queued operation replays
// as a silent no-op (emsSendItem returns undefined → the flush counts it as sent and drops it).
{
  const rest = code('app/src/lib/ems/adapters/rest.ts');
  const send = code('js/src/13-ems.js');
  for (const kind of [...new Set([...rest.matchAll(/kind:\s*'([a-zA-Z]+)'/g)].map(m => m[1]))]) {
    ok(send.includes(`item.kind === '${kind}'`),
      `the gateway writes queue items of kind '${kind}' but js/src/13-ems.js emsSendItem does not `
      + 'handle it — the flush would drop the operation and report it as sent');
  }
}

// One re-login surface for the whole app (§7n): exactly one placeholder, one mount.
ok(a.islands.placeholders.filter(p => p.name === 'sigma-relogin').length === 1,
  'index.html must have exactly one #sigma-relogin — two sheets would both answer a 401');

// ════════════════════ Ctrl+K is gone (round 5, X-L7) ════════════════════
{
  ok(!existsSync(new URL('./app/src/islands/CommandBar.tsx', import.meta.url)),
    'CommandBar.tsx must not exist');
  ok(!existsSync(new URL('./app/src/lib/commands.ts', import.meta.url)),
    'commands.ts must not exist');
  const srcFilter = f => /\.(ts|tsx|js)$/.test(f);
  const haystack = [
    ...walk('app/src', srcFilter), ...walk('js/src', srcFilter),
  ].map(f => code(f)).join('\n') + readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  for (const dead of ['openCommandBar', 'sigma-open-command-bar']) {
    ok(!haystack.includes(dead), `'${dead}' must not appear anywhere — Ctrl+K is deleted`);
  }
  ok(!/id=(["'])sigma-command\1/.test(haystack), "'sigma-command' (the old DOM id) must not appear");
  ok(!/key\s*===\s*['"]k['"][\s\S]{0,80}(ctrlKey|metaKey)|(?:ctrlKey|metaKey)[\s\S]{0,80}key\s*===\s*['"]k['"]/i.test(haystack),
    'no Ctrl/Cmd+K keydown listener may remain');
  // What X-L7 keeps: cmdk itself, because Calendar.tsx still uses it.
  ok(existsSync(new URL('./app/src/components/ui/command.tsx', import.meta.url)),
    'components/ui/command.tsx must stay — Calendar.tsx uses it');
  ok(code('app/src/islands/Calendar.tsx').includes("from '@/components/ui/command'"),
    'Calendar.tsx must still import components/ui/command');
}

console.log(`✅ test-integration: ${checks} contracts green — bridge (${a.bridge.keys.size} entries, `
  + `${a.bridge.uses.length} call sites) · bus (${a.bus.eventNames.length} events) · `
  + `islands (${new Set(a.islands.placeholders.map(p => p.name)).size}) · tables (${a.tables.names.length}) · `
  + `pages (${a.pages.gated.size}) · edge functions (${a.fns.byFn.size}) · ⋯ rows (${a.registry.length})`);

// The generated document must match the tree it describes — the whole point of generating it.
{
  const r = spawnSync(process.execPath, ['scripts/integration-map.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0,
    'docs/integration-map.md is stale — run `node scripts/integration-map.mjs` and commit it.\n' + (r.stderr || ''));
}
