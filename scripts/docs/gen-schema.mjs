// scripts/docs/gen-schema.mjs — renders docs/system/schema/*.md from a saved introspection JSON.
//
//   node scripts/docs/gen-schema.mjs                    → (re)write docs/system/schema/*.md
//   node scripts/docs/gen-schema.mjs --check             → fail when the pages on disk are stale
//   node scripts/docs/gen-schema.mjs --in <path>          → use a different introspection JSON
//   node scripts/docs/gen-schema.mjs --out-dir <path>     → write pages elsewhere (tests)
//
// The introspection JSON is produced read-only by introspect.sql (information_schema + pg_policies
// + pg_proc + pg_trigger + cron.job — structure only, never row data, function bodies or cron
// command text: see introspect.sql's header). This script only renders it offline, so `npm test`
// never needs the live DB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_IN = path.join(ROOT, 'docs/system/schema/_introspection.json');
const DEFAULT_OUT = path.join(ROOT, 'docs/system/schema');
const PURPOSES = path.join(ROOT, 'docs/system/schema/_purposes.yml');

// ── a purpose-per-table / note-per-column overlay, one YAML-ish line each — no dependency for
// something this small: `table.name: one line` and `table.col: one line`, `#` comments, blanks OK.
export function parsePurposes(text) {
  const out = {};
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const at = line.indexOf(':');
    if (at === -1) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const byTable = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const key = `${r.schema}.${r.table ?? r.name}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  return m;
};

const nullFK = (c) => !c.fk_table;
const fkLink = (c, i) => nullFK(c) ? '' :
  ` → [${c.fk_table}](${c.fk_schema}.${c.fk_table}.md)`;

function renderColumns(cols, constraints, purposes, tableKey) {
  const fkByCol = new Map();
  for (const c of constraints.filter((c) => c.type === 'FOREIGN KEY')) {
    (c.columns || []).forEach((col, i) => fkByCol.set(col, { table: c.fk_table, schema: c.fk_schema, col: (c.fk_columns || [])[i] }));
  }
  const L = ['| Column | Type | Null | Default | FK | Note |', '|---|---|---|---|---|---|'];
  for (const c of cols) {
    const fk = fkByCol.get(c.name);
    const fkCell = fk ? `→ [${fk.table}](${fk.schema}.${fk.table}.md)` : '';
    const note = c.comment || purposes[`${tableKey}.${c.name}`] || '';
    L.push(`| \`${c.name}\` | ${c.type} | ${c.nullable ? 'nullable' : 'NOT NULL'} | ${c.default ? `\`${c.default}\`` : ''} | ${fkCell} | ${note} |`);
  }
  return L.join('\n');
}

function renderKeys(constraints, indexes) {
  const L = [];
  const pk = constraints.find((c) => c.type === 'PRIMARY KEY');
  L.push(`- **Primary key:** ${pk ? pk.columns.map((c) => `\`${c}\``).join(', ') : '*none*'}`);
  const uniques = constraints.filter((c) => c.type === 'UNIQUE');
  for (const u of uniques) L.push(`- **Unique:** ${u.columns.map((c) => `\`${c}\``).join(', ')} (\`${u.name}\`)`);
  for (const idx of indexes) L.push(`- \`${idx.name}\` — ${idx.definition}`);
  if (!indexes.length && !uniques.length) L.push('- *(no other indexes)*');
  return L.join('\n');
}

function renderRelations(constraints, allConstraints, schema, table) {
  const out = constraints.filter((c) => c.type === 'FOREIGN KEY');
  const in_ = allConstraints.filter((c) => c.type === 'FOREIGN KEY' && c.fk_schema === schema && c.fk_table === table);
  const L = [];
  L.push(out.length
    ? '- FK out: ' + out.map((c) => `${c.columns.map((x) => `\`${x}\``).join(', ')} → [${c.fk_table}](${c.fk_schema}.${c.fk_table}.md)`).join('; ')
    : '- FK out: *none*');
  L.push(in_.length
    ? '- FK in: ' + in_.map((c) => `[${c.schema}.${c.table}](${c.schema}.${c.table}.md) (\`${c.columns.join(', ')}\`)`).join('; ')
    : '- FK in: *none*');
  return L.join('\n');
}

