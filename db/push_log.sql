-- Push-notification send log — one row per recipient device per notification.
-- Written by the push-send Edge Function (service_role); read by the admin "התראות" screen.
-- Denormalized so the UI needs no joins. See docs/superpowers/specs/2026-07-16-push-log-table-design.md
create table if not exists push_log (
  id         bigint generated always as identity primary key,
  sent_at    timestamptz not null default now(),
  event      text not null,            -- 'pending' | 'approved'
  order_id   text,
  where_txt  text,                     -- "לקיבוץ גבת" / "מספק קרלו" (denormalized)
  qty        int,
  actor      text,                     -- who triggered the notification
  title      text,
  body       text,
  recipient  text not null,            -- owner name (matches getCurrentUser)
  endpoint   text,                     -- device endpoint (debugging dead subs)
  status     text not null,            -- 'sent' | 'failed' | 'expired'
  error      text                      -- populated when status != 'sent'
);
create index if not exists push_log_sent_at_idx on push_log (sent_at desc);

alter table push_log enable row level security;

-- read: anon+authenticated (UI is gated to isIdan client-side; matches the app's current posture).
drop policy if exists push_log_read on push_log;
create policy push_log_read on push_log for select to anon, authenticated using (true);
-- insert: service_role only (the push-send Edge Function). No client writes.
drop policy if exists push_log_write on push_log;
create policy push_log_write on push_log for insert to service_role with check (true);
