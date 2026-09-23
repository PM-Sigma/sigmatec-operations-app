-- db/user_settings_partner_tasks.sql — round 5 G: אביאם's "לראות גם את המשימות של ניתאי".
alter table public.user_settings add column if not exists show_partner_tasks boolean not null default false;
comment on column public.user_settings.show_partner_tasks is 'Honoured for אביאם only (lib/settings.ts partnerTasksOwner). Read by the calendar blocks (package C).';
