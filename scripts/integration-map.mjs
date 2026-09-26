// scripts/integration-map.mjs — the integration map, GENERATED from the code.
//
// Task 18a. docs/integration-map.md was hand-maintained until now, which means it was wrong the
// moment a task forgot to edit it (Task 4 left `flatWithHeadings` in it for a function that had
// been renamed `rankedRows`). This module derives the map from the source and appends the
// hand-written prose — the "why", which no grep can produce — from
// docs/integration-map.annotations.md.
//
//   node scripts/integration-map.mjs            → rewrite docs/integration-map.md
//   node scripts/integration-map.mjs --check    → fail when the file on disk is stale
//   import { analyze } from './integration-map.mjs'  → the facts, for test-integration.mjs
//
// It is deliberately a LEXER, not a parser: regexes over the source text, with comments blanked
// out first. The repo's own conventions (one `window.sigma = {` literal, `sigmaEmit('x')`,
// `useSigmaEvent('x')`, `.from('table')`, `functions/v1/<fn>`) are stable enough that a real
// parser would buy nothing and cost a dependency.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const NL = String.fromCharCode(10);
const BLOCK_COMMENT = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
const LINE_COMMENT = new RegExp('(^|[^:\\w])//[^' + NL + ']*', 'gm');
const NOT_NL = new RegExp('[^' + NL + ']', 'g');

/**
 * The file's text with comments blanked out, length and newlines preserved so line numbers
 * still hold. Without this the sweep "finds" `showPage('ems')` inside a comment that says the
 * page is RETIRED, and reads `pm-sigma.github.io` in a doc-comment as `sigma.github()`.
 */
const codeCache = new Map();
export function code(p) {
  if (!codeCache.has(p)) {
    codeCache.set(p, read(p)
      .replace(BLOCK_COMMENT, (m) => m.replace(NOT_NL, ' '))
      .replace(LINE_COMMENT, (m, a) => a + ' '.repeat(m.length - a.length)));
  }
  return codeCache.get(p);
}

/** Every file under a directory matching a filter, as repo-relative posix paths. */
export function walk(dir, filter = () => true, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(rel, filter, out); }
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

function lineOf(text, needle) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return 0;
}

/**
 * Every hit of a regex across files, as {name, file, line, text}. `span` lines of lookahead are
 * joined before matching, so a pattern may cross a line break; only a match that STARTS on the
 * current line is counted, so nothing is reported twice.
 */
function hits(files, re, { span = 1, group = 1, raw = false } = {}) {
  const out = [];
  for (const f of files) {
    const lines = (raw ? read(f) : code(f)).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const hay = lines.slice(i, i + span).join(NL);
      const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = r.exec(hay))) {
        if (hay.slice(0, m.index).includes(NL)) continue;
        // alternation patterns ("a quoted literal OR an UPPER_CASE constant") capture into
        // several groups; the name is the first one that actually matched.
        const name = m[group] !== undefined ? m[group] : m.slice(1).find(g => g !== undefined);
        out.push({ name, file: f, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return out;
}

const isTest = (f) => /\.(test|spec)\.tsx?$/.test(f);
const APP_FILES = () => walk('app/src', f => /\.(ts|tsx)$/.test(f) && !isTest(f));
const APP_FILES_ALL = () => walk('app/src', f => /\.(ts|tsx)$/.test(f));
const LEGACY_FILES = () => walk('js/src', f => f.endsWith('.js')).sort();
const FN_FILES = () => walk('supabase/functions', f => f.endsWith('.ts'));

// ══════════════════════════ (a) the bridge ══════════════════════════

/** Top-level keys of the single `window.sigma = { … }` literal in 00-bridge.js. */
export function bridgeKeys() {
  const src = read('js/src/00-bridge.js');
  const at = src.indexOf('window.sigma = {');
  if (at === -1) throw new Error('00-bridge.js: no `window.sigma = {` literal found');
  const lines = src.slice(at).split(/\r?\n/);
  const startLine = src.slice(0, at).split(/\r?\n/).length;
  const keys = new Map();
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = depth === 1 && /^ {6}(?:get )?([A-Za-z_$][\w$]*)\s*[:(]/.exec(l);
    if (m) keys.set(m[1], { file: 'js/src/00-bridge.js', line: startLine + i });
    for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0 && i > 0) break;
  }
  return keys;
}

/** The `Sigma` interface in app/src/bridge.ts → name → { optional }. */
export function sigmaInterface() {
  const src = code('app/src/bridge.ts');
  const at = src.indexOf('export interface Sigma');
  if (at === -1) throw new Error('app/src/bridge.ts: no `export interface Sigma`');
  const lines = src.slice(at).split(/\r?\n/);
  const startLine = src.slice(0, at).split(/\r?\n/).length;
  const out = new Map();
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = depth === 1 && /^ {2}(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??)\s*[(:]/.exec(lines[i]);
    if (m) out.set(m[1], { optional: m[2] === '?', file: 'app/src/bridge.ts', line: startLine + i });
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0 && i > 0) break;
  }
  return out;
}

