// node scripts/inventory-golden-prod.mjs --record <backup.json>   (BEFORE L6 — evaluates the old 08)
// node scripts/inventory-golden-prod.mjs --verify <backup.json>   (after L6/U9/U10 — evaluates SigmaInv)
//
// Checkpoint for the biggest risk in this package: the SAME stock numbers must come out of the
// old code and the new one, on REAL data, not just the synthetic ledgers.json fixtures. Output
// lives ONLY in the local backup folder — this repo is public, and a snapshot of real customer
// stock has no business in it.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSigmaInv } from './sigma-inv.mjs';

const [mode, file] = process.argv.slice(2);
const OUT = 'C:/Users/idann/Backups/Sigmatec Operations/inventory-golden.json';

if (!mode || !file) {
  console.error('usage: node scripts/inventory-golden-prod.mjs --record|--verify <backup.json>');
  process.exit(2);
}

const snap = JSON.parse(readFileSync(file, 'utf8'));
const t = snap.tables || {};
if (!Array.isArray(t.movements) || !Array.isArray(t.products)) {
  console.error('backup has no movements/products (expected snap.tables.{movements,products})');
  process.exit(2);
}
const movements = t.movements.map(m => ({
  product: m.product || '', fromLocation: m.from_location || '', toLocation: m.to_location || '',
  quantity: parseFloat(m.quantity) || 0,
}));

if (mode === '--record') {
  const { legacy08 } = await import('./inventory-goldens-record.mjs');
  const g = legacy08(movements, t.products, 'עמיחי');
  writeFileSync(OUT, JSON.stringify({ taken_on: snap.taken_on, stock: g.stock, pool: g.pool }, null, 1));
  console.log('recorded prod golden for', snap.taken_on, '→', OUT);
} else if (mode === '--verify') {
  const want = JSON.parse(readFileSync(OUT, 'utf8'));
  const inv = loadSigmaInv();
  const got = { stock: inv.stockByLocation(movements), pool: inv.poolStock(movements) };
  const same = JSON.stringify(got.stock) === JSON.stringify(want.stock) && JSON.stringify(got.pool) === JSON.stringify(want.pool);
  console.log(same ? 'PROD GOLDEN OK (' + want.taken_on + ')' : 'PROD GOLDEN MISMATCH');
  if (!same) {
    console.log('want.pool =', JSON.stringify(want.pool));
    console.log('got.pool  =', JSON.stringify(got.pool));
  }
  process.exit(same ? 0 : 1);
} else {
  console.error('unknown mode:', mode, '(use --record or --verify)');
  process.exit(2);
}
