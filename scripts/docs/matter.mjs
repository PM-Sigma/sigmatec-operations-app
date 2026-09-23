// scripts/docs/matter.mjs — the ONE front-matter parser docs/system/**/*.md tooling shares.
//
// Not a general YAML parser: it only has to read the shapes THIS repo's front-matter uses
// (spec §4.1) — scalars, null, quoted strings, inline `[a, b]` arrays, block `- item` arrays,
// and one level of inline `{ k: v, k2: v2 }` objects (`last_validated:`). No `js-yaml` dependency
// for a few dozen lines of grammar we define ourselves.
const scalar = (s) => {
  const t = s.trim();
  if (t === '' || t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
};

function parseInlineArray(s) {
  const inner = s.trim().slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((x) => scalar(x));
}

function parseInlineObject(s) {
  const inner = s.trim().slice(1, -1).trim();
  const out = {};
  if (!inner) return out;
  for (const part of inner.split(',')) {
    const at = part.indexOf(':');
    if (at === -1) continue;
    out[part.slice(0, at).trim()] = scalar(part.slice(at + 1));
  }
  return out;
}

/** { data, content } — `data` is the parsed front-matter object, `content` is the FULL original
 * text (front-matter included) unless `bodyOnly` is passed, since callers like gen-module-
 * inventory.mjs rewrite GENERATED blocks in the whole file, not just the body. */
export default function matter(raw, { bodyOnly = false } = {}) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return { data: {}, content: raw };
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return { data: {}, content: raw };
  const fmEnd = raw.indexOf('\n', end + 1) + 1 || raw.length;
  const fmText = raw.slice(4, end);
  const body = raw.slice(fmEnd);
  const lines = fmText.split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest.trim() === '') {
      // block list under this key: following lines "  - x"
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s?/.test(lines[j])) {
        items.push(scalar(lines[j].replace(/^\s*-\s?/, '')));
        j++;
      }
      data[key] = items;
      i = j - 1;
    } else if (rest.trim().startsWith('[')) {
      data[key] = parseInlineArray(rest);
    } else if (rest.trim().startsWith('{')) {
      data[key] = parseInlineObject(rest);
    } else {
      data[key] = scalar(rest);
    }
  }
  return { data, content: bodyOnly ? body : raw };
}
