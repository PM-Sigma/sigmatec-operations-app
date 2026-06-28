-- orders_schedule_fields.sql — the two fields the kibbutz order → EMS task scheduling flow needs (Spec A §4a).
-- Safe & additive: nullable columns, harmless until the scheduling flow ships (nothing reads them yet).
-- assignee = the scheduled worker (אביאם/ניתאי); due_date = תאריך יעד (also sent to the EMS task as
-- expectedCompletionDate). expected_date stays "תאריך הזמנה" (order date) — distinct from due_date.
-- Run once in Supabase → SQL editor. RLS already covers `orders` (auth_all), so no policy change needed.
alter table public.orders add column if not exists assignee text;
alter table public.orders add column if not exists due_date date;
