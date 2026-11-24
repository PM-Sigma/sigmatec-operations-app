// ui/ import graph, CASE-SENSITIVE like GitHub Pages (24.11: a case-only chunk collision on Windows broke the field island).
// Every named import/export between committed ui/*.js files must resolve to a tracked file that exports it.
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const tracked = new Set(execSync('git ls-files ui', { encoding: 'utf8' }).split('\n').filter(Boolean).map(f => f.slice(3)));
const read = f => fs.readFileSync('ui/' + f, 'utf8');
const exportsOf = t => { const s = new Set(); for (const m of t.matchAll(/export\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) { const a = p.trim().split(/\s+as\s+/); s.add((a[1] || a[0]).trim()); } if (/export default/.test(t)) s.add('default'); return s; };
const bad = []; let n = 0;
for (const f of tracked) { if (!f.endsWith('.js')) continue; const t = read(f);
  for (const m of t.matchAll(/(?:import|export)\s*\{([^}]*)\}\s*from\s*"\.\/([^"?]+)(\?[^"]*)?"/g)) { n++;
    const dep = m[2]; if (!tracked.has(dep)) { bad.push(`${f}: missing file ${dep}`); continue; }
    const ex = exportsOf(read(dep)); for (const p of m[1].split(',')) { const nm = p.trim().split(/\s+as\s+/)[0].trim(); if (nm && !ex.has(nm)) bad.push(`${f} imports {${nm}} from ${dep}`); } }
  for (const m of t.matchAll(/import\(\s*"\.\/([^"?]+)/g)) { n++; if (!tracked.has(m[1])) bad.push(`${f}: dynamic import missing ${m[1]}`); }
}
const idx = fs.readFileSync('index.html', 'utf8'); for (const m of idx.matchAll(/ui\/([a-z0-9._-]+\.(?:js|css))/gi)) if (!tracked.has(m[1])) bad.push('index.html: missing ui/' + m[1]);
if (bad.length) { console.log(bad.slice(0, 20).join("\n")); process.exit(1); }
console.log("test-ui-imports: " + n + " imports resolve (case-sensitive)");
