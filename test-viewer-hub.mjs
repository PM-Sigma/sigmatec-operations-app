// Round 5, L5: the xlHub* viewer-report functions (js/src/21-excel-export.js) now take their
// arguments; called with none they still fall back to today's DOM read, unchanged.
//   node test-viewer-hub.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('./js/src/21-excel-export.js', import.meta.url), 'utf8');
const start = src.indexOf('function xlHubVisitsPdf'), end = src.indexOf('function xlHubSumXlsx');
assert.ok(start > -1 && end > start, 'xlHub* functions not found where expected');
const body = src.slice(start, src.indexOf('\n', end + 1) + 1);

const calls = [];
const ctx = {
  document: { getElementById: id => ({ value: 'DOM:' + id }) },
  // the functions 21-excel-export.js:339-382 really call
  openVisitsReportHTMLView: (...a) => calls.push(['openVisitsReportHTMLView', ...a]),
  xlExportVisits: (...a) => calls.push(['xlExportVisits', ...a]),
  certRangeReportRange: (...a) => calls.push(['certRangeReportRange', ...a]),
  xlExportCerts: (...a) => calls.push(['xlExportCerts', ...a]),
  xlExportCertSummary: (...a) => calls.push(['xlExportCertSummary', ...a]),
  xlMonthRange: m => [m + '-01', m + '-31'],
};
vm.createContext(ctx);
vm.runInContext(body + '\nthis.f = { xlHubVisitsPdf, xlHubSumPdf };', ctx);

ctx.f.xlHubVisitsPdf('2026-09-01', '2026-09-23');
assert.ok(JSON.stringify(calls).includes('2026-09-01'), 'the parameters must reach the report');
assert.ok(!JSON.stringify(calls).includes('DOM:'), 'with parameters, the DOM is not read');

calls.length = 0;
ctx.f.xlHubVisitsPdf();
assert.ok(JSON.stringify(calls).includes('DOM:'), 'without parameters, today’s DOM path still works');

calls.length = 0;
ctx.f.xlHubSumPdf('2026-08');
assert.deepEqual(calls, [['certRangeReportRange', '2026-08-01', '2026-08-31']], 'the month preset reaches the summary report');

console.log('PASS');
