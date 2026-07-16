# Push-notification log — sent-notifications table

**STATUS: 🟢 approved — building**
**Date:** 2026-07-16 · **Owner:** עידן · **Depends on:** the web-push feature (push-send fn, push_subscriptions, orders).

## Goal
Give עידן a read-only table of every Web-Push notification the system actually sent, so he can see
what went out, to whom, and whether it was delivered. Today nothing is recorded — `push-send` sends
and returns a count, then forgets.

## Decisions (from brainstorming)
- **Where it's recorded:** server-side, inside `push-send` (single source of truth — it already knows
  the real recipients and per-device send result).
- **Granularity:** one row per recipient device.
- **Audience / placement:** a dedicated screen (nav tab) visible to **עידן only** (`isIdan()`).
- **Retention:** keep everything (volume is tiny; no cleanup job).
- **Filters:** none for v1 (YAGNI). Show the latest 200, newest first. `// ponytail: add a "failed only"
  toggle later if it proves needed.`

## 1. Database — new table `push_log`
Denormalized so the UI needs no joins.

```sql
create table if not exists push_log (
  id         bigint generated always as identity primary key,
  sent_at    timestamptz not null default now(),
  event      text not null,            -- 'pending' | 'approved'
  order_id   text,
  where_txt  text,                     -- "לקיבוץ גבת" / "מספק קרלו" (denormalized)
  qty        int,
  actor      text,                     -- who triggered it
  title      text,
  body       text,
  recipient  text not null,            -- owner name (matches getCurrentUser)
  endpoint   text,                     -- device endpoint (for debugging dead subs)
  status     text not null,            -- 'sent' | 'failed' | 'expired'
  error      text                      -- populated when status != 'sent'
);
create index if not exists push_log_sent_at_idx on push_log (sent_at desc);

alter table push_log enable row level security;
-- read: anon+authenticated (UI is gated to isIdan client-side, matches the app's current posture).
-- insert: service_role only (the push-send Edge Function). No client writes.
drop policy if exists push_log_read on push_log;
create policy push_log_read   on push_log for select to anon, authenticated using (true);
drop policy if exists push_log_write on push_log;
create policy push_log_write  on push_log for insert to service_role with check (true);
```

## 2. `push-send` Edge Function — record each send
After the existing per-recipient send loop, insert one `push_log` row per device with the real result.
- `status`: `'sent'` on success; `'expired'` on 404/410 (dead sub — already pruned); `'failed'` +
  `error` otherwise.
- Reuse the values already computed: `event`, `orderId`, `where` (→ `where_txt`), `qty`, `actor`,
  `title`, `body`. `recipient` = `sub.owner`, `endpoint` = `sub.endpoint`.
- Batch-insert all rows once (`sb.from('push_log').insert(rows)`), non-fatal on error (logging must
  never break sending). This is an additive change — coordinate with the parallel push work at merge.

## 3. Client — new module `js/src/23-push-log.js`
- `renderPushLog()` — gated to `isIdan()`; otherwise shows "אין הרשאה".
- Fetch: `GET {SB_URL}/rest/v1/push_log?select=*&order=sent_at.desc&limit=200` with anon headers.
- Table columns (RTL, reuse `.inv-table`): **זמן** (he-IL date+time) · **סוג** (🔔 ממתין / ✅ אושר) ·
  **הזמנה** (`where_txt`) · **נמען** · **סטטוס** (✅ נשלח / ⚠️ נכשל / 💀 מנוי מת) · **מבצע** (actor).
- Refresh button. Empty state: "לא נשלחו התראות עדיין".

## 4. Navigation wiring (עידן-only tab)
- **index.html:** add nav button `navPushLog` (`data-page="pushlog"`, hidden by default,
  icon 🔔 / label "התראות") after `navDev`; add `<div id="pushlog-view" style="display:none;">`.
- **02-init-attendance.js `showPage`:** add `pushlog: 'pushlog-view'` to the `_pv` view map; gate
  `if (page==='pushlog' && !isIdan()) page='kibbutz'`; call `renderPushLog()` when entering.
- **11-search-login.js `updateRoleUI`:** show `navPushLog` iff `isIdan()`.
- **build.mjs:** picks up `23-push-log.js` automatically (globs `js/src/*.js`).

## Testing
- SQL: table + policies apply cleanly (Supabase MCP / migration).
- push-send: after an approve/pending send, a `push_log` row exists per recipient with correct status
  (verify via REST select). Failure to insert does not break the send (wrap in try/catch).
- Client: `renderPushLog` builds a table from a fixture array (pure-ish); isIdan gate returns the
  no-permission message for non-Idan. One smoke: log in as עידן, open the tab, see rows.

## Out of scope (v1)
Filters, per-event grouping, retention/cleanup, non-order notification types. Add later if needed.
