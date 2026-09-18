-- "מה נשאר לי פתוח" — the second half of the visit summary (spec §5.1b, task-4 step 5b).
-- The visit form splits its one free-text field into "מה עשיתי בביקור" (the existing summary)
-- and this column; the briefing's previous-visit block shows it under a highlighted
-- "נשאר פתוח" header, and the visits PDF/Excel get it as an extra column.
alter table if exists public.visits
  add column if not exists open_items text;

comment on column public.visits.open_items is
  'What the technician left open at the kibbutz (spec §5.1b). Pre-fills the next visit''s checklist.';
