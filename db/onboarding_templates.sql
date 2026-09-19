-- onboarding_templates — Task 27 (spec §4): the ordered checklist a new client (🆕 section)
-- gets spawned with. One row is the active default; עידן edits it from ⚙️ הגדרות. Editing the
-- template NEVER touches already-spawned `onboarding_steps` rows — those are a frozen copy
-- taken at spawn time.
--
-- `steps` is an ordered jsonb array of {key, label, waits}. `waits: true` marks the two
-- "ממתין למייל" steps — spawned rows for those start at state 'open' (NOT 'waiting') until
-- someone actually sends the request; see app/src/lib/onboarding.ts `stepsFromTemplate`.
--
-- Apply with the other db/*.sql migrations (Supabase SQL editor / CLI).

create table if not exists onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  steps jsonb not null,
  updated_by text,
  updated_at timestamptz default now()
);

alter table onboarding_templates enable row level security;

drop policy if exists ot_read on onboarding_templates;
create policy ot_read on onboarding_templates for select using (true);

-- Writes are meant for עידן only; the app enforces that gate (Settings.tsx), same pattern as
-- every other table here where the UI, not RLS, is the fine-grained gate for one person.
drop policy if exists ot_write on onboarding_templates;
create policy ot_write on onboarding_templates for all to authenticated using (true) with check (true);

insert into onboarding_templates (name, steps)
select 'ברירת מחדל', '[
  {"key": "ems_site",        "label": "הקמת אתר ב-EMS",                                  "waits": false},
  {"key": "customer_list",   "label": "קבלת רשימת לקוחות מהקיבוץ (ממתין למייל)",          "waits": true},
  {"key": "meter_login",     "label": "קבלת פרטי כניסה למערכת המונים (ממתין למייל)",      "waits": true},
  {"key": "meter_import",    "label": "ייבוא מונים",                                     "waits": false},
  {"key": "tariffs",         "label": "תעריפים",                                         "waits": false},
  {"key": "comms",           "label": "תקשורת",                                          "waits": false},
  {"key": "training",        "label": "הדרכה",                                           "waits": false},
  {"key": "first_bill_check","label": "בדיקת חשבון ראשון",                                "waits": false},
  {"key": "go_live",         "label": "העברה לפעילים",                                   "waits": false}
]'::jsonb
where not exists (select 1 from onboarding_templates where name = 'ברירת מחדל');
