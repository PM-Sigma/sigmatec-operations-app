-- `kibbutz_meeting_notes.source` — where a bullet came from (company-process spec §1.2b).
--
-- Until now every row arrived one way: pasted into 📥 ייבוא סיכום ישיבה. The live quick-note
-- adds a second way — עידן types a line DURING the meeting and it is created on the spot —
-- and the review screen (Task 25) will add a third. Telling them apart matters because the
-- import is idempotent by (kibbutz, meeting_date, meeting_kind, seq): a re-import of the same
-- day must not silently overwrite or re-number a line that was never in the pasted summary.
--
-- Nullable on purpose. Every existing row predates the column and `null` is the honest answer
-- for it; `'import'` is only stamped going forward, by whoever writes the row.
--   null | 'import'  — from the pasted summary
--   'live'           — typed in מצב ישיבה while the meeting was running
--   'review'         — accepted on the ישיבה → סיכום screen (Task 25)
--
-- Apply with the other db/*.sql migrations. Idempotent.
alter table kibbutz_meeting_notes
  add column if not exists source text
  check (source is null or source in ('import','live','review'));

-- The live notes of one meeting, which the review screen lists first.
create index if not exists kmn_source_idx
  on kibbutz_meeting_notes (meeting_date desc, source) where source is not null;
