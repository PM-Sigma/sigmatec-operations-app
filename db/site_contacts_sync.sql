-- site_contacts ← EMS sync (owner's rule: every EMS user with role site_manager / operations_manager on a
-- site is a contact for that kibbutz's delivery certificates). The sync itself is scripts/ems-contacts-sync.mjs
-- (office PC, same .env + ems-auth path as scripts/ems-cache-refresh.mjs). This file prepares the table.
-- Manual rows (added in the send panel) keep source='manual' and are NEVER touched by the sync.
--
-- BACKUP FIRST (rollback copy):
--   create table if not exists public.site_contacts_bak_20261123 as select * from public.site_contacts;
-- ROLLBACK:
--   drop index if exists public.site_contacts_kibbutz_email_uq;
--   alter table public.site_contacts drop column if exists source;
--   -- rows removed by the de-dup below: restore from site_contacts_bak_20261123.
-- Apply order: 1) this file  2) first sync run (--dry-run, then real).

create table if not exists public.site_contacts_bak_20261123 as select * from public.site_contacts;

alter table public.site_contacts add column if not exists source text not null default 'manual';
do $$ begin
  alter table public.site_contacts add constraint site_contacts_source_chk check (source in ('ems','manual'));
exception when duplicate_object then null; end $$;
alter table public.site_contacts add column if not exists active boolean not null default true;

-- De-dup before the unique key (prod had 2 identical rows for אור הנר): keep the oldest by ctid, same (kibbutz, email).
delete from public.site_contacts c
 using (
   select ctid as t, row_number() over (partition by kibbutz, lower(email) order by ctid) rn
     from public.site_contacts where email <> ''
 ) d
 where c.ctid = d.t and d.rn > 1;

-- The one-off seed (db/site_contacts.sql) came from EMS users, and only those carry an EMS role; panel-added rows have role ''.
-- Mark them 'ems' so the sync can keep them current (and deactivate the ones whose user left).
update public.site_contacts set source = 'ems' where role in ('site_manager', 'operations_manager') and source = 'manual';

-- Phone-only contacts (email = '') are legal and may repeat, so the key is partial.
create unique index if not exists site_contacts_kibbutz_email_uq
  on public.site_contacts (kibbutz, lower(email)) where email <> '';
