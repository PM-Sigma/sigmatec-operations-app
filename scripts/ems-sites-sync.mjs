// 🆕 EMS sites → new app kibbutz cards.
//
//   node scripts/ems-sites-sync.mjs --dry-run                              # reads EMS + Supabase, prints what it would create, writes nothing
//   node scripts/ems-sites-sync.mjs                                        # the real run
//   node scripts/ems-sites-sync.mjs --fixture qa/fixtures/ems-sites.json   # offline: plan only
//
// The owner creates sites in EMS that never show up in the app. Every ACTIVE EMS site whose id is in NO
// `kibbutzim.ems_site_ids` (archived cards count: an archived card is a decision, not a gap) becomes a card in the
// "new" section (name = EMS site name, ems_site_ids = [id], created_by 'EMS sync'; region stays empty for the owner).
// A site whose name resembles an existing card (equal / contained, ignoring punctuation) is NOT created: it is
// printed as a possible link, so no duplicate card and no auto-link. Existing cards are never edited or deleted.
// Auth is the same as the contacts job: EMS sign-in -> ems-auth -> authenticated pass (no service key anywhere).
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXIT, ROOT, emsLogin, hasCredentials, loadConfig, mintSupabasePass, readClientConstants } from './ems-cache-refresh.mjs';
import { getJson, sbReq } from './ems-contacts-sync.mjs';

export const MAX_CREATE = 15; // a run that wants more is a bug or a scoping glitch, not 16 real new sites

/** PURE: letters + digits only, lower-cased, so "דגניה ב'" and "דגניה ב" compare equal. */
export const normName = s => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const resembles = (a, b) => a.length >= 3 && b.length >= 3 && (a === b || a.includes(b) || b.includes(a));

/**
 * PURE. emsSites: [{id,name,active}] from EMS; kibbutzim: ALL app cards incl. archived ({name, ems_site_ids}).
 * Returns { create: [row], possibleLinks: [{site, cards:[name]}], known } - create = ready-to-POST card rows.
 */
export function sitesSyncPlan(emsSites, kibbutzim) {
  const known = new Set();
  for (const k of kibbutzim || []) for (const id of k.ems_site_ids || []) known.add(String(id));
  const pool = (kibbutzim || []).map(k => ({ name: k.name, n: normName(k.name) }));
  const create = [], possibleLinks = [];
  for (const s of emsSites || []) {
    const name = String(s.name || '').trim().replace(/\s+/g, ' ');
    if (!s.id || !name || s.active === false || known.has(String(s.id))) continue;
    const n = normName(name);
    const hits = pool.filter(p => resembles(n, p.n)).map(p => p.name);
    if (hits.length) { possibleLinks.push({ site: name, cards: hits }); continue; }
    if (n.length < 3) continue; // too short to be a real name
    create.push({ name, section: 'new', kind: 'kibbutz', ems_site_ids: [String(s.id)], created_by: 'EMS sync' });
    pool.push({ name, n }); // two EMS sites with one name must not both become cards
  }
  return { create, possibleLinks, known: known.size };
}

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const dryRun = argv.includes('--dry-run') || argv.includes('-n');
  const fxIdx = argv.indexOf('--fixture');
  const fx = fxIdx >= 0 ? argv[fxIdx + 1] : '';
  const report = { mode: fx ? 'fixture' : dryRun ? 'dry-run' : 'live' };
  const done = (code, extra) => { console.log(JSON.stringify({ ...report, ...extra, exit: code })); return code; };
  const view = (p, emsSites) => ({ emsSites: emsSites.length, knownIds: p.known, create: p.create.length, wouldCreate: p.create.map(r => r.name), possibleLinks: p.possibleLinks });
  try {
    if (fx) {
      const f = JSON.parse(readFileSync(resolve(root, fx), 'utf8'));
      return done(EXIT.OK, view(sitesSyncPlan(f.sites, f.kibbutzim), f.sites));
    }
    const cfg = loadConfig(root);
    if (!hasCredentials(cfg)) return done(EXIT.CONFIG, { error: 'no EMS credentials (env EMS_EMAIL/EMS_PASSWORD or .env)' });
    const { sbUrl, sbAnon } = readClientConstants(root);
    const emsToken = cfg.token || await emsLogin(cfg.base, cfg.email, cfg.password);
    const sites = await getJson(cfg.base + '/v1/sites', { Authorization: 'Bearer ' + emsToken, 'Content-Type': 'application/json' });
    const list = Array.isArray(sites) ? sites : (sites && sites.data) || [];
    if (!list.length) return done(EXIT.FETCH, { error: 'EMS returned no sites - refusing to continue' });
    const pass = await mintSupabasePass(sbUrl, sbAnon, emsToken);
    const kibbutzim = await sbReq(sbUrl, sbAnon, pass, 'GET', 'kibbutzim?select=name,ems_site_ids');
    const plan = sitesSyncPlan(list, kibbutzim);
    const v = view(plan, list);
    if (plan.create.length > MAX_CREATE) return done(EXIT.CONFIG, { ...v, wouldCreate: undefined, error: 'refusing to create more than ' + MAX_CREATE + ' cards in one run' });
    if (dryRun) return done(EXIT.OK, { ...v, note: 'dry run - nothing written' });
    if (plan.create.length) await sbReq(sbUrl, sbAnon, pass, 'POST', 'kibbutzim', plan.create);
    return done(EXIT.OK, v);
  } catch (e) {
    return done(e.code || EXIT.UNEXPECTED, { error: String((e && e.message) || e) });
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) main().then(c => { process.exitCode = c; });
