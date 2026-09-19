// Self-check: the kibbutz-modal EMS section blocks task creation when the kibbutz has no site.
// Run: node test-site-block.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/14-calendar.js'), 'utf8');

const box = { style: {}, innerHTML: '' };
const document_ = { getElementById: id => (id === 'modalEmsSection' ? box : { value: '', style: {}, classList: { add() {}, remove() {} } }) };
const body = src.substring(src.indexOf('function prepModalEmsSection'), src.indexOf('function emsSiteAuditRows'));
let hasSite = false, toasts = [];
const fn = new Function('document', 'canUseEms', 'kibbutzSiteIds', 'kibbutzHasSite', 'emsCacheTasksForKibbutz',
  'EMS_PRIORITY_DOT', 'EMS_STATUS', 'emsEsc', 'isEmsConnected', 'closeModal', 'showPage', 'emsToast',
  'emsCreateTaskModal', 'emsSiteIdForKibbutz', 'currentKibbutz',
  body + '\nreturn { prepModalEmsSection, createEmsTaskForKibbutz };');
const api = fn(document_, () => true, () => [], () => hasSite, () => [], {}, {}, s => s,
  () => true, () => {}, () => {}, m => toasts.push(m), async () => {}, async () => '', 'מקום ללא אתר');

let failures = 0;
const t = (n, c) => { if (c) console.log('  ok - ' + n); else { failures++; console.log('  FAIL - ' + n); } };

async function run() {
  hasSite = false; api.prepModalEmsSection('מקום ללא אתר');
  t('site-less modal shows the ⚠️ block, not a create button', /לא מקושר/.test(box.innerHTML) && !/createEmsTaskForKibbutz/.test(box.innerHTML));

  hasSite = true; box.innerHTML = ''; api.prepModalEmsSection('דפנה');
  t('linked modal shows the create button', /createEmsTaskForKibbutz/.test(box.innerHTML));

  hasSite = false; toasts = [];
  await api.createEmsTaskForKibbutz();
  t('createEmsTaskForKibbutz refuses when site-less', toasts.some(m => /לא מקושר|אין אתר/.test(m)));

  console.log(failures ? `\n${failures} FAILED` : '\nblock checks passed');
  process.exit(failures ? 1 : 0);
}
run();
