-- H3 (עידן 29.9): presenter region/section chips become editable for עידן + עמיחי ONLY.
-- Narrow SECURITY DEFINER write: it may change kibbutzim.region and kibbutzim.section of ONE row,
-- nothing else. Identity = the SAME trusted per-person JWT `name` claim (+ `viewer`) that
-- inventory_delete_guard() (db/inventory_delete_product.sql) and ems_task_lifecycle.sql read;
-- the claim is minted server-side by ems-auth from staff_identities, so the client cannot forge it.
-- Allowed names: 'עידן','עמיחי' (= the app_admins roster, db/feedback.sql). A pass with no name
-- claim, a viewer pass, or any other name is refused (42501).
--
-- NOTE: the table policy `kibbutzim_write` is still `for all to authenticated` (only viewers are
-- blocked by RESTRICTIVE policies), so a direct table update by any staff member still works.
-- This RPC gives the UI a server-checked path; tightening the table policy is a separate decision.
--
-- NOT APPLIED. MAIN applies it. Before applying: take a snapshot (backup.take_snapshot() or the
-- project's equivalent) of `kibbutzim` (select region, section, name). ROLLBACK at the bottom.

create or replace function public.set_kibbutz_region_section(p_kibbutz text, p_region text, p_section text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true' then
    raise exception 'viewer' using errcode = '42501';
  end if;
  if (auth.jwt() ->> 'name') is null or (auth.jwt() ->> 'name') not in ('עידן', 'עמיחי') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_section not in ('new', 'active') then
    raise exception 'bad section' using errcode = '22023';
  end if;
  if p_region is null or btrim(p_region) = '' then
    raise exception 'bad region' using errcode = '22023';
  end if;
  update kibbutzim set region = btrim(p_region), section = p_section
   where name = p_kibbutz and archived_at is null
  returning jsonb_build_object('name', name, 'region', region, 'section', section) into v;
  if v is null then
    raise exception 'kibbutz not found' using errcode = 'P0002';
  end if;
  return v;
end $$;

revoke all on function public.set_kibbutz_region_section(text, text, text) from public, anon;
grant execute on function public.set_kibbutz_region_section(text, text, text) to authenticated;

-- ROLLBACK:
--   drop function if exists public.set_kibbutz_region_section(text, text, text);
-- (data restore, only if a value was changed by mistake: update kibbutzim set region=…, section=… where name=…;
--  from the pre-apply snapshot.)
