-- delivery_certs: cancel / reissue-correction flow.
-- A cert is never deleted (audit-clean numbering for accounting) — a correction issues a NEW cert
-- and marks the old one cancelled with a pointer to its replacement.
-- Additive + re-runnable. Run once in the Supabase SQL editor.

alter table public.delivery_certs
  add column if not exists status text not null default 'active',       -- active | cancelled
  add column if not exists replaced_by bigint not null default 0;       -- cert_number of the correcting cert (0 = none)

-- The app only ever flips status/replaced_by (via the authenticated bridge).
drop policy if exists delivery_certs_update on public.delivery_certs;
create policy delivery_certs_update on public.delivery_certs
  for update to authenticated using (true) with check (true);