function renderRLS(tableRow, policies) {
  const L = [];
  L.push(tableRow.rls_enabled
    ? `Enabled${tableRow.rls_forced ? ', forced' : ', not forced'}.`
    : '**Disabled.**');
  if (policies.length) {
    L.push('');
    L.push('| Policy | Command | Roles | Permissive | Using | With check |');
    L.push('|---|---|---|---|---|---|');
    for (const p of policies) {
      L.push(`| \`${p.name}\` | ${p.command} | ${(p.roles || []).join(', ')} | ${p.permissive} | ${p.using ? `\`${p.using}\`` : '—'} | ${p.with_check ? `\`${p.with_check}\`` : '—'} |`);
    }
  } else {
    L.push('', 'No policies defined.');
  }
  return L.join('\n');
}

function renderTriggers(triggers, functionsByKey) {
  if (!triggers.length) return '*none*';
  return triggers.map((t) => {
    const m = /FUNCTION\s+([\w.]+)\s*\(/i.exec(t.action || '');
    const fn = m ? m[1].replace(/^public\./, '') : null;
    const link = fn && functionsByKey.has(fn) ? `[${fn}](_functions.md#${fn.toLowerCase()})` : (fn || t.action);
    return `- \`${t.name}\` — ${t.timing} ${t.event} → ${link}`;
  }).join('\n');
}

// Best-effort, both optional: repo db/*.sql migrations that declare this table, and client/test
// code that reads or writes it (reuses scripts/integration-map.mjs's own regex, not duplicated).
function findMigrations(schema, table) {
  const dir = path.join(ROOT, 'db');
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:${schema}\\.)?"?${table}\\b|alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:${schema}\\.)?"?${table}\\b`, 'i');
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue;
    if (re.test(fs.readFileSync(path.join(dir, f), 'utf8'))) out.push(`db/${f}`);
  }
  return out;
}

function findUsage(table) {
  try {
    // Lazy require so a fixture run (fake table names, temp out-dir) never pays for or depends
    // on the full repo scan unless the table is real.
    const im = require(path.join(ROOT, 'scripts/integration-map.mjs'));
    return im.tablesUsed?.().filter((h) => h.name === table).slice(0, 8) || [];
  } catch {
    return [];
  }
}

export function renderTablePage(tr, { columns, constraints, indexes, policies, triggers, allConstraints, functionsByKey, purposes, generatedAt }) {
  const key = `${tr.schema}.${tr.name}`;
  const migrations = findMigrations(tr.schema, tr.name);
  const usage = [];
  try { for (const h of findUsage(tr.name)) usage.push(`${h.file}:${h.line}`); } catch { /* best-effort */ }

  const fm = [
    '---',
    `doc_id: table:${key}`,
    'doc_type: table',
    `title: ${tr.name} (table)`,
    'generated: true',
    'generator: scripts/docs/gen-schema.mjs',
    `introspected_at: ${generatedAt}`,
    'introspection_commit: null',
    '---',
    '',
  ].join('\n');

  const purpose = tr.comment || purposes[key] || '⚠ no purpose recorded';
  const body = [
    `# ${tr.name} (table)`,
    '',
    `**Schema:** \`${tr.schema}\` · **Purpose:** ${purpose}`,
    '',
    '## Columns',
    renderColumns(columns, constraints, purposes, key),
    '',
    '## Keys and indexes',
    renderKeys(constraints, indexes),
    '',
    '## Relations',
    renderRelations(constraints, allConstraints, tr.schema, tr.name),
    '',
    '## RLS',
    renderRLS(tr, policies),
    '',
    '## Triggers',
    renderTriggers(triggers, functionsByKey),
    '',
    '## Used by',
    usage.length ? usage.map((u) => `- ${u}`).join('\n') : '*none found*',
    '',
    '## Migrations',
    migrations.length ? migrations.map((m) => `- \`${m}\``).join('\n') : '*none found*',
    '',
    '## Drift vs `db/`',
    migrations.length
      ? '*(live and declared — no drift detected by name)*'
      : `Live in the DB, but no \`db/*.sql\` file declares \`${tr.name}\` by name — see local findings for anything that needs it.`,
    '',
    '---',
    `*Generated by \`scripts/docs/gen-schema.mjs\` from \`_introspection.json\` (${generatedAt}). Do not hand-edit.*`,
    '',
  ].join('\n');

  return fm + body;
}

