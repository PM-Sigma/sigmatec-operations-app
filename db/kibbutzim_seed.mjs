// Seed generator for the `kibbutzim` table (spec §7b / Part A re-homing, §2).
//
// Parses the LEGACY static kibbutz cards out of git history (index.html before the
// cards became data-driven) and prints the INSERT statement to stdout.
//
//   node db/kibbutzim_seed.mjs            # parse the committed legacy markup
//   node db/kibbutzim_seed.mjs --html X   # parse an explicit html file instead
//
// Re-homing rules (spec §2):
//   #grid-new_client            → new
//   data-types "track priority" → new
//   #grid-done                  → active
//   #grid-pending / "pending priority" → active + marketing=true
//
// Region: read live from the Supabase `tasks` table (anon key) and matched by name.
// Unmatched → '' (עידן fills them from the app).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// The commit that still holds the four static grids. Kept explicit so the seed is
// reproducible after index.html is rewritten.
const LEGACY_REF = process.env.KIBBUTZIM_LEGACY_REF || 'HEAD';

const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4';

function legacyHtml() {
  const explicit = process.argv.indexOf('--html');
  if (explicit !== -1) return fs.readFileSync(process.argv[explicit + 1], 'utf8');
  const local = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (local.indexOf('id="grid-done"') !== -1) return local;          // pre-migration tree
  return execSync('git show ' + LEGACY_REF + ':index.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

const GRIDS = ['grid-priority', 'grid-new_client', 'grid-done', 'grid-pending'];

function gridBody(html, id) {
  const start = html.indexOf('id="' + id + '"');
  if (start === -1) throw new Error('grid not found: ' + id);
  const from = html.indexOf('>', start) + 1;
  const end = /<\/div>\s*<\/div>\s*<\/div>/g;               // end of .kibbutz-grid → .section-body → .section
  end.lastIndex = from;
  const to = end.exec(html);
  if (!to) throw new Error('grid end not found: ' + id);
  return html.slice(from, to.index);
}

function energyOf(cardHtml) {
  const m = cardHtml.match(/<span class="energy-badge">([^<]*)<\/span>/);
  const txt = m ? m[1] : '';
  const parts = txt.split('+').map(s => s.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => {
    if (p.indexOf('💧') !== -1) out.push('water');
    else if (p.indexOf('🔥') !== -1) out.push('gas');
    else out.push('electric');
  });
  return out.length ? out : ['electric'];
}

function parseCards(html) {
  const rows = [];
  for (const gid of GRIDS) {
    const body = gridBody(html, gid);
    const re = /<div class="kibbutz[^"]*"[^>]*data-name="([^"]+)"[^>]*>/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const open = m[0];
      const name = m[1];
      // the card ends at the next card opening (or the end of the grid)
      re.lastIndex = m.index + open.length;
      const nextIdx = body.indexOf('<div class="kibbutz ', re.lastIndex);
      const cardHtml = body.slice(m.index, nextIdx === -1 ? body.length : nextIdx);
      const typesM = open.match(/data-types="([^"]*)"/);
      const types = typesM ? typesM[1].trim() : '';
      const nameM = cardHtml.match(/<div class="kibbutz-name">([^<]*)<\/div>/);
      const label = nameM ? nameM[1].trim() : name;

      let section = 'active';
      let marketing = false;
      if (gid === 'grid-new_client') section = 'new';
      else if (types === 'track priority') section = 'new';
      else if (gid === 'grid-pending' || types === 'pending priority') { section = 'active'; marketing = true; }
      else section = 'active';

      rows.push({
        name,
        display_name: label && label !== name ? label : null,
        section,
        energy: energyOf(cardHtml),
        marketing,
        region: ''
      });
    }
  }
  return rows;
}

async function regionsByName() {
  try {
    const r = await fetch(SB_URL + '/rest/v1/tasks?select=name,region', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const map = {};
    (await r.json()).forEach(t => {
      const reg = String(t.region || '').trim();
      if (t.name && reg && reg !== '#N/A') map[String(t.name).trim()] = reg;
    });
    return map;
  } catch (e) {
    console.error('# WARNING: could not read regions from Supabase (' + e.message + ') — every region falls back to \'\'');
    return {};
  }
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const arr = a => "'{" + a.map(x => '"' + x + '"').join(',') + "}'";

const rows = parseCards(legacyHtml());

// contract: names are the join key everywhere (visits, meeting notes, EMS map) — must be unique
const seen = new Set();
const dupes = rows.map(r => r.name).filter(n => (seen.has(n) ? true : (seen.add(n), false)));
if (dupes.length) { console.error('# DUPLICATE NAMES: ' + dupes.join(', ')); process.exit(1); }

const regions = await regionsByName();
rows.forEach(r => { r.region = regions[r.name] || ''; });

const values = rows.map(r =>
  '  (' + [q(r.name), r.display_name ? q(r.display_name) : 'null', q(r.section), arr(r.energy), r.marketing ? 'true' : 'false', q(r.region)].join(', ') + ')'
).join(',\n');

console.log('-- generated by db/kibbutzim_seed.mjs — ' + rows.length + ' kibbutzim');
console.log('insert into kibbutzim (name, display_name, section, energy, marketing, region) values');
console.log(values);
console.log('on conflict (name) do nothing;');
console.error('# rows: ' + rows.length + ' (new ' + rows.filter(r => r.section === 'new').length +
  ', active ' + rows.filter(r => r.section === 'active').length +
  ', marketing ' + rows.filter(r => r.marketing).length +
  ', with region ' + rows.filter(r => r.region).length + ')');
