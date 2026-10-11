// test-visit-edit-unlocks-sql.mjs: db/visit_edit_unlocks.sql (per-person month unlock of the visit edit lock).
// A pure model of the trigger's decision is checked against the cases, and the SQL text is pinned to that model.
//   node test-visit-edit-unlocks-sql.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./db/visit_edit_unlocks.sql', import.meta.url), 'utf8');
const code = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

// ── the model: blocked = visit_edit_locked(d, at) AND NOT visit_edit_unlocked(visitor, d, at) ──
const editableUntil = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return (m === 12 ? y + 1 : y) + '-' + String(m === 12 ? 1 : m + 1).padStart(2, '0') + '-10'; };
const locked = (d, today) => d < '2026-09-01' || today > editableUntil(d);
const unlocked = (rows, visitor, d, at) => rows.some(u => u.month === d.slice(0, 7) + '-01' && u.until > at
  && visitor.split(',').map(s => s.trim()).includes(u.person));
const blocked = (rows, visitor, d, at) => locked(d, at.slice(0, 10)) && !unlocked(rows, visitor, d, at);

const rows = [{ person: 'אביאם', month: '2026-09-01', until: '2026-10-25T20:59:00Z' }];
assert.equal(blocked(rows, 'אביאם', '2026-09-22', '2026-10-12T09:00:00Z'), false, 'unlocked September edit passes');
assert.equal(blocked(rows, 'אביאם', '2026-09-22', '2026-10-26T09:00:00Z'), true, 'expired unlock blocks again');
assert.equal(blocked(rows, 'ניתאי', '2026-09-22', '2026-10-12T09:00:00Z'), true, 'someone else stays locked');
assert.equal(blocked(rows, 'ניתאי, אביאם', '2026-09-22', '2026-10-12T09:00:00Z'), false, 'joint visit counts');
assert.equal(blocked(rows, 'אביאם', '2026-08-20', '2026-10-12T09:00:00Z'), true, 'another month stays locked');
assert.equal(blocked([], 'אביאם', '2026-10-05', '2026-10-12T09:00:00Z'), false, 'an open month never needs an unlock');

// ── the SQL says the same thing ──
assert.match(sql, /^-- NOT APPLIED\./m);
assert.match(code, /create table if not exists public\.visit_edit_unlocks/i);
assert.match(code, /primary key \(person, month\)/i);
assert.match(code, /enable row level security/i);
assert.match(code, /for select to authenticated\s+using \(person = \(auth\.jwt\(\) ->> 'name'\)/i, 'reads only his own row (JWT name claim)');
assert.ok(!/for (insert|update|delete|all) to authenticated/i.test(code), 'no client write policy: only service_role writes');
assert.match(code, /u\.month = date_trunc\('month', d\)::date/i);
assert.match(code, /u\.until > at/i);
assert.match(code, /security definer/i, 'the trigger must see every unlock, not only the caller\'s (RLS)');
assert.match(code, /public\.visit_edit_locked\(v_old_date\)\s+and not public\.visit_edit_unlocked\(old\.visitor, v_old_date\)/i, 'old date honours the unlock');
assert.match(code, /public\.visit_edit_locked\(v_new_date\)\s+and not public\.visit_edit_unlocked\(new\.visitor, v_new_date\)/i, 'new date honours the unlock');
assert.equal((code.match(/visit_edit_unlocked\((old|new)\.visitor/g) || []).length, 3, 'DELETE, NEW and OLD checks all honour it');
assert.match(code, /visit_inventory_delete_override\(old, new\)/, 'the inventory-delete override is kept');
assert.match(sql, /-- SEED[\s\S]*'אביאם', '2026-09-01', timestamptz '2026-10-25 23:59 Asia\/Jerusalem', 'שחזור דוחות שנדרסו \(באג 4–7\.10\)', 'עידן'/);
assert.match(sql, /BACKUP/);
assert.match(sql, /-- ROLLBACK/);

console.log('test-visit-edit-unlocks-sql: ok');
