// scripts/bugbot/lib.mjs - the bug bot's PURE decisions (no I/O). Tested in test-bugbot.mjs.
// The model never decides what reaches main: decideOutcome() does, from the real git diff + gates.

export const LIMITS = {
  maxSourceLines: 60,          // added+deleted over SOURCE files only
  dailyCap: 10,                // runs per rolling 24 h
  timeoutMs: 45 * 60 * 1000,   // one claude run
  pollMs: 60 * 1000,
  staleWorkingMs: 2 * 60 * 60 * 1000,
  maxBugChars: 8000,
  bootGrowthRatio: 1.02,       // ui/sigma.js + js/app.js + css/app.min.css may grow at most 2 %
};

export const BUG_STATES = ['working', 'merged', 'needs_approval', 'not_reproduced', 'failed'];
export const MODEL_CLASSES = ['small', 'needs_approval', 'not_reproduced'];

// -- the atomic claim ---------------------------------------------------------
export const openBugsPath = (limit = 5) =>
  `/rest/v1/feedback?select=id,text,author,created_at&kind=eq.bug&status=eq.new&bot_state=is.null&order=created_at.asc&limit=${limit}`;

/** UPDATE ... WHERE id=? AND bot_state IS NULL ... RETURNING: an empty array back = someone else won. */
export function claimRequest(baseUrl, id, nowIso) {
  if (!/^[0-9a-f-]{8,40}$/i.test(String(id))) throw new Error('bad id');
  return {
    method: 'PATCH',
    url: `${baseUrl}/rest/v1/feedback?id=eq.${id}&bot_state=is.null&status=eq.new&kind=eq.bug`,
    headers: { Prefer: 'return=representation' },
    body: { bot_state: 'working', bot_at: nowIso },
  };
}
export const claimWon = rows => Array.isArray(rows) && rows.length === 1;

export const staleWorkingPath = (nowMs, staleMs = LIMITS.staleWorkingMs) =>
  `/rest/v1/feedback?select=id&bot_state=eq.working&bot_at=lt.${encodeURIComponent(new Date(nowMs - staleMs).toISOString())}`;

// -- the daily cap --------------------------------------------------------------
export const runsInLast24h = (log, nowMs) =>
  (log || []).filter(t => nowMs - Date.parse(t) < 24 * 3600e3 && Date.parse(t) <= nowMs + 60e3).length;
export const capReached = (log, nowMs, cap = LIMITS.dailyCap) => runsInLast24h(log, nowMs) >= cap;

// -- branch naming (a hyphen, not a slash: githack preview URLs stay trivial) ----
export const branchName = id => 'bugbot-' + String(id).replace(/-/g, '').slice(0, 8).toLowerCase();
export const isBotBranch = b => /^bugbot-[0-9a-f]{8}$/.test(String(b));
export const previewUrl = (repo, branch) => `https://raw.githack.com/${repo}/${branch}/index.html`;

// -- the verdict file the model writes ------------------------------------------
const cap = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** text of bugbot-result.json -> { ok:true, verdict } | { ok:false, error } */
export function parseVerdict(text) {
  let j;
  try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { ok: false, error: 'verdict is not JSON' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, error: 'verdict is not an object' };
  if (!MODEL_CLASSES.includes(j.class)) return { ok: false, error: 'verdict.class must be one of ' + MODEL_CLASSES.join('|') };
  const cause = cap(j.cause, 400);
  if (!cause) return { ok: false, error: 'verdict.cause is empty' };
  return {
    ok: true,
    verdict: {
      cause, fix_summary: cap(j.fix_summary, 400), class: j.class,
      gates_green: j.gates_green === true,                 // informational only: handle.mjs re-runs the gates
      files_changed: Array.isArray(j.files_changed) ? j.files_changed.map(f => cap(f, 200)).slice(0, 50) : [],
      lines_changed: Number.isFinite(+j.lines_changed) ? +j.lines_changed : null,
    },
  };
}

// -- what changed, from git -----------------------------------------------------
/** `git diff --numstat` text -> [{path, added, deleted}] (binary '-' counts as 1000). */
export function parseNumstat(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).map(l => {
    const [a, d, ...p] = l.split('\t');
    return { path: p.join('\t'), added: a === '-' ? 1000 : +a, deleted: d === '-' ? 1000 : +d };
  }).filter(f => f.path);
}

// Anything that can touch data, access or the bot itself is NEVER auto-merged.
const FORBIDDEN_PATH = [
  /^db\//, /^supabase\//, /\.sql$/i, /^\.github\//, /^\.githooks\//, /^scripts\/bugbot\//,
  /^package(-lock)?\.json$/, /^app\/package(-lock)?\.json$/, /^deno\.lock$/, /^build\.mjs$/, /^\.gitignore$/,
  /(^|[/._-])(auth|session|roles?|permissions?|rls|login|gate|secrets?|tokens?|access|credentials?)([/._-]|$)/i,
];
const SOURCE_PATH = /^(app\/src|js\/src|css)\//;
const TEST_PATH = /(\.test\.|\.spec\.)[a-z]+$|^test-[\w.-]+\.mjs$|^qa\//;
const GENERATED_PATH = /^(js\/app\.js|js\/app\.js\.map|ui\/[^/]+|css\/app\.min\.css|sw\.js|VERSION|docs\/CHANGELOG\.md)$/;
// content that means "this change writes data / decides access"
const RISKY_LINE = /sbWrite|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|functions\/v1|isAdmin|canManage|canSee\w*|permission|\brole\s*[!=]==?|service_role/;

