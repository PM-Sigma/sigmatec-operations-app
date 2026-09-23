-- auth_attempts: sign-in throttle log written by the ems-auth Edge Function (service role).
-- Repo record of the LIVE schema (read from information_schema on 23.9); a no-op on the live DB.
-- Deny-all by design: RLS on and NO policies, so only the service role reaches it.
create table if not exists public.auth_attempts (
  id bigserial   primary key,
  ip text        not null,
  at timestamptz not null default now()
);
create index if not exists auth_attempts_ip_at on public.auth_attempts (ip, at desc);

alter table public.auth_attempts enable row level security;
-- (intentionally no policies)
