// Self-check for the linkage audit row builder (js/src/14-calendar.js).
// Run: node test-site-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');
const body = src.substring(src.indexOf('function emsSiteAuditRows'), src.indexOf('async function renderEmsSiteAudit'));
const emsNorm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const fn = new Function('emsNormName', body + '\nreturn emsSiteAuditRows;');
const emsSiteAuditRows = fn(emsNorm);

const kibbutzim = ['דפנה', 'שלוחות', 'מקום ללא אתר'];
const sites = [{ id: 'a', name: 'דפנה' }, { id: 'b', name: 'שלוחות' }];
const map = { 'דפנה': ['a'], 'שלוחות': ['b'], 'מקום ללא אתר': [] };
const rows = emsSiteAuditRows(kibbutzim, sites, name => map[name] || []);

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };
t('linked kibbutz → ok with site name', rows.find(r => r.kibbutz === 'דפנה').ok === true && rows.find(r => r.kibbutz === 'דפנה').siteName === 'דפנה');
t('site-less kibbutz → not ok', rows.find(r => r.kibbutz === 'מקום ללא אתר').ok === false);
t('all kibbutzim represented', rows.length === 3);
console.log(failures ? `\n${failures} FAILED` : '\naudit checks passed');
process.exit(failures ? 1 : 0);
