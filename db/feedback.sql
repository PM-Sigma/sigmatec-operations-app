-- ══════════════════════════════════════════════════════════════════════════════
-- 📣 `feedback` — the ideas / bug / complaint box (spec §7 Part F, "סיגמה 2.00").
--
-- One row = one thing somebody wanted to say. `author` is NULL for an anonymous send —
-- deliberately null, not the string "אנונימי", so nothing in the row can be walked back to
-- the person even by an admin reading the table directly (app/src/lib/feedback.ts feedbackRow).
--
-- `audio_path` is the object in the PRIVATE `feedback-audio` bucket the text was transcribed
-- from, kept only while it is useful: the `transcribe` Edge Function deletes the object the
-- moment it has the text, and a FAILED recording stays for a 7-day retry window (the bucket
-- has no server-side lifecycle rule — see the retention note at the bottom).
--
-- `github_issue` is set when an admin turned a `bug` row into a card on the dev board
-- (github Edge Fn, mode createIssue — always a CHILD of a Main Fields parent, title
-- `[מודול] | [תת-תחום] | [תיאור]`, into Backlog: the Git Ticket System rules).
--
-- RLS is staged exactly like db/rls_staged.sql: anon READS (the whole app sits behind the EMS
-- login gate), WRITES need the `authenticated` pass js/src/01-data.js mints from the EMS
-- session. Submitting is open to every role INCLUDING the viewer (spec §7 "all roles"); the
-- inbox is gated client-side to admins (canSeeFeedbackInbox), like every other elevated
-- surface in this app.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  author text,                                             -- NULL = sent anonymously
  kind text not null check (kind in ('idea','bug','complaint')),
  text text not null,
  audio_path text,                                         -- object in `feedback-audio`, or NULL
  status text not null default 'new' check (status in ('new','seen','done')),
  github_issue int,                                        -- the dev-board card, once opened
  created_at timestamptz not null default now()
);

-- The inbox reads "newest first, new ones first" — one index for that access path.
create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_status_idx  on feedback (status, created_at desc);

alter table feedback enable row level security;

drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select using (true);

drop policy if exists feedback_write on feedback;
create policy feedback_write on feedback for all to authenticated using (true) with check (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- `transcribe_log` — one row per transcription attempt, for the ⚙️ health panel (spec §7i:
-- "last success, model, avg seconds per audio minute"). Written by the `transcribe` function
-- with the service role; readable by the app, never written from the client.
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists transcribe_log (
  id bigint generated always as identity primary key,
  engine text not null,                                    -- 'self' | 'groq' | 'failed' | 'none'
  ms int not null default 0,                               -- how long the engine took
  ok boolean not null default false,
  audio_sec int,                                           -- as reported by the client
  error text,
  created_at timestamptz not null default now()
);

create index if not exists transcribe_log_created_idx on transcribe_log (created_at desc);

alter table transcribe_log enable row level security;

drop policy if exists transcribe_log_read on transcribe_log;
create policy transcribe_log_read on transcribe_log for select using (true);
-- No client write policy on purpose: only the service role (the Edge Function) inserts here.


-- ══════════════════════════════════════════════════════════════════════════════
-- Storage bucket `feedback-audio` — PRIVATE. The fallback voice path (iOS Safari PWA, a denied
-- or silent Web Speech API) uploads the recording here, the `transcribe` function downloads it
-- with the service role and deletes it on success. Nothing is ever served publicly, and the
-- client never needs to READ an object back — so there is no client select policy at all.
-- ══════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-audio', 'feedback-audio', false, 26214400,
        array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/m4a','audio/x-m4a','audio/wav'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- INSERT only, and only for the authenticated (EMS-minted) pass. A viewer submitting feedback
-- by voice has that same pass, so the viewer can record too (spec §7: all roles may submit).
drop policy if exists feedback_audio_insert on storage.objects;
create policy feedback_audio_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-audio');

-- Admins never read the raw audio from the client either — the text is what the inbox shows.
-- If that is ever wanted, it is a SIGNED URL minted server-side, not a select policy here.

-- ── RETENTION (manual, documented in docs/whisper-server.md) ──────────────────
-- Successful transcriptions delete their own object. A FAILED one is kept 7 days so the user
-- (or עידן) can retry the same path. Storage has no TTL, so the sweep is this statement, run
-- from the SQL editor or by a pg_cron job once the extension is enabled:
--
--   delete from storage.objects
--    where bucket_id = 'feedback-audio' and created_at < now() - interval '7 days';
