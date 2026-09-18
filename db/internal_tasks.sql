-- 🔒 internal_tasks — company-process spec §2, as amended by the §8b ruling: NO due dates and
-- NO reminders. A list with an owner and a done flag, visible to every employee, never to the
-- kibbutz. `kibbutz = null` means the whole company.
--
-- Created here by Task 14 because that task retires the home "משימות חברה כלליות" block
-- (redesign spec §7m R3) and its three lists need somewhere to land. The schema is EXACTLY the
-- one Task 26 ruled — nothing added — and `if not exists` makes Task 26's own copy a no-op when
-- it ships the 🔒 UI on top of it. A later feature that needs another column adds it with its
-- own migration.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).

create table if not exists internal_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text,
  kibbutz text,                         -- null = company-wide
  done boolean not null default false,
  created_by text,
  created_at timestamptz default now()
);

alter table internal_tasks enable row level security;

drop policy if exists it_read on internal_tasks;
create policy it_read on internal_tasks for select using (true);

drop policy if exists it_write on internal_tasks;
create policy it_write on internal_tasks for all to authenticated using (true) with check (true);

-- The "חברה" group reads exactly this.
create index if not exists internal_tasks_company_open
  on internal_tasks (done) where kibbutz is null;

-- ── one-shot migration: the retired home block's rows ────────────────────────────────────
-- `settings.companyTasks` is a single jsonb row holding {orders[], info[], guidelines[]} —
-- three free-text lists that the home page rendered and the "משימות באחריותי" report quoted.
-- Each line becomes one company-wide internal task. Idempotent: a title already present as a
-- company row is not inserted twice, so re-running this is safe.
insert into internal_tasks (title, kibbutz, done, created_by)
select distinct item, null, false, 'migration:companyTasks'
from settings s
cross join lateral (
  select jsonb_array_elements_text(coalesce(s.value -> 'orders',     '[]'::jsonb)) as item
  union all
  select jsonb_array_elements_text(coalesce(s.value -> 'info',       '[]'::jsonb))
  union all
  select jsonb_array_elements_text(coalesce(s.value -> 'guidelines', '[]'::jsonb))
) x
where s.key = 'companyTasks'
  and length(btrim(x.item)) > 0
  and not exists (
    select 1 from internal_tasks t where t.kibbutz is null and t.title = x.item
  );
