-- 🔢 stock_recounts — the audit trail behind a "ספירה מחדש" (inventory spec §4b). Task 8.
--
-- A recount is the only stock change that is not already linked to a visit or an order, so it
-- has to carry its OWN evidence: what was counted, what the pool said before, the delta, and a
-- note that is not optional. The matching `movements` row (`חברה → ספירה` or the reverse)
-- carries this row's id as its `ref_id`, so the ledger never has an unexplained correction.
--
-- Apply with the other db/*.sql migrations. Idempotent.

create table if not exists stock_recounts (
  id         uuid primary key default gen_random_uuid(),
  product    text not null,
  counted    numeric not null,
  before     numeric not null,
  delta      numeric not null,
  note       text not null,
  actor      text,
  created_at timestamptz default now()
);

create index if not exists stock_recounts_recent on stock_recounts (created_at desc);
create index if not exists stock_recounts_product on stock_recounts (product, created_at desc);

alter table stock_recounts enable row level security;

drop policy if exists sr_read on stock_recounts;
create policy sr_read on stock_recounts for select using (true);

drop policy if exists sr_write on stock_recounts;
create policy sr_write on stock_recounts for all to authenticated using (true) with check (true);
