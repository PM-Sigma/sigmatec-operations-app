-- Web Push subscriptions (one row per device). Written by the client on opt-in, read by the
-- push-send Edge Function (service_role). See docs/superpowers/specs/2026-07-16-web-push-notifications-design.md
create table if not exists push_subscriptions (
  endpoint   text primary key,
  owner      text not null,           -- Hebrew owner name, matches getCurrentUser()
  keys       jsonb not null,          -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_owner_idx on push_subscriptions (owner);

alter table push_subscriptions enable row level security;

-- ponytail: anon+authenticated get full access — matches the app's current anon-write posture
-- (mid-migration; see 01-data.js USE_SB_BRIDGE). Tighten with the planned authenticated lockdown.
drop policy if exists push_subs_all on push_subscriptions;
create policy push_subs_all on push_subscriptions
  for all to anon, authenticated using (true) with check (true);