/**
 * Bridge members an ISLAND installs at mount — the extension points (`sigma.toast` becomes
 * Sonner, `sigma.openCommandBar`, `sigma.presenterStrip`, `sigma.healthBands`, `sigma.onLanding`).
 * Recognised by "an assignment to a property whose name the `Sigma` interface declares".
 */
export function bridgeExtensions() {
  const declared = sigmaInterface();
  const re = /\.\s*([A-Za-z_$][\w$]*)\s*=\s*(?!=)/;
  return hits([...APP_FILES(), ...LEGACY_FILES()], re).filter(h => declared.has(h.name));
}

/** `sigma.<fn>` references from the React side (never `-sigma.` / `/sigma.` / `ui/sigma.js`). */
export function bridgeUses() {
  return hits(APP_FILES_ALL(), /(?:^|[^\w$\-/.])sigma\s*\??\.\s*([A-Za-z_$][\w$]*)/)
    .filter(h => !/^(js|css|ts|tsx|map)$/.test(h.name));
}

/** Legacy function names the bridge forwards to: call('x') / fn('x'). */
export function bridgeForwards() {
  return hits(['js/src/00-bridge.js'], /\b(?:call|fn)\(\s*'([A-Za-z_$][\w$]*)'/);
}

/** Every function name defined anywhere in the legacy concat, with the file it lands in. */
export function legacyDefs() {
  const defs = new Map();
  for (const f of LEGACY_FILES()) {
    const lines = code(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^\s*window\.([A-Za-z_$][\w$]*)\s*=|^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/.exec(lines[i]);
      if (m) { const n = m[1] || m[2] || m[3]; if (!defs.has(n)) defs.set(n, { file: f, line: i + 1 }); }
    }
  }
  return defs;
}

// ══════════════════════════ (b) the bus ══════════════════════════
const BUS_FILES = () => [...LEGACY_FILES(), ...APP_FILES_ALL()];

/**
 * `export const NOTES_CHANGED = 'notes-changed'` → NOTES_CHANGED: 'notes-changed'.
 * Half the islands emit through a named constant, and a sweep that only reads string literals
 * declares those events orphaned — which is exactly the false alarm this file exists to avoid.
 */
export function eventConstants() {
  const out = new Map();
  for (const h of hits(APP_FILES_ALL(), /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*['"]([\w-]+)['"]/, { group: 1 })) {
    const m = /const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*['"]([\w-]+)['"]/.exec(h.text);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

const resolveNames = (list, consts) =>
  list.map(h => (consts.has(h.name) ? { ...h, name: consts.get(h.name), via: h.name } : h))
    // A bare identifier we could not resolve is not an event name — drop it rather than invent
    // one. And every bus event in this app is kebab-case (`visit-saved`), which is what lets
    // the patterns below accept a local alias for the bus (`bus?.addEventListener`, which is
    // how ReLoginSheet and lib/session.ts reach it) without also collecting `click` and
    // `keydown` from ordinary DOM listeners in the same files.
    .filter(h => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(h.name));

export function busEmits(consts = eventConstants()) {
  return resolveNames([
    ...hits(BUS_FILES(), /\bsigmaEmit\s*\??\.?\s*\(\s*(?:'([\w-]+)'|"([\w-]+)"|([A-Z][A-Z0-9_]{2,}))/),
    ...hits(BUS_FILES(), /(?:sigmaBus|bus\(\)|bus)\s*\??\.\s*dispatchEvent\(\s*new CustomEvent\(\s*(?:'([\w-]+)'|"([\w-]+)"|([A-Z][A-Z0-9_]{2,}))/, { span: 3 }),
  ], consts);
}

export function busListens(consts = eventConstants()) {
  return resolveNames([
    ...hits(BUS_FILES(), /\buseSigmaEvent\(\s*(?:'([\w-]+)'|"([\w-]+)"|([A-Z][A-Z0-9_]{2,}))/),
    ...hits(BUS_FILES(), /(?:sigmaBus|bus\(\)|bus)\s*\??\.\s*addEventListener\(\s*(?:'([\w-]+)'|"([\w-]+)"|([A-Z][A-Z0-9_]{2,}))/, { span: 3 }),
  ], consts);
}

/** The declared vocabulary: the `SigmaEvent` union in app/src/bridge.ts. */
export function busVocabulary() {
  const src = code('app/src/bridge.ts');
  const at = src.indexOf('export type SigmaEvent');
  if (at === -1) throw new Error('app/src/bridge.ts: no `export type SigmaEvent`');
  const end = src.indexOf(';', at);
  return new Set([...src.slice(at, end).matchAll(/'([\w-]+)'/g)].map(m => m[1]));
}

// ══════════════════════════ (c) islands ══════════════════════════
export function htmlPlaceholders() {
  const lines = read('index.html').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const r = /id="(sigma-[\w-]+)"/g; let m;
    while ((m = r.exec(lines[i]))) out.push({ name: m[1], file: 'index.html', line: i + 1 });
  }
  return out;
}

/**
 * Where an island is actually attached. `main.tsx` mounts most of them, but a lazily-opened
 * island (the meeting review, the re-login sheet) calls `mount('sigma-x', C)` from its own
 * file, so the sweep has to look at every island source — otherwise it reports a mounted
 * island as orphaned and the contract cries wolf.
 */
export function mainMounts() {
  return hits(APP_FILES(), /(?:getElementById|mount)\(\s*['"](sigma-[\w-]+)['"]/);
}

// ══════════════════════════ (d) supabase tables ══════════════════════════
export function tablesUsed() {
  const files = [...APP_FILES(), ...LEGACY_FILES(), ...FN_FILES()];
  return hits(files, /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]/)
    .filter(h => !/\.storage\b|storage\s*$/.test(h.text.slice(0, h.text.indexOf('.from('))));
}

export function tablesDeclared() {
  const decl = new Map();
  for (const f of walk('db', f => f.endsWith('.sql'))) {
    const text = read(f);
    const r = /(?:create\s+(?:table|view|materialized\s+view)(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?)\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)/gi;
    let m;
    while ((m = r.exec(text))) if (!decl.has(m[1])) decl.set(m[1], { file: f, line: lineOf(text, m[0]) });
  }
  return decl;
}

// ══════════════════════════ (e) pages ══════════════════════════
export function pageTargets() {
  return hits([...LEGACY_FILES(), ...APP_FILES()], /showPage\(\s*['"]([\w-]+)['"]/);
}

export function pageViews() {
  const lines = read('index.html').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const r = /id="([\w-]+)-view"/g; let m;
    while ((m = r.exec(lines[i]))) out.push({ name: m[1], file: 'index.html', line: i + 1 });
  }
  return out;
}

/** The single gate: 00-bridge.js `canShowPage`. */
export function gatedPages() {
  const src = code('js/src/00-bridge.js');
  const body = src.slice(src.indexOf('function canShowPage'), src.indexOf('window.sigma = {'));
  return new Set([...body.matchAll(/case\s+'([\w-]+)'/g)].map(m => m[1]));
}

/** Where a page is reachable from in the UI: the React nav / ⋯ sheet / header. */
export function navTargets() {
  return hits(APP_FILES(), /showPage\(\s*['"]([\w-]+)['"]/);
}

// ══════════════════════════ (f) edge functions + push modes ══════════════════════════
/** Every `functions/v1/<fn>` call site, with the `mode:` literal in the request body. */
export function fnCalls() {
  const out = [];
  for (const f of [...LEGACY_FILES(), ...APP_FILES_ALL()]) {
    const lines = code(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = /functions\/v1\/([\w-]+)/.exec(lines[i]);
      if (!m) continue;
      const near = lines.slice(i, i + 14).join(NL);
      const modes = [...new Set([...near.matchAll(/\bmode:\s*['"]([\w-]+)['"]/g)].map(x => x[1]))];
      if (!modes.length) out.push({ fn: m[1], name: '(default)', file: f, line: i + 1 });
      for (const mo of modes) out.push({ fn: m[1], name: mo, file: f, line: i + 1 });
    }
  }
  return out;
}

/** The modes one edge function implements, or null when there is no such function. */
export function fnModes(fn) {
  const f = `supabase/functions/${fn}/index.ts`;
  if (!exists(f)) return null;
  const text = code(f);
  return new Set([
    ...[...text.matchAll(/\bmode\s*===\s*['"]([\w-]+)['"]/g)].map(m => m[1]),
    ...[...text.matchAll(/case\s+['"]([\w-]+)['"]:/g)].map(m => m[1]),
  ]);
}

// ══════════════════════════ (g) registry ══════════════════════════
export function registryItems() {
  const out = [];
  for (const f of APP_FILES()) {
    const lines = code(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/registerMoreItem\(/.test(lines[i])) continue;
      const near = lines.slice(i, i + 10).join(NL);
      const id = /\bid:\s*['"]([\w-]+)['"]/.exec(near);
      out.push({
        name: id ? id[1] : '(dynamic)',
        onSelect: /\bonSelect:/.test(near),
        icon: /\bicon:\s*['"]([\w]+)['"]/.exec(near)?.[1] || '',
        file: f, line: i + 1,
      });
    }
  }
  return out;
}

/** The lucide icon names the ⋯ sheet may render (Nav resolves them from this map). */
export function registryIcons() {
  const f = 'app/src/components/Nav.tsx';
  if (!exists(f)) return null;
  const src = code(f);
  const at = src.indexOf('ICONS');
  if (at === -1) return null;
  return new Set([...src.slice(at, at + 2000).matchAll(/([A-Z][A-Za-z0-9]*)\s*[,:}]/g)].map(m => m[1]));
}

// ══════════════════════════ (h) the EMS gateway (spec §7o) ══════════════════════════

/**
 * Every place the EMS is reached. Since Task 18b there is supposed to be exactly ONE:
 * `app/src/lib/ems/adapters/*`. Anything else is either a legacy file still awaiting the
 * migration (ALLOWED below, with the reason) or a regression the contract test fails on.
 *
 * "Reaching the EMS" is `emsApi(` (the Apps-Script proxy), `emsWrite(` (the queue-aware write —
 * a feature calls `emsGateway()`'s typed methods instead; package M's review round caught
 * `meetingClose.ts` calling `sigma.emsWrite` directly and moved it onto `addComment`/`updateTask`)
 * or a `fetch(` whose URL mentions the EMS base — in the browser bundles and in the Deno edge
 * functions alike.
 */
export const EMS_ADAPTER_DIR = 'app/src/lib/ems/adapters/';

/**
 * Legacy call sites the gateway does NOT yet own, each with why. Moving one means deleting
 * its line here; a file that leaves the list and comes back fails the contract test.
 */
export const EMS_LEGACY_ALLOWLIST = {
  'js/src/12-reports.js': 'the proxy ITSELF — emsApi()/emsProxyCall() are the REST transport the adapter calls',
  'js/src/13-ems.js': 'the offline queue + cache crawl (emsSendItem/emsSyncCache); replays queued OPERATIONS, so it moves with the queue, not before it',
  'js/src/14-calendar.js': 'the legacy EMS tab (create/patch/comments/sites/users/meter lookup) — a UI rewrite, not a call swap',
  'js/src/15-login-gate.js': 'login / verify-otp / resend-otp — the auth operations; they run BEFORE there is a session for the gateway to use',
  'app/src/bridge.ts': 'the TYPE DECLARATION of the adapter transport (`emsApi(path: string…)`), not a call site',
  // Fix round 3 (F14 ⑥): the login probe the Deno functions share now lives in ONE file.
  'supabase/functions/_shared/http.ts': 'Deno emsValid() login probe — the ONE copy the edge functions import (spec §7o "server side too")',
  'supabase/functions/calendar/index.ts': 'Deno emsValid() login probe — needs the Deno build of the adapter (spec §7o "server side too")',
  'supabase/functions/clockify/index.ts': 'Deno emsValid() login probe',
  'supabase/functions/ems-auth/index.ts': 'Deno — mints the bridge JWT; IS the login operation',
  'supabase/functions/github/index.ts': 'Deno emsValid() login probe',
  'supabase/functions/parse-daylog/index.ts': 'Deno emsValid() login probe',
  'supabase/functions/parse-order/index.ts': 'Deno emsValid() login probe',
  'supabase/functions/transcribe/index.ts': 'Deno emsValid() login probe',
  'supabase/functions/push-send/index.ts': 'Deno — the digest crawl runs on a cron with no browser bridge',
};

export function emsCallSites() {
  const files = [...APP_FILES_ALL(), ...LEGACY_FILES(), ...FN_FILES()];
  // `/v1/audio/transcriptions` is ElevenLabs, not the EMS — the resource list keeps the
  // scan on EMS endpoints only.
  const re = /(?:^|[^\w$.])emsApi\s*\(|emsProxyCall\s*\(|emsWrite\s*\(|EMS_API_BASE|\/v1\/(?:employee-tasks|sites|meters|users|auth)/;
  const seen = new Set();
  const all = hits(files, re, { group: 0 })
    .map(h => ({ ...h, name: h.text.slice(0, 120) }))
    .filter(h => { const k = h.file + ':' + h.line; if (seen.has(k)) return false; seen.add(k); return true; });
  const adapter = all.filter(h => h.file.startsWith(EMS_ADAPTER_DIR));
  const rest = all.filter(h => !h.file.startsWith(EMS_ADAPTER_DIR));
  return {
    adapter,
    allowed: rest.filter(h => EMS_LEGACY_ALLOWLIST[h.file]),
    // The whole point: a NEW direct EMS call, in a file nobody signed off on.
    stray: rest.filter(h => !EMS_LEGACY_ALLOWLIST[h.file]),
    allowlist: EMS_LEGACY_ALLOWLIST,
    // An allowlist entry whose file no longer calls the EMS at all — delete the line.
    staleAllowlist: Object.keys(EMS_LEGACY_ALLOWLIST).filter(f => !rest.some(h => h.file === f)),
  };
}

// ══════════════════════════ the whole picture ══════════════════════════
export function analyze() {
  const keys = bridgeKeys();
  const ext = bridgeExtensions();
  const iface = sigmaInterface();
  const defs = legacyDefs();
  const uses = bridgeUses();
  const forwards = bridgeForwards();
  const provided = new Set([...keys.keys(), ...ext.map(e => e.name)]);

  const ems = emsCallSites();
  const emits = busEmits(), listens = busListens(), vocab = busVocabulary();
  const eventNames = [...new Set([...emits, ...listens].map(h => h.name))].sort();

  const used = tablesUsed(), declared = tablesDeclared();
  const calls = fnCalls();
  const fnDirs = new Set(exists('supabase/functions')
    ? fs.readdirSync(path.join(ROOT, 'supabase/functions'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    : []);

  return {
    bridge: {
      keys, ext, iface, uses, forwards, defs, provided,
      missing: uses.filter(u => !provided.has(u.name)),
      unresolved: forwards.filter(f => !defs.has(f.name)),
      undeclared: [...provided].filter(k => !iface.has(k)).sort(),
      missingRequired: [...iface].filter(([k, v]) => !v.optional && !provided.has(k)).map(([k]) => k),
      unused: [...keys.keys()].filter(k => !uses.some(u => u.name === k)).sort(),
    },
    bus: {
      emits, listens, vocab, eventNames,
      orphanEmits: eventNames.filter(n => !listens.some(l => l.name === n)),
      orphanListens: eventNames.filter(n => !emits.some(e => e.name === n)),
      undocumented: eventNames.filter(n => !vocab.has(n)),
      unusedVocabulary: [...vocab].filter(n => !eventNames.includes(n)).sort(),
    },
    islands: (() => {
      const ph = htmlPlaceholders(), mo = mainMounts();
      return {
        placeholders: ph, mounts: mo,
        unmounted: [...new Set(ph.map(p => p.name))].filter(n => !mo.some(m => m.name === n)).sort(),
        phantom: [...new Set(mo.map(m => m.name))].filter(n => !ph.some(p => p.name === n)).sort(),
      };
    })(),
    tables: {
      used, declared,
      names: [...new Set(used.map(u => u.name))].sort(),
      undeclared: [...new Set(used.map(u => u.name))].filter(n => !declared.has(n)).sort(),
    },
    pages: (() => {
      const targets = pageTargets(), views = pageViews(), gated = gatedPages(), nav = navTargets();
      const names = [...new Set(targets.map(t => t.name))].sort();
      return {
        targets, views, gated, names, nav,
        viewless: names.filter(n => !views.some(v => v.name === n)),
        ungated: names.filter(n => !gated.has(n)),
        unreachable: names.filter(n => !nav.some(t => t.name === n)),
        gateOnly: [...gated].filter(n => !names.includes(n)).sort(),
      };
    })(),
    fns: (() => {
      const byFn = new Map();
      for (const c of calls) {
        if (!byFn.has(c.fn)) byFn.set(c.fn, { modes: fnModes(c.fn), calls: [] });
        byFn.get(c.fn).calls.push(c);
      }
      const unknownFn = [...byFn.keys()].filter(f => !fnDirs.has(f)).sort();
      const unknownMode = [];
      for (const [, v] of byFn) {
        if (!v.modes || !v.modes.size) continue;
        for (const c of v.calls) if (c.name !== '(default)' && !v.modes.has(c.name)) unknownMode.push(c);
      }
      const pushServer = fnModes('push-send') || new Set();
      const pushClient = new Set((byFn.get('push-send')?.calls || []).map(c => c.name).filter(n => n !== '(default)'));
      return {
        byFn, fnDirs, unknownFn, unknownMode, pushServer, pushClient,
        pushServerOnly: [...pushServer].filter(m => !pushClient.has(m)).sort(),
        pushClientOnly: [...pushClient].filter(m => !pushServer.has(m)).sort(),
      };
    })(),
    ems,
    registry: registryItems(),
    registryIcons: registryIcons(),
  };
}

// ══════════════════════════ the document ══════════════════════════
const ANNOTATIONS = 'docs/integration-map.annotations.md';
const OUT = 'docs/integration-map.md';

const refs = (list, max = 4) => list.length
  ? list.slice(0, max).map(h => `${h.file}:${h.line}`).join('<br>') + (list.length > max ? `<br>…+${list.length - max}` : '')
  : '**—**';

export function render(a = analyze()) {
  const L = [];
  L.push('# מפת האינטגרציה — integration map');
  L.push('');
  L.push('> **GENERATED — do not hand-edit.** `node scripts/integration-map.mjs` rewrites this file from the');
  L.push('> source, `node scripts/integration-map.mjs --check` fails when it is stale, and `test-integration.mjs`');
  L.push('> (part of `npm test`) asserts every contract in it. The prose a grep cannot produce lives in');
  L.push('> `docs/integration-map.annotations.md` and is appended verbatim at the end.');
  L.push('');
  L.push(`Generated from ${LEGACY_FILES().length} legacy modules, ${APP_FILES().length} island sources and ${a.fns.fnDirs.size} edge functions.`);
  L.push('');

  L.push('## (a) Bridge — `window.sigma.<fn>`');
  L.push('');
  L.push('React never touches legacy code directly: `js/src/00-bridge.js` is concatenated first and is the whole');
  L.push('surface. Every entry is a lazy thunk, so a legacy function declared later in the bundle still resolves.');
  L.push('');
  L.push('| `sigma.<fn>` | provided at | forwards to (legacy) | React consumers |');
  L.push('|---|---|---|---|');
  const usesBy = new Map();
  for (const u of a.bridge.uses) { if (!usesBy.has(u.name)) usesBy.set(u.name, []); usesBy.get(u.name).push(u); }
  const all = new Map([...a.bridge.keys]);
  for (const e of a.bridge.ext) if (!all.has(e.name)) all.set(e.name, { file: e.file, line: e.line, assigned: true });
  for (const [k, where] of [...all].sort((x, y) => x[0].localeCompare(y[0]))) {
    L.push(`| \`sigma.${k}\` | ${where.file}:${where.line}${where.assigned ? ' *(island)*' : ''} | ${fwdFor(a, where)} | ${refs(usesBy.get(k) || [])} |`);
  }
  L.push('');
  L.push('Bridge entries no island calls today (legacy-side or reserved): ' +
    (a.bridge.unused.length ? a.bridge.unused.map(k => `\`${k}\``).join(', ') : '*none*') + '.');
  L.push('');

  L.push('## (b) Bus — `window.sigmaBus`: source → event → consumers');
  L.push('');
  L.push('Legacy announces with `sigmaEmit(name, detail)`; React subscribes with `useSigmaEvent(name)`. The declared');
  L.push('vocabulary is the `SigmaEvent` union in `app/src/bridge.ts` — a name outside it is a typo, not a feature.');
  L.push('');
  L.push('| event | emitted by | consumed by |');
  L.push('|---|---|---|');
  for (const n of a.bus.eventNames) {
    L.push(`| \`${n}\` | ${refs(a.bus.emits.filter(h => h.name === n), 5)} | ${refs(a.bus.listens.filter(h => h.name === n), 6)} |`);
  }
  L.push('');
  if (a.bus.unusedVocabulary.length) {
    L.push('Declared in `SigmaEvent` but neither emitted nor consumed: ' + a.bus.unusedVocabulary.map(n => `\`${n}\``).join(', ') + '.');
    L.push('');
  }

  L.push('## (c) Islands — placeholder in `index.html` ↔ mount in `main.tsx`');
  L.push('');
  L.push('| placeholder | index.html | mounted at |');
  L.push('|---|---|---|');
  for (const n of [...new Set(a.islands.placeholders.map(p => p.name))].sort()) {
    const p = a.islands.placeholders.find(x => x.name === n);
    L.push(`| \`#${n}\` | :${p.line} | ${refs(a.islands.mounts.filter(x => x.name === n), 3)} |`);
  }
  L.push('');

  L.push('## (d) Supabase tables the client reads or writes');
  L.push('');
  L.push('| table | migration | referenced at |');
  L.push('|---|---|---|');
  for (const n of a.tables.names) {
    const d = a.tables.declared.get(n);
    L.push(`| \`${n}\` | ${d ? d.file : '**—**'} | ${refs(a.tables.used.filter(u => u.name === n), 3)} |`);
  }
  L.push('');
  L.push("**Live check** (controller, read-only — `select table_name from information_schema.tables where table_schema = 'public'`)");
  L.push(`must contain all ${a.tables.names.length}: ` + a.tables.names.map(n => `\`${n}\``).join(', ') + '.');
  L.push('');

  L.push('## (e) Pages — `showPage(x)` → view element → gate');
  L.push('');
  L.push('| page | view element | `canShowPage` | called from |');
  L.push('|---|---|---|---|');
  for (const n of a.pages.names) {
    const v = a.pages.views.find(x => x.name === n);
    L.push(`| \`${n}\` | ${v ? `\`#${n}-view\` (index.html:${v.line})` : '**—**'} | ${a.pages.gated.has(n) ? '✓' : '**—**'} | ${refs(a.pages.targets.filter(t => t.name === n), 4)} |`);
  }
  L.push('');
  if (a.pages.gateOnly.length) {
    L.push('Gated in `canShowPage` with no `showPage()` caller in the source (reached by a remembered landing or a ⋯ row that passes the name through a variable): ' +
      a.pages.gateOnly.map(n => `\`${n}\``).join(', ') + '.');
    L.push('');
  }

  L.push('## (f) Edge functions — client `mode` ↔ `supabase/functions/<fn>/index.ts`');
  L.push('');
  L.push('| function | mode | implemented | client call sites |');
  L.push('|---|---|---|---|');
  for (const [fn, v] of [...a.fns.byFn].sort((x, y) => x[0].localeCompare(y[0]))) {
    const byMode = new Map();
    for (const c of v.calls) { if (!byMode.has(c.name)) byMode.set(c.name, []); byMode.get(c.name).push(c); }
    for (const [mode, cs] of [...byMode].sort((x, y) => x[0].localeCompare(y[0]))) {
      const ok = mode === '(default)' ? '*(no mode field)*' : (v.modes && v.modes.has(mode) ? '✓' : '**—**');
      L.push(`| \`${fn}\` | \`${mode}\` | ${ok} | ${refs(cs, 4)} |`);
    }
  }
  L.push('');
  L.push('`push-send` modes with no client caller (cron / server-triggered by design): ' +
    (a.fns.pushServerOnly.length ? a.fns.pushServerOnly.map(m => `\`${m}\``).join(', ') : '*none*') + '.');
  L.push('');

  L.push('## (g) ⋯ עוד registry (`app/src/lib/registry.ts`)');
  L.push('');
  L.push('| id | icon | registered at |');
  L.push('|---|---|---|');
  for (const r of [...a.registry].sort((x, y) => x.name.localeCompare(y.name))) {
    L.push(`| \`${r.name}\` | \`${r.icon || '—'}\` | ${r.file}:${r.line} |`);
  }
  L.push('');

  L.push('## (h) EMS access — the gateway (spec §7o)');
  L.push('');
  L.push('Every EMS operation goes through `EmsGateway` (`app/src/lib/ems/gateway.ts`), implemented');
  L.push('today by `ems-rest` (`app/src/lib/ems/adapters/rest.ts`) and published to legacy as');
  L.push('`sigma.ems` by `main.tsx`. The adapter is the ONLY place allowed to build an EMS URL or');
  L.push('read raw EMS JSON; `test-integration.mjs` fails on a direct EMS call anywhere else.');
  L.push('');
  L.push(`Direct EMS call sites: **${a.ems.adapter.length}** in the adapter, **${a.ems.allowed.length}** in files still awaiting migration, **${a.ems.stray.length}** stray.`);
  L.push('');
  L.push('| file | direct EMS calls | why it is not behind the gateway yet |');
  L.push('|---|---|---|');
  for (const f of Object.keys(a.ems.allowlist).sort()) {
    const n = a.ems.allowed.filter(h => h.file === f).length;
    L.push(`| \`${f}\` | ${n} | ${a.ems.allowlist[f]} |`);
  }
  L.push('');

  const ann = exists(ANNOTATIONS) ? read(ANNOTATIONS).trim() : '';
  if (ann) { L.push('---'); L.push(''); L.push(ann); L.push(''); }
  return L.join(NL);
}

function fwdFor(a, where) {
  if (!where || where.assigned) return '*(island-provided)*';
  const src = code('js/src/00-bridge.js').split(/\r?\n/);
  const chunk = src.slice(where.line - 1, where.line + 14).join(NL);
  const cut = chunk.indexOf(NL + '      ', 1);
  const body = cut > 0 ? chunk.slice(0, cut) : chunk;
  const names = [...new Set([...body.matchAll(/\b(?:call|fn)\(\s*'([A-Za-z_$][\w$]*)'/g)].map(m => m[1]))];
  if (!names.length) return '*(own logic)*';
  return names.map(n => {
    const d = a.bridge.defs.get(n);
    return d ? `\`${n}\` → ${d.file}:${d.line}` : `\`${n}\` ⚠ **unresolved**`;
  }).join('<br>');
}

// ══════════════════════════ CLI ══════════════════════════
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/integration-map.mjs')) {
  const doc = render();
  const norm = (s) => s.replace(/\r\n/g, NL).trim();
  if (process.argv.includes('--check')) {
    if (!exists(OUT) || norm(read(OUT)) !== norm(doc)) {
      console.error(`${OUT} is STALE — run \`node scripts/integration-map.mjs\` and commit the result.`);
      process.exit(1);
    }
    console.log(`${OUT} is up to date.`);
  } else {
    fs.writeFileSync(path.join(ROOT, OUT), doc + NL, 'utf8');
    console.log(`wrote ${OUT}`);
  }
}
