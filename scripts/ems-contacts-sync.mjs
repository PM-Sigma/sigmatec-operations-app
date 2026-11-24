// 📇 EMS users → site_contacts (delivery-certificate contacts).
//
//   node scripts/ems-contacts-sync.mjs --dry-run      # reads EMS + Supabase, prints COUNTS, writes nothing
//   node scripts/ems-contacts-sync.mjs                # the real run (apply)
//   node scripts/ems-contacts-sync.mjs --fixture qa/fixtures/ems-contacts.json   # offline: plan only
//
// Owner's rule: every ACTIVE EMS user with role site_manager (מנהל אתר) or operations_manager (מנהל תפעול) on a
// site is a contact for the certificates of the kibbutz(im) that own that site (kibbutzim.ems_site_ids).
// Runs on the office PC beside scripts/ems-cache-refresh.mjs: same .env (EMS_EMAIL/EMS_PASSWORD or EMS_TOKEN), same
// EMS sign-in -> ems-auth -> authenticated Supabase pass. Run it daily/weekly in Task Scheduler (docs/ems-cache-refresh.md).
//
// What it touches: only rows with source='ems'. Manual rows (added in the send panel) are never edited or removed,
// and an EMS user whose address already exists as a manual row for that kibbutz is skipped (manual wins).
// Rows whose EMS user vanished / was deactivated / lost the role / left the site are set active=false, not deleted.
//
// WARNING: EMS `GET /v1/users` scopes by the caller (users.service.ts findAll): an admin whose `currentSite` is set
// sees only that site's users + admins. A scoped crawl must never deactivate anybody, so the job refuses to run when
// /v1/users/me reports a currentSite, and (second guard) refuses deactivations if the crawl found under half of the
// active EMS rows already stored. Public repo: the output prints counts only, never names / emails / phones.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT, ROOT, emsLogin, hasCredentials, loadConfig, mintSupabasePass, readClientConstants } from './ems-cache-refresh.mjs';

export const CONTACT_ROLES = ['site_manager', 'operations_manager'];
const lc = s => String(s == null ? '' : s).trim().toLowerCase();

/**
 * PURE. emsUsers: raw EMS user rows ({firstName,lastName,email,phone,role,status,sites:[{id}]});
 * kibbutzim: [{name, ems_site_ids}] (non-archived); existing: site_contacts rows ({id,kibbutz,email,source,active,...}).
 * Returns { desired, insert, update, deactivate, skippedManual } - insert = new rows, update = [{id, patch}] for
 * ems rows whose fields changed / were inactive, deactivate = ids of ems rows no longer wanted.
 */
export function contactSyncPlan(emsUsers, kibbutzim, existing) {
  const siteToKibbutz = new Map();
  for (const k of kibbutzim || []) {
    for (const sid of k.ems_site_ids || []) {
      if (!siteToKibbutz.has(sid)) siteToKibbutz.set(sid, []);
      siteToKibbutz.get(sid).push(k.name);
    }
  }
  const desired = new Map(); // `${kibbutz}|${email}` -> row
  for (const u of emsUsers || []) {
    const email = lc(u.email);
    if (!email || !CONTACT_ROLES.includes(u.role) || (u.status && u.status !== 'active') || u.isBlocked) continue;
    const name = [u.firstName, u.lastName].map(x => String(x || '').trim()).filter(Boolean).join(' ');
    for (const s of u.sites || []) {
      for (const kibbutz of siteToKibbutz.get(s.id) || []) {
        const key = kibbutz + '|' + email;
        if (!desired.has(key)) desired.set(key, { kibbutz, name, role: u.role, email, phone: String(u.phone || '').trim(), source: 'ems', active: true });
      }
    }
  }
  const have = new Map(); // key -> existing row (any source)
  for (const r of existing || []) if (lc(r.email)) have.set(r.kibbutz + '|' + lc(r.email), r);

  const insert = [], update = [], deactivate = [];
  let skippedManual = 0;
  for (const [key, d] of desired) {
    const r = have.get(key);
    if (!r) { insert.push(d); continue; }
    if (r.source !== 'ems') { skippedManual++; continue; }
    const patch = {};
    for (const f of ['name', 'role', 'phone']) if ((r[f] || '') !== d[f]) patch[f] = d[f];
    if (r.active === false) patch.active = true;
    if (Object.keys(patch).length) update.push({ id: r.id, patch });
  }
  for (const r of existing || []) {
    if (r.source === 'ems' && r.active !== false && !desired.has(r.kibbutz + '|' + lc(r.email))) deactivate.push(r.id);
  }
  return { desired: [...desired.values()], insert, update, deactivate, skippedManual };
}

