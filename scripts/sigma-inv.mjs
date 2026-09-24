// Compiles app/src/lib/inventory.ts into the IIFE the legacy bundle carries as window.SigmaInv
// (package I, task L2/L6). One copy of every stock/product/order/cert rule — the legacy modules
// (js/src/06-products.js, 07-orders.js, 08-inventory.js, 20-delivery-cert.js) delegate to it
// instead of holding their own copy.
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function sigmaInvSource() {
  const r = esbuild.buildSync({
    entryPoints: [root + 'app/src/lib/inventory.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'SigmaInv',
    write: false,
    target: 'es2017',
    tsconfig: root + 'app/tsconfig.json',
    logLevel: 'silent',
    legalComments: 'none',
  });
  return r.outputFiles[0].text;
}

export function loadSigmaInv() {
  return new Function(sigmaInvSource() + '\nreturn SigmaInv;')();
}
