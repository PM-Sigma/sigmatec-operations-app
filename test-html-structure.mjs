// test-html-structure.mjs — the index.html structural contract (Task 31 fix round 1, A1+A2).
//
// A single stray `</div>` (index.html:274 on d59c692) closed `#kibbutz-view` 64 lines early.
// Nothing failed: the browser silently reparented `#inventory-view`…`#burns-view` onto <body>,
// `showPage()` kept flipping the right `display`, and the card home simply never went away —
// every module page opened ~3.4k px below the fold. HTML has no compiler; this file is it.
//
// Three contracts:
//   1. every element in index.html is balanced (a real tag-stack walk, not a brace count)
//   2. no `#*-view` page is nested inside another view; all are top-level blocks
//   3. the app chrome (bell, header island, user badge, EMS bubble) lives OUTSIDE `#kibbutz-view`
//      so it renders on every page, not only on the card home
//
//   node test-html-structure.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

// ── a tag-stack walk over the document ────────────────────────────────────────
// Void elements never nest; <script>/<style>/<textarea> hold raw text that must not be parsed.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea']);
// Tags the HTML spec lets you leave open; index.html does not use them unclosed, but a stack
// walk must not trip over one if it appears.
const OPTIONAL_CLOSE = new Set(['li', 'p', 'option', 'tr', 'td', 'th', 'thead', 'tbody']);

const lineOf = i => html.slice(0, i).split('\n').length;

/** @returns {{tag:string,line:number,attrs:string,children:any[],parent:any}} root node */
function parse() {
  const root = { tag: '#root', line: 0, attrs: '', children: [], parent: null };
  const stack = [root];
  // The attribute part skips over quoted values, because index.html really does carry `>`
  // inside four of them (`onclick="if(a>b)…"`). The quotes are written as \x22 / \x27 rather
  // than literally, and the comment delimiters as hex escapes: a regex literal holding both kinds of
  // raw quote trips semgrep's JS parser, and a literal `<!--` inside a script is a LEGACY
  // HTML-like line comment in sloppy-mode JS, which makes every parser downstream of it
  // disagree with this one. A gate that cannot parse a file calls the whole scan untrustworthy.
  const re = /<!\x2D\x2D[\s\S]*?\x2D\x2D>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\x22[^\x22]*\x22|\x27[^\x27]*\x27|[^>\x22\x27])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, rawTag, attrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    const line = lineOf(m.index);
    if (!closing) {
      if (RAW.has(tag)) { // skip to the matching close, contents are text
        const end = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
        if (end >= 0) re.lastIndex = html.indexOf('>', end) + 1;
        continue;
      }
      const node = { tag, line, attrs, children: [], parent: stack[stack.length - 1] };
      node.parent.children.push(node);
      if (!VOID.has(tag) && !selfClose) stack.push(node);
    } else {
      // pop any spec-optional-close tags left open above the one we are closing
      while (stack.length > 1 && stack[stack.length - 1].tag !== tag
             && OPTIONAL_CLOSE.has(stack[stack.length - 1].tag)) stack.pop();
      const top = stack[stack.length - 1];
      ok(stack.length > 1 && top.tag === tag,
        `index.html:${line} — stray </${tag}>: the innermost open element is `
        + (stack.length > 1 ? `<${top.tag}> opened at index.html:${top.line}` : 'nothing')
        + '. An unbalanced tag silently reparents everything after it (see A1).');
      stack.pop();
    }
  }
  ok(stack.length === 1,
    'index.html has unclosed element(s): '
    + stack.slice(1).map(n => `<${n.tag}> at :${n.line}`).join(', '));
  return root;
}

const root = parse();

// ── walk the tree, index every element carrying an id ─────────────────────────
const byId = new Map();
(function walk(n) {
  const id = /\bid\s*=\s*["']([^"']+)["']/.exec(n.attrs || '');
  if (id) byId.set(id[1], n);
  n.children.forEach(walk);
})(root);

const idOf = n => (/\bid\s*=\s*["']([^"']+)["']/.exec(n?.attrs || '') || [])[1];
const where = n => n ? `<${n.tag}${idOf(n) ? '#' + idOf(n) : ''}> (index.html:${n.line})` : 'nothing';

// ── (2) every page view is a sibling under one parent ─────────────────────────
const PAGES = ['kibbutz', 'inventory', 'attendance', 'calendar', 'dev', 'pushlog', 'burns'];
const views = PAGES.map(p => `${p}-view`);
for (const v of views) ok(byId.has(v), `index.html is missing #${v} — showPage('${v.replace('-view', '')}') would throw`);

// index.html keeps the card home + inventory + attendance inside `.container` and the four
// later pages as its siblings on <body> (same on origin/main). Either is fine; what must hold
// is that no view is nested INSIDE another one, and that every view is a top-level block —
// otherwise `showPage()`'s `display` flip on one view can never hide it.
const container = byId.get('kibbutz-view').parent;
ok(/\bclass\s*=\s*["'][^"']*\bcontainer\b/.test(container.attrs),
  `#kibbutz-view hangs off ${where(container)}, expected the top-level .container`);
const allowed = new Set([container, container.parent]);
const strays = views.filter(v => !allowed.has(byId.get(v).parent));
ok(strays.length === 0,
  'these page views are not top-level blocks — nested inside other markup, showPage() cannot '
  + 'hide them independently:\n    '
  + strays.map(v => `#${v} → ${where(byId.get(v).parent)}`).join('\n    '));

// no view may contain another view
for (const v of views) {
  const inner = [];
  (function walk(n) { const i = idOf(n); if (i && views.includes(i)) inner.push(i); n.children.forEach(walk); })({ children: byId.get(v).children });
  ok(inner.length === 0, `#${v} contains another page view (${inner.join(', ')}) — it can never be hidden on its own`);
}

// ── (3) the app chrome lives outside #kibbutz-view (A2) ───────────────────────
// The 🔔 inventory bell, the Ctrl+K/➕/🌙 island, the user badge and the EMS bubble are shell
// chrome. Inside #kibbutz-view they measure 0×0 on every other page — the low-stock bell was
// unreachable on the מלאי page it belongs to.
const CHROME = ['sigma-alerts', 'sigma-header-actions', 'userBadge', 'emsBubble'];
const kib = byId.get('kibbutz-view');
const inside = new Set();
(function walk(n) { const i = idOf(n); if (i) inside.add(i); n.children.forEach(walk); })(kib);
for (const c of CHROME) {
  ok(byId.has(c), `index.html is missing #${c}`);
  ok(!inside.has(c),
    `#${c} is inside #kibbutz-view — it is app chrome and must render on every page, but there `
    + 'it collapses to 0×0 as soon as showPage() hides the card home (A2).');
}

// …and it is still inside the shared .container, above the views
for (const c of CHROME) {
  let n = byId.get(c), found = false;
  while (n) { if (n === container) { found = true; break; } n = n.parent; }
  ok(found, `#${c} escaped the .container entirely (index.html:${byId.get(c).line})`);
}

// the card home itself stays inside #kibbutz-view and hides with it
for (const id of ['sigma-home', 'sigma-today', 'sigma-burns', 'viewerReportsHub']) {
  ok(inside.has(id), `#${id} belongs to the card home and must live inside #kibbutz-view`);
}

console.log(`test-html-structure: ${checks} checks passed (${views.length} page views, `
  + `${CHROME.length} chrome nodes, ${byId.size} ids).`);