/** PURE: deactivating on a truncated / scoped crawl would wipe contacts - refuse below half of what is stored. */
export function deactivationSafe(plan, existing) {
  const stored = (existing || []).filter(r => r.source === 'ems' && r.active !== false).length;
  return stored === 0 || plan.desired.length >= stored / 2;
}

// ───────────────────────────── network ─────────────────────────────
async function getJson(url, headers) {
  const u = new URL(url);
  const res = await fetch(url, { headers });
  if (res.status === 401) throw Object.assign(new Error('401 from ' + u.host + ' - token invalid/expired'), { code: EXIT.LOGIN });
  if (!res.ok) throw Object.assign(new Error(res.status + ' from ' + u.host + u.pathname), { code: EXIT.FETCH });
  return res.json();
}

export async function emsFetchContactUsers(base, token) {
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const me = await getJson(base + '/v1/users/me', h);
  if (me && me.currentSite) {
    throw Object.assign(new Error('the EMS account has a currentSite set - GET /users would be scoped to that one site. Switch the account to "all sites" in EMS (or use an admin without a current site) and re-run.'), { code: EXIT.CONFIG });
  }
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ page: String(page), take: '200', roles: CONTACT_ROLES.join(','), statuses: 'active' });
    const body = await getJson(base + '/v1/users?' + q, h);
    const batch = (body && body.data) || (Array.isArray(body) ? body : []);
    out.push(...batch);
    if (batch.length < 200) break;
  }
  return out;
}

async function sbReq(sbUrl, sbAnon, pass, method, path, body) {
  const res = await fetch(sbUrl + '/rest/v1/' + path, {
    method,
    headers: { apikey: sbAnon, Authorization: 'Bearer ' + pass, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(method + ' ' + path.split('?')[0] + ' answered ' + res.status), { code: EXIT.WRITE });
  return method === 'GET' ? res.json() : null;
}

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const dryRun = argv.includes('--dry-run') || argv.includes('-n');
  const fxIdx = argv.indexOf('--fixture');
  const fx = fxIdx >= 0 ? argv[fxIdx + 1] : '';
  const report = { mode: fx ? 'fixture' : dryRun ? 'dry-run' : 'live' };
  const done = (code, extra) => { console.log(JSON.stringify({ ...report, ...extra, exit: code })); return code; };
  const counts = (p, existing) => ({ wanted: p.desired.length, insert: p.insert.length, update: p.update.length, deactivate: p.deactivate.length, skippedManual: p.skippedManual, storedEms: existing.filter(r => r.source === 'ems').length });
  try {
    if (fx) {
      const f = JSON.parse(readFileSync(resolve(root, fx), 'utf8'));
      return done(EXIT.OK, counts(contactSyncPlan(f.users, f.kibbutzim, f.existing), f.existing || []));
    }
    const cfg = loadConfig(root);
    if (!hasCredentials(cfg)) return done(EXIT.CONFIG, { error: 'no EMS credentials in .env (docs/ems-cache-refresh.md)' });
    const { sbUrl, sbAnon } = readClientConstants(root);
    const emsToken = cfg.token || await emsLogin(cfg.base, cfg.email, cfg.password);
    const users = await emsFetchContactUsers(cfg.base, emsToken);
    const pass = await mintSupabasePass(sbUrl, sbAnon, emsToken);
    const kibbutzim = await sbReq(sbUrl, sbAnon, pass, 'GET', 'kibbutzim?select=name,ems_site_ids&archived_at=is.null');
    const existing = await sbReq(sbUrl, sbAnon, pass, 'GET', 'site_contacts?select=id,kibbutz,name,role,email,phone,source,active');
    const plan = contactSyncPlan(users, kibbutzim, existing);
    const safe = deactivationSafe(plan, existing);
    report.fetchedUsers = users.length;
    if (!safe) report.warning = 'deactivations skipped: the crawl found under half of the stored EMS contacts';
    const c = { ...counts(plan, existing), deactivate: safe ? plan.deactivate.length : 0 };
    if (dryRun) return done(EXIT.OK, { ...c, note: 'dry run - nothing written' });
    if (plan.insert.length) await sbReq(sbUrl, sbAnon, pass, 'POST', 'site_contacts', plan.insert);
    for (const u of plan.update) await sbReq(sbUrl, sbAnon, pass, 'PATCH', 'site_contacts?id=eq.' + u.id, u.patch);
    if (safe) for (const id of plan.deactivate) await sbReq(sbUrl, sbAnon, pass, 'PATCH', 'site_contacts?id=eq.' + id, { active: false });
    return done(EXIT.OK, c);
  } catch (e) {
    return done(e.code || EXIT.UNEXPECTED, { error: String((e && e.message) || e) });
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) main().then(c => { process.exitCode = c; });
