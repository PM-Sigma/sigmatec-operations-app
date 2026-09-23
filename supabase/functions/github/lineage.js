// supabase/functions/github/lineage.js — pure, dependency-free; imported by index.ts (Deno) and
// test-github-lineage.mjs (Node), so there is no copy to drift.
export function chainOf(node) {
  const out = [], seen = new Set([node && node.number]);
  let p = node && node.parent;
  while (p && p.number && !seen.has(p.number) && out.length < 4) {
    seen.add(p.number);
    out.push({ number: p.number, title: String(p.title || ''), state: p.state === 'CLOSED' ? 'CLOSED' : 'OPEN' });
    p = p.parent;
  }
  return out;
}