export function classifyPath(path, f = {}) {
  const words = path.replace(/([a-z])([A-Z])/g, '$1-$2');   // EmsGate.tsx -> Ems-Gate.tsx
  if (FORBIDDEN_PATH.some(r => r.test(path) || r.test(words))) return 'forbidden';
  if (TEST_PATH.test(path)) return 'test';
  if (GENERATED_PATH.test(path)) return 'generated';
  if (path === 'index.html') return (f.added || 0) + (f.deleted || 0) <= 12 ? 'generated' : 'other';   // version stamps only
  if (/^docs\/.*\.md$/.test(path)) return 'generated';
  if (SOURCE_PATH.test(path)) return 'source';
  return 'other';
}

/**
 * The merge decision. Inputs are FACTS (git numstat, the added lines, our own gate run); the
 * model's label can only make it stricter (a 'needs_approval' label is respected, a 'small'
 * label proves nothing). -> { outcome: 'merge'|'needs_approval'|'not_reproduced', reasons: [], lines }
 */
export function decideOutcome({ modelClass, files = [], addedLines = [], gatesGreen = false, maxLines = LIMITS.maxSourceLines }) {
  const kinds = files.map(f => ({ ...f, kind: classifyPath(f.path, f) }));
  const source = kinds.filter(f => f.kind === 'source');
  const lines = source.reduce((n, f) => n + f.added + f.deleted, 0);
  if (modelClass === 'not_reproduced' && !source.length) return { outcome: 'not_reproduced', reasons: ['not reproduced, no source change'], lines };
  const reasons = [];
  if (!gatesGreen) reasons.push('gates not green');
  if (modelClass !== 'small') reasons.push('the investigation marked it ' + modelClass);
  for (const f of kinds) {
    if (f.kind === 'forbidden') reasons.push('sensitive path: ' + f.path);
    else if (f.kind === 'other') reasons.push('path outside the allowed set: ' + f.path);
  }
  if (!source.length) reasons.push('no source change');
  if (lines > maxLines) reasons.push(`source diff ${lines} lines > ${maxLines}`);
  if (addedLines.some(l => RISKY_LINE.test(l))) reasons.push('added lines touch data/permissions');
  return { outcome: reasons.length ? 'needs_approval' : 'merge', reasons: [...new Set(reasons)], lines };
}

// -- the user-facing sentences (Hebrew, short) ----------------------------------
export function noteFor(state, v, extra = {}) {
  const cause = v?.cause ? 'סיבה: ' + v.cause : '';
  const fix = v?.fix_summary ? ' תיקון: ' + v.fix_summary : '';
  if (state === 'merged') return cap(cause + fix + (extra.version ? ' (גרסה ' + extra.version + ')' : ''), 600);
  if (state === 'needs_approval') {
    const why = extra.reasons?.length ? ' למה לא עלה לבד: ' + extra.reasons.join('; ') + '.' : '';
    const prev = extra.preview ? ' תצוגה מקדימה: ' + extra.preview : '';
    return cap(cause + fix + why + prev, 900);
  }
  if (state === 'not_reproduced') return cap('לא הצלחתי לשחזר. ' + (v?.cause || '') + (v?.fix_summary ? ' ניסיתי: ' + v.fix_summary : ''), 600);
  return cap(extra.error || 'הריצה נכשלה', 300);
}

// -- the push request to push-send (the server decides title/body/recipient) ----
export function pushRequest(baseUrl, cronSecret, { id, state, note }) {
  return {
    url: baseUrl + '/functions/v1/push-send',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-key': cronSecret },
    body: { mode: 'bugbot', id, state, note: String(note || '').replace(/\s+/g, ' ').slice(0, 160) },
  };
}

/** Remove secret values from anything that will be logged. */
export function redact(text, secrets = []) {
  let t = String(text ?? '');
  for (const s of secrets) if (s && s.length >= 6) t = t.split(s).join('***');
  return t.replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '***jwt***');
}

/** Minimal KEY=VALUE parser for the local .env (no dependency). */
export function parseEnv(text) {
  const out = {};
  for (const l of String(text).split(/\r?\n/)) {
    if (l.trim().startsWith('#')) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** The environment the model's process gets: none of the bot's own keys. */
export function sanitizedEnv(env) {
  const keep = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
    'COMSPEC', 'ProgramFiles', 'ProgramData', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
  const out = {};
  for (const k of keep) if (env[k] != null) out[k] = env[k];
  return out;
}

/** `## [bugbot x.xx] date` entry, inserted above the first existing entry of docs/CHANGELOG.md. */
export function changelogInsert(md, { version, date, summary, cause, id8 }) {
  const entry = `## [bugbot ${version}] ${date} - תיקון אוטומטי של הבוט (feedback ${id8})\n- ${summary}\n- סיבה: ${cause}\n\n`;
  const i = md.search(/^## \[/m);
  return i < 0 ? md + '\n' + entry : md.slice(0, i) + entry + md.slice(i);
}
