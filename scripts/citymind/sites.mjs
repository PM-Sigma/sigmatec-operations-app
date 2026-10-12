// The GitHub matrix for .github/workflows/citymind-arad.yml: the ACTIVE CityMind kibbutzim from reading_sites
// (readings-fetch `ingestSites`, authenticated by READINGS_INGEST_KEY). Each entry carries the NAMES of the kibbutz's two
// secrets (never values) and its "קריאות יומיות" value. A new kibbutz = a reading_sites row + two secrets — no edit here.
// env: READINGS_INGEST_KEY · ONLY_KIBBUTZ (optional: one kibbutz) · GITHUB_OUTPUT (written: matrix=<json>, count=<n>)
import { appendFileSync, readFileSync } from 'node:fs';

const SB_URL = 'https://wwqfcajnxinaxmobrgol.supabase.co';
const SB_ANON = /const SB_ANON = '([^']+)'/.exec(readFileSync(new URL('../../js/src/01-data.js', import.meta.url), 'utf8'))?.[1] || '';

const r = await fetch(SB_URL + '/functions/v1/readings-fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'x-ingest-key': process.env.READINGS_INGEST_KEY || '' },
  body: JSON.stringify({ mode: 'ingestSites' }),
});
const d = await r.json().catch(() => ({}));
if (r.status !== 200 || !Array.isArray(d.sites)) { console.log('[citymind] site list failed, function status', r.status); process.exit(1); }
const only = (process.env.ONLY_KIBBUTZ || '').trim();
const sites = only ? d.sites.filter((s) => s.kibbutz === only) : d.sites;
console.log('[citymind] kibbutzim to pull:', sites.length, sites.map((s) => s.kibbutz).join(', '));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: sites })}\ncount=${sites.length}\n`);
