-- site_contacts — contact bank per kibbutz card (site managers + operations managers from EMS users).
-- Feeds the delivery-cert send panel (email / WhatsApp). Seeded from the EMS DB
-- (users join user_sites, roles site_manager/operations_manager) — seed SQL kept OUT of the public
-- repo (personal emails/phones); regenerate via a PG session when contacts change.
-- Run once in the Supabase SQL editor.

create table if not exists public.site_contacts (
  id      uuid primary key default gen_random_uuid(),
  kibbutz text not null,                 -- app card name (KIBBUTZ_SITE_MAP key)
  name    text not null default '',
  role    text not null default '',     -- site_manager | operations_manager
  email   text not null default '',
  phone   text not null default '',
  active  boolean not null default true
);
create index if not exists idx_site_contacts_kibbutz on public.site_contacts (kibbutz);

alter table public.site_contacts enable row level security;

-- PII: contacts are readable ONLY via the authenticated bridge (logged-in staff);
-- the anon key gets nothing. Writes likewise authenticated (re-seeding / future edits).
drop policy if exists site_contacts_read on public.site_contacts;
create policy site_contacts_read on public.site_contacts
  for select to authenticated using (true);

drop policy if exists site_contacts_write on public.site_contacts;
create policy site_contacts_write on public.site_contacts
  for all to authenticated using (true) with check (true);
