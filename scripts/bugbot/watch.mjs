// scripts/bugbot/watch.mjs - the bug bot's always-on loop (home server).
//   node scripts/bugbot/watch.mjs [--dry-run] [--once]
// Polls public.feedback every 60 s for kind='bug', status='new', bot_state IS NULL, claims ONE
// atomically, hands it to handle.mjs, repeats. Logs counts and ids only - never bug text, never keys.
// --dry-run: claims nothing, changes nothing, prints what it would do, one pass, exit.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS, capReached, claimRequest, claimWon, noteFor, openBugsPath, parseEnv, redact, runsInLast24h, staleWorkingPath,
} from './lib.mjs';
import { REPO_ROOT, finish, handleBug, sbFetch } from './handle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const once = argv.includes('--once') || dryRun;

const envFile = process.env.BUGBOT_ENV || join(HERE, '.env');
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const env = { ...fileEnv, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('BUGBOT_'))) };
const secrets = [env.BUGBOT_SB_SERVICE_KEY, env.BUGBOT_CRON_SECRET];

const stateDir = env.BUGBOT_STATE_DIR || join(HERE, '.state');
mkdirSync(stateDir, { recursive: true });
const logFile = join(stateDir, 'bugbot.log');
const log = msg => {
  const line = `${new Date().toISOString()} ${redact(msg, secrets)}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch { /* console is enough */ }
};

for (const k of ['BUGBOT_SB_URL', 'BUGBOT_SB_SERVICE_KEY', 'BUGBOT_CRON_SECRET']) {
  if (!env[k]) { console.error(`missing ${k} in ${envFile} (see scripts/bugbot/.env.example)`); process.exit(2); }
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.BUGBOT_SB_URL)) { console.error('BUGBOT_SB_URL must look like https://<ref>.supabase.co'); process.exit(2); }

const ctx = {
  env, secrets, dryRun, log,
  repo: resolve(env.BUGBOT_REPO || REPO_ROOT),
  workRoot: resolve(env.BUGBOT_WORK_ROOT || join(stateDir, 'work')),
};
mkdirSync(ctx.workRoot, { recursive: true });

// ── single instance ──────────────────────────────────────────────────────────
const lockFile = join(stateDir, 'watch.lock');
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
if (!dryRun) {
  if (existsSync(lockFile)) {
    const pid = +readFileSync(lockFile, 'utf8');
    if (pid && alive(pid)) { console.error(`another bugbot is running (pid ${pid})`); process.exit(3); }
  }
  writeFileSync(lockFile, String(process.pid));
  const drop = () => { try { rmSync(lockFile, { force: true }); } catch { /* gone */ } };
  process.on('exit', drop);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(0));
}

// ── the daily-cap log ────────────────────────────────────────────────────────
const runsFile = join(stateDir, 'runs.json');
const readRuns = () => { try { return JSON.parse(readFileSync(runsFile, 'utf8')); } catch { return []; } };
const noteRun = () => {
  const keep = readRuns().filter(t => Date.now() - Date.parse(t) < 48 * 3600e3);
  keep.push(new Date().toISOString());
  writeFileSync(runsFile, JSON.stringify(keep));
};

// ── one pass ─────────────────────────────────────────────────────────────────
async function sweepStale() {
  const stale = await sbFetch(ctx, staleWorkingPath(Date.now()));
  for (const r of stale || []) {
    log(`stale working row ${r.id.slice(0, 8)} -> failed`);
    if (!dryRun) await finish(ctx, r.id, 'failed', noteFor('failed', null, { error: 'הריצה נתקעה ולא הסתיימה' }));
  }
}

async function pass() {
  await sweepStale();
  const runs = readRuns();
  if (capReached(runs, Date.now())) { log(`daily cap reached (${runsInLast24h(runs, Date.now())}/${LIMITS.dailyCap}); waiting`); return false; }
  const open = await sbFetch(ctx, openBugsPath(5));
  log(`open bugs: ${open?.length || 0}`);
  for (const row of open || []) {
    if (dryRun) { log(`[dry-run] would claim ${row.id.slice(0, 8)} (${String(row.text || '').length} chars) and run the handler`); continue; }
    const req = claimRequest(env.BUGBOT_SB_URL, row.id, new Date().toISOString());
    const won = await sbFetch(ctx, req.url.slice(env.BUGBOT_SB_URL.length), { method: 'PATCH', body: req.body, headers: req.headers });
    if (!claimWon(won)) { log(`${row.id.slice(0, 8)}: taken by someone else`); continue; }
    log(`${row.id.slice(0, 8)}: claimed`);
    noteRun();
    await handleBug(ctx, row);   // one bug at a time: the loop only continues when this returns
    log(`${row.id.slice(0, 8)}: done`);
    return true;
  }
  return false;
}

log(`bugbot started${dryRun ? ' (dry-run)' : ''}; repo ${ctx.repo}`);
do {
  try { await pass(); } catch (e) { log('pass error: ' + e.message); }
  if (once) break;
  await new Promise(r => setTimeout(r, LIMITS.pollMs));
} while (true);
