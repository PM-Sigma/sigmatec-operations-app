// scripts/docs/gen-blocks.mjs — the shared `<!-- GENERATED:name --> … <!-- /GENERATED:name -->`
// mechanism (spec §6 / §5): a generator rewrites only what's between its markers, so hand-written
// prose in the rest of the file survives every regeneration — the same idea as
// docs/integration-map.annotations.md, but inline in the doc instead of a side file.
import fs from 'node:fs';
import path from 'node:path';

/** Replace the named block's body. Throws if the file has no such marker pair (a template that
 * drifted from what the generator expects — fail loud, don't silently no-op). */
export function setBlock(content, name, body) {
  // Matches (and replaces) the WHOLE marker pair as one span, then rebuilds it canonically
  // (open + \n + body + \n + close) — no capture-group ambiguity over where a pre-existing
  // newline "belongs", which is what made an earlier version of this function non-idempotent
  // (re-running it on its own output grew an extra blank line every time).
  const re = new RegExp(`<!-- GENERATED:${name} -->[\\s\\S]*?<!-- /GENERATED:${name} -->`);
  if (!re.test(content)) {
    throw new Error(`no <!-- GENERATED:${name} --> marker pair found`);
  }
  return content.replace(re, `<!-- GENERATED:${name} -->\n${body}\n<!-- /GENERATED:${name} -->`);
}

export function getBlock(content, name) {
  const re = new RegExp(`<!-- GENERATED:${name} -->\\n?([\\s\\S]*?)\\n?<!-- /GENERATED:${name} -->`);
  const m = re.exec(content);
  return m ? m[1] : null;
}

/** Seed a doc from its template, substituting REPLACE_ME → `slug` everywhere (front-matter id,
 * title, code globs, footer anchor) — only used the first time a doc doesn't exist yet. */
export function seedFromTemplate(templatePath, slug, extra = {}) {
  let text = fs.readFileSync(templatePath, 'utf8').replaceAll('REPLACE_ME', slug);
  for (const [k, v] of Object.entries(extra)) text = text.replaceAll(`__${k}__`, v);
  return text;
}

export function writeIfChanged(filePath, content) {
  const cur = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (cur === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}