export function renderFunctions(functions, grants, generatedAt) {
  const grantsByFn = byTable(grants.map((g) => ({ schema: g.schema, table: g.name, ...g })));
  const L = [
    '---', 'doc_id: table:_functions', 'doc_type: table', 'title: Functions',
    'generated: true', 'generator: scripts/docs/gen-schema.mjs', `introspected_at: ${generatedAt}`,
    'introspection_commit: null', '---', '',
    '# Functions', '',
    '> Signature and flags only — never the function body. See `introspect.sql`.', '',
  ];
  for (const fn of functions) {
    const key = `${fn.schema}.${fn.name}`;
    L.push(`## ${fn.name}`);
    L.push('');
    L.push(`\`${fn.schema}.${fn.name}(${fn.args || ''})\` → \`${fn.returns}\` · language \`${fn.language}\`${fn.security_definer ? ' · **SECURITY DEFINER**' : ''}`);
    if (fn.config && fn.config.length) L.push(`- config: ${fn.config.map((c) => `\`${c}\``).join(', ')}`);
    const grantees = (grantsByFn.get(key) || []).map((g) => `${g.grantee} (${g.privilege})`);
    L.push(`- grants: ${grantees.length ? grantees.join(', ') : '*none listed*'}`);
    L.push('');
  }
  return L.join('\n');
}

export function renderTriggersAndCron(triggers, cronJobs, generatedAt) {
  const L = [
    '---', 'doc_id: table:_triggers-and-cron', 'doc_type: table', 'title: Triggers and cron jobs',
    'generated: true', 'generator: scripts/docs/gen-schema.mjs', `introspected_at: ${generatedAt}`,
    'introspection_commit: null', '---', '',
    '# Triggers and cron jobs', '',
    '## Triggers', '',
    '| Table | Trigger | Timing | Event | Action |', '|---|---|---|---|---|',
  ];
  for (const t of triggers) L.push(`| ${t.schema}.${t.table} | \`${t.name}\` | ${t.timing} | ${t.event} | ${t.action} |`);
  L.push('', '## Cron jobs', '', '> Target function only — the command body never leaves the DB (§10).', '');
  L.push('| Job | Schedule | Active | Target |', '|---|---|---|---|');
  for (const c of cronJobs) L.push(`| \`${c.jobname}\` | \`${c.schedule}\` | ${c.active ? 'yes' : 'no'} | ${c.target ? `\`${c.target}\`` : '*unparsed*'} |`);
  L.push('');
  return L.join('\n');
}

export function renderReadme(data, purposes) {
  const tables = data.tables;
  const byModule = tables.map((t) => `${t.schema}.${t.name}`).sort();
  const undeclared = tables.filter((t) => !findMigrations(t.schema, t.name).length);
  const L = [
    '---', 'doc_id: system:schema-readme', 'doc_type: table', 'title: Schema',
    'generated: true', 'generator: scripts/docs/gen-schema.mjs', `introspected_at: ${data.generated_at}`,
    'introspection_commit: null', '---', '',
    '# Schema', '',
    `${tables.length} tables/views across ${data.schemas.length} schemas, introspected ${data.generated_at}.`, '',
    '## Tables', '',
    ...byModule.map((k) => `- [${k}](${k}.md)`), '',
    '## ER diagram', '',
    '```mermaid', 'erDiagram',
    ...data.constraints.filter((c) => c.type === 'FOREIGN KEY').map((c) =>
      `    ${c.table.replace(/[^\w]/g, '_')} }o--|| ${c.fk_table.replace(/[^\w]/g, '_')} : "${c.columns.join(',')}"`),
    '```', '',
    '## Drift summary', '',
    undeclared.length
      ? `${undeclared.length} table(s) live but not declared in any \`db/*.sql\` by name: ` +
        undeclared.map((t) => `\`${t.schema}.${t.name}\``).join(', ') + '.'
      : 'No drift: every live table is declared in `db/*.sql`.',
    '',
  ];
  return L.join('\n');
}

export function generate({ inPath = DEFAULT_IN, outDir = DEFAULT_OUT } = {}) {
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const purposes = fs.existsSync(PURPOSES) ? parsePurposes(fs.readFileSync(PURPOSES, 'utf8')) : {};
  const cols = byTable(data.columns);
  const cons = byTable(data.constraints);
  const idx = byTable(data.indexes);
  const pol = byTable(data.policies);
  const trg = byTable(data.triggers);
  const fnByKey = new Map(data.functions.map((f) => [`${f.name}`, f]));

  const files = new Map();
  for (const tr of data.tables) {
    const key = `${tr.schema}.${tr.name}`;
    files.set(`${key}.md`, renderTablePage(tr, {
      columns: cols.get(key) || [],
      constraints: cons.get(key) || [],
      indexes: idx.get(key) || [],
      policies: pol.get(key) || [],
      triggers: trg.get(key) || [],
      allConstraints: data.constraints,
      functionsByKey: fnByKey,
      purposes,
      generatedAt: data.generated_at,
    }));
  }
  files.set('_functions.md', renderFunctions(data.functions, data.function_grants, data.generated_at));
  files.set('_triggers-and-cron.md', renderTriggersAndCron(data.triggers, data.cron_jobs, data.generated_at));
  files.set('README.md', renderReadme(data, purposes));
  return files;
}

// ── CLI ──
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function main() {
  const args = process.argv.slice(2);
  const flag = (name, def) => { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; };
  const inPath = flag('--in', DEFAULT_IN);
  const outDir = flag('--out-dir', DEFAULT_OUT);
  const check = args.includes('--check');

  if (!fs.existsSync(inPath)) {
    console.error(`${inPath} not found — run introspect.sql (via the Supabase MCP execute_sql) and save its result there first.`);
    process.exit(1);
  }
  const files = generate({ inPath, outDir });

  if (check) {
    const stale = [];
    for (const [name, content] of files) {
      const p = path.join(outDir, name);
      if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) stale.push(name);
    }
    if (stale.length) {
      console.error(`schema docs STALE (${stale.length}): ${stale.join(', ')}\nrun \`node scripts/docs/gen-schema.mjs\` and commit the result.`);
      process.exit(1);
    }
    console.log(`${files.size} schema pages up to date.`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(outDir, name), content, 'utf8');
  console.log(`wrote ${files.size} files to ${outDir}`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs/gen-schema.mjs')) main();
