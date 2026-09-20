// test-edge-imports.mjs — the edge functions' import surface. Task 34.
//
// The deployed `push-send` refused to BOOT after the Task-34 redeploy:
//   SyntaxError: Identifier 'digestBody' has already been declared
// `index.ts` imported `digestBody` from usageNarrative.ts AND from alerts.ts. Two modules,
// one name, no local disambiguation — a module-level SyntaxError, so the function does not
// start at all and every cron call 500s. Nothing in the repo noticed: the legacy runners
// never look at supabase/functions, and the app's vitest suite compiles the copy-and-pinned
// COPIES of those modules (app/src/lib/*), not the function entry points that import them.
//
// `npm run qa` now runs the real gate — `deno check supabase/functions/*/index.ts`, which
// type-checks every entry point the way the Supabase runtime does. This file is the offline
// half of that gate: it needs no network and no Deno binary, so `npm test` can run it on a
// plane, and it catches the one failure mode that actually shipped.
//
// Three contracts over supabase/functions/*/index.ts:
//   1. no imported binding name is introduced twice in one file (the SyntaxError above)
//   2. no imported binding collides with a top-level declaration in the same file
//   3. no module is imported twice (two `from "./x.ts"` lines is how #1 starts)
//
//   node test-edge-imports.mjs
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const FN = new URL('./supabase/functions/', import.meta.url);
const dirs = readdirSync(FN, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(new URL(d.name + '/index.ts', FN)))
  .map(d => d.name)
  .sort();

assert.ok(dirs.length > 0, 'no supabase/functions/*/index.ts found — did the layout change?');

let checks = 0;
const problems = [];

/** Every binding an `import … from "…"` statement introduces, with the specifier it came from. */
function importedBindings(src) {
  const out = [];   // { name, from, raw }
  const re = /^\s*import\s+([^;'"]*?)\s+from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1], from = m[2];
    // `import X from` / `import * as X from` — the default and namespace forms
    const dflt = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (dflt) out.push({ name: dflt[1], from, raw: m[0].trim() });
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) out.push({ name: ns[1], from, raw: m[0].trim() });
    // `{ a, b as c, type D }` — `type` imports are erased and cannot collide at runtime, but
    // TypeScript still rejects a duplicate identifier, so they are checked the same way.
    const braced = /\{([\s\S]*)\}/.exec(clause);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const p = part.trim().replace(/^type\s+/, '');
        if (!p) continue;
        const as = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(p);
        const name = as ? as[1] : (/^([A-Za-z_$][\w$]*)/.exec(p) || [])[1];
        if (name) out.push({ name, from, raw: m[0].trim() });
      }
    }
  }
  return out;
}

/** Top-level `const/let/var/function/class` names — an import may not collide with one either. */
function topLevelDecls(src) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:const|let|var|function\s*\*?|class|async\s+function\s*\*?)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

for (const d of dirs) {
  const file = 'supabase/functions/' + d + '/index.ts';
  const src = readFileSync(new URL(d + '/index.ts', FN), 'utf8');
  const imports = importedBindings(src);
  const decls = topLevelDecls(src);

  // 1 — a binding name introduced twice
  const seen = new Map();
  for (const b of imports) {
    checks++;
    if (seen.has(b.name)) {
      problems.push(`${file}: '${b.name}' is imported twice — from "${seen.get(b.name)}" and from "${b.from}". `
        + `That is a module-level SyntaxError ("Identifier '${b.name}' has already been declared") and the function will not boot. `
        + `Alias one of them: \`import { ${b.name} as <something>Name } from "${b.from}"\`.`);
    } else seen.set(b.name, b.from);
  }

  // 2 — a binding that collides with a local declaration
  for (const b of imports) {
    checks++;
    if (decls.has(b.name)) {
      problems.push(`${file}: '${b.name}' is both imported from "${b.from}" and declared at the top level of the file — same SyntaxError.`);
    }
  }

  // 3 — the same module imported twice
  const froms = new Map();
  for (const b of imports) {
    if (froms.has(b.from) && froms.get(b.from) !== b.raw) {
      problems.push(`${file}: "${b.from}" is imported by two separate statements — merge them, so a duplicate name is visible on one line.`);
      froms.set(b.from, b.raw);
    } else froms.set(b.from, b.raw);
  }
  checks++;
}

assert.ok(problems.length === 0, 'edge-function import problems:\n  · ' + problems.join('\n  · '));

console.log('✅ test-edge-imports.mjs — ' + dirs.length + ' edge functions, ' + checks
  + ' import-binding checks, no duplicate or colliding identifier');
