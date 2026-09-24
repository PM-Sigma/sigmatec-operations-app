// Records goldens from the CURRENT js/src/08-inventory.js (package I, task L2) — the same
// technique test-inventory-pool.mjs already uses to evaluate that file for real. Run once, before
// L6 delegates 08-inventory.js to window.SigmaInv; NEVER re-run after that (it would be recording
// SigmaInv against itself). test-inventory-parity.mjs pins the source sha this was recorded from.
//
//   node scripts/inventory-goldens-record.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(root + p, 'utf8');

const POOL = 'חברה';
const SUPPLIER = 'ספק';
const PERSONS = ['עמיחי', 'אביאם', 'ניתאי', 'משרד'];
const NONK = [POOL, 'ספירה', SUPPLIER, 'תקול', ...PERSONS];

/** Evaluate the CURRENT js/src/08-inventory.js for real, over one ledger. */
export function legacy08(movements, products, user = 'עמיחי') {
  const csv = [];
  const doc = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
  };
  const win = { innerWidth: 1440, SHEET_DATA: { movements, products }, sigmaBus: { addEventListener() {} }, __csv: csv };
  const src = read('js/src/08-inventory.js') +
    '\ninvDownloadCSV = (rows) => window.__csv.push(rows);' +
    '\nreturn { computeStock, poolStockMap, lowStockReport, productCategoryMap, sortByCategoryThenName, invExportStock, invExportKibbutzInventory };';
  const fn = new Function(
    'window', 'document', 'POOL_LOCATION', 'INV_LOCATIONS', 'NON_KIBBUTZ_LOCATIONS',
    'getCurrentUser', 'isViewer', 'checkEditPermission', 'invLoadingPlaceholder',
    'getActiveProducts', 'alert', 'setTimeout', 'Blob', 'URL',
    src,
  );
  const api = fn(
    win, doc, POOL, [POOL], NONK,
    () => user, () => false, () => true, () => null,
    () => products.filter(p => p.active), () => {}, () => 0,
    function () {}, { createObjectURL() { return ''; }, revokeObjectURL() {} },
  );
  api.invExportStock();
  api.invExportKibbutzInventory();
  const stock = api.computeStock();
  const pool = api.poolStockMap();
  return {
    stock, pool,
    low: api.lowStockReport(),
    cat: api.productCategoryMap(),
    sorted: api.sortByCategoryThenName(Object.keys(pool), api.productCategoryMap()),
    poolCsv: csv[0], kibbutzCsv: csv[1],
  };
}

/** Evaluate the CURRENT js/src/07-orders.js's parseLocalToItems for real (task L4). */
export function legacy07Parse(text, catalog) {
  const src = read('js/src/07-orders.js') + '\nreturn { parseLocalToItems };';
  const fn = new Function('window', 'document', 'getActiveProducts', 'getCurrentUser', 'localStorage', src);
  const api = fn(
    { SHEET_DATA: { requirements: [] } }, { querySelectorAll: () => [] },
    () => catalog.map(name => ({ name })), () => 'עמיחי', { getItem: () => null, setItem() {} },
  );
  return api.parseLocalToItems(text);
}

function main() {
  const { ledgers, products } = JSON.parse(read('app/src/lib/__fixtures__/inventory/ledgers.json'));
  const corpus = JSON.parse(read('app/src/lib/__fixtures__/inventory/parse-corpus.json'));
  const out = {};
  for (const [name, rows] of Object.entries(ledgers)) out[name] = legacy08(rows, products, 'עמיחי');
  out.parse = {};
  for (const text of corpus.texts) out.parse[text] = legacy07Parse(text, corpus.catalog);
  out.recordedFrom = createHash('sha1').update(read('js/src/08-inventory.js')).digest('hex');
  out.recordedFrom07 = createHash('sha1').update(read('js/src/07-orders.js')).digest('hex');
  writeFileSync(root + 'app/src/lib/__fixtures__/inventory/legacy-goldens.json', JSON.stringify(out, null, 2) + '\n');
  console.log('recorded', Object.keys(ledgers).length, 'ledgers (08) +', corpus.texts.length, 'parse corpus texts (07)');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
