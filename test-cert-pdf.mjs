// Repeatable end-to-end PDF test for the delivery-certificate print pipeline.
// Renders certDocHtml() -> headless-Edge print-to-PDF -> markitdown text extraction -> assertions.
// Run: node test-cert-pdf.mjs   (exit 0 = all pass, non-zero = at least one failure)

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import assert from 'assert';

const SCRATCH = 'C:\\Users\\idann\\AppData\\Local\\Temp\\claude\\C--Users-idann-Projects-Sigmatec-Operations-App\\69b21e8a-f684-4cdf-a6f7-1d000b0b4b59\\scratchpad';
const REPO = 'C:\\Users\\idann\\Projects\\Sigmatec Operations App';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

fs.mkdirSync(SCRATCH, { recursive: true });

// ---- 1. load certDocHtml() in an isolated function scope ----
const srcLogo = fs.readFileSync(path.join(REPO, 'js/src/20-delivery-cert-logo.js'), 'utf8');
const srcCert = fs.readFileSync(path.join(REPO, 'js/src/20-delivery-cert.js'), 'utf8');

const certDocHtml = (function () {
  const window = {};
  const fn = new Function('window', srcLogo + '\n' + srcCert + '\nreturn certDocHtml;');
  return fn(window);
})();

// ---- 2. build the two certs ----
const baseCert = {
  date: '2026-06-01',
  kibbutz: 'שדה אליהו',
  customer: {
    name: 'שדה - אל חשמל בע"מ',
    company_id: '516702735',
    address: 'עמק המעיינות',
    contact: 'יוסי כהן'
  },
  items: [
    { name: 'מונה Landis+Gyr E360PP', qty: 3 },
    { name: 'אנטנה', qty: 2 },
    { name: 'Partner Sim', qty: 5 }
  ],
  notes: 'לא לחייב',
  source: 'visit',
  refId: 'v_test'
};

const certs = {
  num: { ...baseCert, number: 1234 },
  draft: { ...baseCert, number: null }
};

// ---- 3. strip the auto-print script, write HTML files ----
const htmlPaths = {};
for (const key of Object.keys(certs)) {
  let html = certDocHtml(certs[key]);
  html = html.replace(/<script>[\s\S]*?<\/script>/, '');
  const p = path.join(SCRATCH, `certtest_${key}.html`);
  fs.writeFileSync(p, html, 'utf8');
  htmlPaths[key] = p;
}

// ---- 4. print each HTML to PDF via headless Edge ----
function waitForFile(p, minBytes, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(p) && fs.statSync(p).size > minBytes) return true;
    execFileSync(process.platform === 'win32' ? 'cmd' : 'sleep', process.platform === 'win32' ? ['/c', 'timeout /t 1 /nobreak >nul'] : ['0.5']);
  }
  return fs.existsSync(p) && fs.statSync(p).size > minBytes;
}

const pdfPaths = {};
for (const key of Object.keys(htmlPaths)) {
  const outPdf = path.join(SCRATCH, `certtest_${key}.pdf`);
  pdfPaths[key] = outPdf;
  if (fs.existsSync(outPdf)) fs.unlinkSync(outPdf);
  const fileUrl = 'file:///' + htmlPaths[key].replace(/\\/g, '/');
  execFileSync(EDGE, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--print-to-pdf=' + outPdf,
    fileUrl
  ], { timeout: 30000 });
  const ok = waitForFile(outPdf, 20 * 1024, 10000);
  if (!ok) {
    console.error(`FAIL: PDF not produced or too small for "${key}": ${outPdf}`);
  }
}

// ---- 5. page count check via PyMuPDF ----
function pageCount(pdfPath) {
  const out = execFileSync('python', ['-c', 'import fitz,sys; print(len(fitz.open(sys.argv[1])))', pdfPath]).toString().trim();
  return parseInt(out, 10);
}

// ---- 6. markitdown extraction ----
function extractText(pdfPath, key) {
  const outTxt = path.join(SCRATCH, `certtest_${key}.md`);
  try {
    execFileSync(`markitdown "${pdfPath}" > "${outTxt}"`, {
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    return fs.readFileSync(outTxt, 'utf8');
  } catch (e) {
    // fallback: try direct stdout capture
    const buf = execFileSync('markitdown', [pdfPath], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    return buf.toString('utf8');
  }
}

function reverse(s) { return s.split('').reverse().join(''); }
function containsEither(text, s) { return text.includes(s) || text.includes(reverse(s)); }

// ---- 7 & 8. assertions ----
const results = [];
function check(label, cond) {
  results.push({ label, pass: !!cond });
}

const extracted = {};

for (const key of Object.keys(pdfPaths)) {
  const pdf = pdfPaths[key];

  let pc = null;
  try { pc = pageCount(pdf); } catch (e) { pc = -1; }
  check(`[${key}] PDF exists & >20KB`, fs.existsSync(pdf) && fs.statSync(pdf).size > 20 * 1024);
  check(`[${key}] page count === 1`, pc === 1);

  let text = '';
  try { text = extractText(pdf, key); } catch (e) { text = ''; }
  extracted[key] = text;

  if (key === 'num') {
    check(`[num] contains "1234"`, text.includes('1234'));
  } else {
    check(`[draft] does NOT contain "1234"`, !text.includes('1234'));
    check(`[draft] contains "טיוטה" or reversed`, containsEither(text, 'טיוטה'));
  }

  check(`[${key}] contains qty 3`, /\b3\b/.test(text));
  check(`[${key}] contains qty 2`, /\b2\b/.test(text));
  check(`[${key}] contains qty 5`, /\b5\b/.test(text));
  check(`[${key}] contains total 10`, /\b10\b/.test(text));

  check(`[${key}] contains "E360PP"`, text.includes('E360PP'));
  check(`[${key}] contains "Landis"`, text.includes('Landis'));
  check(`[${key}] contains "Partner Sim"`, text.includes('Partner Sim'));

  check(`[${key}] contains customer company_id 516702735`, text.includes('516702735'));
  check(`[${key}] contains Sigmatec ח.פ. 515923084`, text.includes('515923084'));

  check(`[${key}] contains office@sigmatec-energy.com`, text.includes('office@sigmatec-energy.com'));

  const dateOk = text.includes('2026') && (text.includes('1.6') || text.includes('6.1') || text.includes('06/01') || text.includes('01/06'));
  check(`[${key}] date reflects 2026-06-01`, dateOk);

  check(`[${key}] contains NO ₪`, !text.includes('₪'));
  check(`[${key}] contains NO $`, !text.includes('$'));
}

// ---- report ----
console.log('\n=== Delivery Certificate PDF Test — Assertion Table ===\n');
let anyFail = false;
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) anyFail = true;
  console.log(`[${mark}] ${r.label}`);
}

console.log('\n--- markitdown sample (numbered cert, first ~10 lines) ---');
console.log((extracted.num || '').split('\n').slice(0, 10).join('\n'));

console.log('\n--- markitdown sample (draft cert, first ~10 lines) ---');
console.log((extracted.draft || '').split('\n').slice(0, 10).join('\n'));

const failCount = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failCount}/${results.length} assertions passed.`);

if (anyFail) {
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
