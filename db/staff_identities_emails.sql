-- staff_identities_emails.sql — every staff EMS email → roster name (עידן 12.10). NOT APPLIED; MAIN audits and applies.
--
-- staff_identities is keyed by the EMS user id (db/staff_identities.sql); this file cannot invent ids, so it only
-- CORRECTS the name of rows whose email is a known staff email. A staff email with no row at all needs the seed:
--   node scripts/seed-staff-identities.mjs   (uses identity.js, which now maps all seven emails) → paste its SQL.
-- Touches staff_identities only. Historical rows (visits etc.) are NOT rewritten here.
--
-- CONFIRM FIRST (read-only, service role / SQL editor):
--   select ems_user_id, name, email, updated_at from public.staff_identities order by name;
--   -- staff emails with no row:
--   select m.email, m.name from (values
--     ('pm@sigmatec-energy.com','עידן'), ('ankor@sigmatec-energy.com','עמיחי'), ('engsupport@sigmatec-energy.com','אביאם'),
--     ('technician@sigmatec-energy.com','ניתאי'), ('microgrid@sigmatec-energy.com','אבצן'), ('dev@sigmatec-energy.com','מתניה'),
--     ('rnddev@sigmatec-energy.com','אליה')) m(email, name)
--   where not exists (select 1 from public.staff_identities s where lower(btrim(s.email)) = m.email);
--
-- BACKUP:
--   create table public.staff_identities_bak_2026_10 as select * from public.staff_identities;
--   alter table public.staff_identities_bak_2026_10 enable row level security;
--
-- ROLLBACK:
--   update public.staff_identities s set name = b.name, updated_at = b.updated_at
--     from public.staff_identities_bak_2026_10 b where b.ems_user_id = s.ems_user_id;
--   drop table if exists public.staff_identities_bak_2026_10;

begin;

update public.staff_identities s
   set name = m.name, updated_at = now()
  from (values
    ('pm@sigmatec-energy.com', 'עידן'),
    ('ankor@sigmatec-energy.com', 'עמיחי'),
    ('engsupport@sigmatec-energy.com', 'אביאם'),
    ('technician@sigmatec-energy.com', 'ניתאי'),
    ('microgrid@sigmatec-energy.com', 'אבצן'),
    ('dev@sigmatec-energy.com', 'מתניה'),
    ('rnddev@sigmatec-energy.com', 'אליה')
  ) m(email, name)
 where lower(btrim(s.email)) = m.email
   and s.name is distinct from m.name;

commit;

-- Verify: the CONFIRM queries above — every staff email has a row with the right name.
