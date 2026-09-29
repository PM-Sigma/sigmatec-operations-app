-- עידן 29.9 (corrects H3): REGION of a kibbutz is fixed (changed only by Claude via service
-- role/SQL). SECTION (קטגוריה new/active) is changed ONLY through set_kibbutz_section, callable
-- by עידן + עמיחי, from exactly two UI places (kibbutz card ✏️, meeting presenter ✏️).
--
-- 1. set_kibbutz_section(p_kibbutz, p_section) replaces set_kibbutz_region_section (dropped).
--    Identity = the trusted per-person JWT `name` claim (+ `viewer`) as in
--    db/kibbutz_region_section_rpc.sql / inventory_delete_guard(). It sets the transaction-local
--    flag sigma.section_rpc='1' so the trigger below lets this one write through.
-- 2. BEFORE UPDATE trigger on kibbutzim: a region change by anyone but service_role/postgres,
--    or a section change that does not come from set_kibbutz_section (and is not service_role/
--    postgres), raises 42501. INSERT is not covered (new kibbutzim are added by the app's
--    KibbutzSheet with region+section in the INSERT body; sub-sites inherit both on insert).
--    Archiving (archived_at) and every other column are unaffected.
--    The SECURITY DEFINER RPC runs as the function owner, so it is recognised by the flag, not
--    by the role; and the RPC touches section only, so region can NOT slip through it.
--
-- The client UPDATE for a kibbutz edit never sends region/section (an unchanged value would
-- pass IS DISTINCT FROM anyway).
--
-- NOT APPLIED. MAIN applies it. The decision table is mirrored + unit-tested in
-- app/src/lib/kibbutzSection.test.ts (triggerDecision).
--
-- BACKUP (run first, keep the table):
--   create table if not exists public.kibbutzim_region_section_bak_lock as
--     select id, name, region, section from public.kibbutzim;
--   (the earlier snapshot kibbutzim_region_section_bak_29_9 also exists)

begin;

-- 1. the RPC ----------------------------------------------------------------
create or replace function public.set_kibbutz_section(p_kibbutz text, p_section text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(auth.jwt() ->> 'viewer', 'false') = 'true' then
    raise exception 'viewer' using errcode = '42501';
  end if;
  if (auth.jwt() ->> 'name') is null or (auth.jwt() ->> 'name') not in ('עידן', 'עמיחי') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_section is null or p_section not in ('new', 'active') then
    raise exception 'bad section' using errcode = '22023';
  end if;
  perform set_config('sigma.section_rpc', '1', true);   -- transaction-local
  update kibbutzim set section = p_section
   where name = p_kibbutz and archived_at is null
  returning jsonb_build_object('name', name, 'region', region, 'section', section) into v;
  if v is null then
    raise exception 'kibbutz not found' using errcode = 'P0002';
  end if;
  return v;
end $$;

revoke all on function public.set_kibbutz_section(text, text) from public, anon;
grant execute on function public.set_kibbutz_section(text, text) to authenticated;

drop function if exists public.set_kibbutz_region_section(text, text, text);

-- 2. the trigger ------------------------------------------------------------
create or replace function public.kibbutzim_lock_region_section()
returns trigger language plpgsql as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                          nullif(auth.role(), ''), current_user);
begin
  if v_role in ('service_role', 'postgres') or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if new.region is distinct from old.region then
    raise exception 'region is fixed' using errcode = '42501';
  end if;
  if new.section is distinct from old.section
     and coalesce(current_setting('sigma.section_rpc', true), '') <> '1' then
    raise exception 'section changes only via set_kibbutz_section' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists kibbutzim_lock_region_section on public.kibbutzim;
create trigger kibbutzim_lock_region_section
  before update on public.kibbutzim
  for each row execute function public.kibbutzim_lock_region_section();

commit;

-- ROLLBACK:
--   begin;
--   drop trigger if exists kibbutzim_lock_region_section on public.kibbutzim;
--   drop function if exists public.kibbutzim_lock_region_section();
--   drop function if exists public.set_kibbutz_section(text, text);
--   -- restore the old RPC by re-running db/kibbutz_region_section_rpc.sql
--   commit;
--   -- data restore only if a value was changed by mistake:
--   --   update kibbutzim k set region=b.region, section=b.section
--   --     from public.kibbutzim_region_section_bak_lock b where b.id=k.id;
