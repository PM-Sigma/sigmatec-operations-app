-- ══════════════════════════════════════════════════════════════════════════════
-- rls_certs_checkins_lockdown.sql — close the two anon reads Task 18a found
-- (controller ruling, 19.9). Run ONCE in the Supabase SQL editor, AFTER the app
-- version that calls `cert_by_id()` is live (see ORDER below).
--
-- WHAT WAS WRONG
--   `delivery_certs` and `field_checkins` both had `for select using (true)` — which
--   includes the `anon` role, i.e. the public key that ships in the client bundle.
--   Anyone holding that key (it is in the page source) could list EVERY certificate:
--   customer names, ח.פ., addresses, the item lines and, since delivery_certs_signature,
--   the recipient's SIGNATURE image. Same for `field_checkins`: who was at which
--   kibbutz, when.
--
-- THE RULING (עידן, 19.9)
--   · delivery_certs — the SHARE LINK stays public (a recipient must be able to open
--     `?cert=<uuid>` without logging in), but a link is a capability, not a listing.
--     So: no anon SELECT on the table at all; one `security definer` RPC that returns
--     EXACTLY the one row whose uuid you already hold. Enumeration closed, link intact.
--   · field_checkins — no anon read. Authenticated only. Nothing anon-side reads it:
--     the "היום" strip and the gaps view both run behind the EMS gate (which mints the
--     `authenticated` pass), and the reminder cron in `push-send` uses the SERVICE ROLE,
--     which bypasses RLS entirely.
--
-- ORDER (matters)
--   1. ship the app version whose cert viewer calls `cert_by_id()` (js/src/20-delivery-cert.js)
--   2. run this file
--   A migration-first deploy would break every open share link until the app catches up.
-- ══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 1. delivery_certs ─────────────────────────────

-- The anon-readable table policy goes. `authenticated` keeps the full read: the in-app
-- cert report (js/src/20-delivery-cert.js `_sbCertGet`) lists a month's certs, and every
-- reader of that screen is behind the EMS gate.
drop policy if exists delivery_certs_read on public.delivery_certs;

create policy delivery_certs_read on public.delivery_certs
  for select to authenticated using (true);

-- The share link, as one function. SECURITY DEFINER = it runs as the owner, so the
-- caller's (anon's) lack of a SELECT policy does not apply INSIDE it; `search_path` is
-- pinned so nothing a caller can create on their own schema path is resolved instead.
-- It takes the uuid you already have and returns that row and no other: there is no
-- filter, no ordering, no listing, and a wrong guess returns zero rows.
create or replace function public.cert_by_id(p_id uuid)
returns table (
  id            uuid,
  cert_number   bigint,
  cert_date     date,
  kibbutz       text,
  customer      jsonb,
  items         jsonb,
  notes         text,
  source        text,
  ref_id        text,
  recipient     text,
  signature     text,
  status        text,
  replaced_by   bigint,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.cert_number, c.cert_date, c.kibbutz, c.customer, c.items, c.notes,
         c.source, c.ref_id,
         coalesce(c.recipient, ''), coalesce(c.signature, ''),
         coalesce(c.status, 'active'), coalesce(c.replaced_by, 0),
         c.created_at
    from public.delivery_certs c
   where c.id = p_id
   limit 1;
$$;

-- `created_by` and `doc_html` are deliberately NOT in the projection: the recipient of a
-- certificate has no business knowing which employee issued it, and doc_html is the
-- app's own render cache.
comment on function public.cert_by_id(uuid) is
  'Public share-link read for ONE delivery certificate (db/rls_certs_checkins_lockdown.sql). '
  'Replaces the anon SELECT policy: the link stays public, the table stops being enumerable.';

revoke all on function public.cert_by_id(uuid) from public;
grant execute on function public.cert_by_id(uuid) to anon, authenticated;

-- ───────────────────────────── 2. field_checkins ─────────────────────────────

drop policy if exists field_checkins_read on public.field_checkins;

create policy field_checkins_read on public.field_checkins
  for select to authenticated using (true);

-- (the existing `field_checkins_write` policy is already `to authenticated` — unchanged)

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFY (run as each role in the SQL editor's role switcher, or from the app)
--   set role anon;
--     select count(*) from public.delivery_certs;          -- expect 0 rows (policy denies)
--     select count(*) from public.field_checkins;          -- expect 0 rows
--     select cert_number from public.cert_by_id('<a real cert uuid>');   -- expect 1 row
--     select cert_number from public.cert_by_id(gen_random_uuid());      -- expect 0 rows
--   reset role;
--   -- and as an EMS-gated user (authenticated): both tables read normally.
-- ══════════════════════════════════════════════════════════════════════════════
