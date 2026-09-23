-- messages: staff-to-staff notes (js/src/17-messages.js).
-- Repo record of the LIVE schema (read from information_schema / pg_policies on 23.9). The table
-- was created outside db/ before this file; running this on the live database is a no-op.
-- Access tightening is a separate, reviewed migration (db/rls_viewer_readonly.sql).
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  to_person   text        not null,
  from_person text        not null,
  text        text        not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

alter table public.messages enable row level security;

-- The one policy that exists live today, recorded as-is.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_auth_all') then
    create policy messages_auth_all on public.messages for all to authenticated using (true) with check (true);
  end if;
end $$;
