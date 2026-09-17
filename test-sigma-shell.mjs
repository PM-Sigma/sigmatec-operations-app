// Contract sweep for the React-islands shell (Task 0, fix round 1).
// These are the rules a later task can silently break from the outside, so they are checked
// against the real files rather than mocked:
//   1. the phone bottom-nav CSS only applies once the island actually mounted
//   2. every write/clear of USER_KEY announces 'user-changed' on the bus
//   3. the boot bundle stays free of the data stack (TanStack / supabase-js)
//   4. ui/ holds a built bundle that index.html references with a ?v= stamp
import fs from 'node:fs';

let failures = 0;
const ok = (name) => console.log('  ✓ ' + name);
const check = (name, cond, detail) => { if (cond) ok(name); else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

console.log('\n[1] phone nav takeover is gated on body.sigma-nav-ready');
{
  const css = read('./css/app.css');
  // the ≤767px block that owns the bottom-nav takeover (app.css has other 767px blocks)
  const at = css.indexOf('.page-nav', css.indexOf('@media (max-width: 767px)'));
  const rules = at === -1 ? '' : css.slice(css.lastIndexOf('@media', at), css.indexOf('\n}', at) + 2);
  check('the ≤767px block exists', rules.includes('@media') && rules.includes('.page-nav'), 'no bottom-nav media block found');
  for (const sel of ['.page-nav', 'padding-bottom: 84px', '#visitFab']) {
    const line = rules.split('\n').find(l => l.includes(sel));
    check(`"${sel}" is gated`, !!line && line.includes('body.sigma-nav-ready'), line && line.trim());
  }
  // #visitFab gets an inline style from showPage() — only !important can win
  const fab = rules.split('\n').find(l => l.includes('#visitFab'));
  check('#visitFab rule beats the inline style', !!fab && fab.includes('!important'));

  const nav = read('./app/src/components/Nav.tsx');
  check('Nav adds the class on mount', nav.includes("classList.add('sigma-nav-ready')"));
  check('Nav removes it on unmount', nav.includes("classList.remove('sigma-nav-ready')"));
}

console.log('\n[2] every USER_KEY write/clear emits user-changed');
{
  for (const f of ['11-search-login', '15-login-gate']) {
    const src = read(`./js/src/${f}.js`).split('\n');
    src.forEach((line, i) => {
      if (!/localStorage\.(setItem|removeItem)\(USER_KEY/.test(line)) return;
      const window_ = src.slice(i, i + 4).join('\n');
      check(`${f}.js:${i + 1} announces user-changed`, window_.includes("sigmaEmit('user-changed')"), line.trim());
    });
  }
}

console.log('\n[3] the boot bundle carries no data stack');
{
  const main = read('./app/src/main.tsx');
  check('main.tsx does not import lib/query', !main.includes("lib/query"));
  check('main.tsx does not import lib/supabase', !main.includes("lib/supabase"));
  const islands = read('./app/src/islands.tsx');
  check('islands.tsx mounts without providers', !islands.includes('QueryClientProvider'));
  const sb = read('./app/src/lib/supabase.ts');
  check('supabase-js is imported lazily', sb.includes("import('@supabase/supabase-js')"));
  check('supabase-js is not imported eagerly', !/^import \{[^}]*\} from '@supabase\/supabase-js'/m.test(sb));
  const q = read('./app/src/lib/query.ts');
  check('one shared QueryClient + persister', q.includes('export const queryClient') && q.includes('export const persister'));
  check('islands opt in via SigmaProviders', q.includes('export function SigmaProviders'));

  const bundle = read('./ui/sigma.js');
  check('bundle has no supabase-js', !bundle.includes('supabase'), 'supabase-js leaked into the boot chunk');
  check('bundle has no TanStack Query', !/QueryClient|tanstack/i.test(bundle), 'TanStack leaked into the boot chunk');
}

console.log('\n[4] build output is wired into the page');
{
  const idx = read('./index.html');
  check('ui/sigma.js is stamped', /ui\/sigma\.js\?v=\w+/.test(idx));
  check('ui/sigma.css is stamped', /ui\/sigma\.css\?v=\w+/.test(idx));
  check('sw.js precaches both', /ui\/sigma\.js/.test(read('./sw.js')) && /ui\/sigma\.css/.test(read('./sw.js')));
  const size = fs.statSync(new URL('./ui/sigma.js', import.meta.url)).size;
  console.log('  · ui/sigma.js = ' + Math.round(size / 1024) + ' kB raw');
  check('bundle under the 300 kB ceiling', size < 300 * 1024, Math.round(size / 1024) + ' kB');
}

console.log(failures ? `\nFAIL — ${failures} check(s)` : '\nPASS — sigma shell contracts hold');
process.exit(failures ? 1 : 0);
