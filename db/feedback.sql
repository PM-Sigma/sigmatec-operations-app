-- ══════════════════════════════════════════════════════════════════════════════
-- 📣 `feedback` — the ideas / bugs box (spec §7 Part F, "סיגמה 2.00"). Two kinds only
-- (עידן's ruling, 18.9): 'complaint' was cut — see db/feedback_kinds.sql for the migration that
-- drops the old three-way constraint on an existing install.
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
-- RLS (hardened in fix round 1). Feedback is not like the other tables: a send may be
-- ANONYMOUS, so "anyone with the public anon key can read it" was wrong, and "any EMS user can
-- update or delete anyone's row" was worse.
--   • SELECT  — `authenticated` only (the EMS-minted pass). No anon read at all.
--   • INSERT  — `authenticated`. Every role may submit, the viewer included (spec §7).
--   • UPDATE / DELETE — NO policy, and the privilege is revoked: a direct write fails outright.
--     Status changes and the github_issue stamp go through `feedback_admin_update()` below.
--
-- LIMITATION, stated plainly: the app has ONE shared `authenticated` JWT minted from the EMS
-- gate (js/src/01-data.js), so Postgres cannot tell עידן from ניתאי. RLS therefore cannot be
-- the identity check, and the admin gate is the `app_admins` table consulted by a
-- SECURITY DEFINER function against the `actor` the client passes. That is honest defence in
-- depth, not authentication: it stops the ordinary app paths and any accidental write, and it
-- makes tampering require deliberately forging an actor name. Real per-user identity needs
-- per-user Supabase auth, which is its own piece of work (docs/integration-map.md).
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  author text,                                             -- NULL = sent anonymously
  kind text not null check (kind in ('idea','bug')),
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

-- The admin roster the SECURITY DEFINER function below checks its `actor` against.
create table if not exists app_admins (
  name text primary key,
  added_at timestamptz not null default now()
);
insert into app_admins (name) values ('עידן'), ('עמיחי') on conflict (name) do nothing;
alter table app_admins enable row level security;
drop policy if exists app_admins_read on app_admins;
create policy app_admins_read on app_admins for select to authenticated using (true);

drop policy if exists feedback_read on feedback;          -- the old anon-read policy
drop policy if exists feedback_write on feedback;         -- the old `for all to authenticated`

create policy feedback_select on feedback for select to authenticated using (true);
create policy feedback_insert on feedback for insert to authenticated with check (true);
-- No UPDATE/DELETE policy on purpose. Belt and braces: take the privilege away too, so a
-- direct update fails loudly ("permission denied") instead of silently touching zero rows.
revoke update, delete on feedback from anon, authenticated;

-- The ONLY way a feedback row changes after it is written. SECURITY DEFINER (owner: postgres)
-- so it may write past the missing policy, and it refuses any actor that is not in app_admins.
create or replace function feedback_admin_update(
  p_id uuid,
  p_actor text,
  p_status text default null,
  p_github_issue int default null
) returns feedback
language plpgsql
security definer
set search_path = public
as $$
declare r feedback;
begin
  if not exists (select 1 from app_admins where name = p_actor) then
    raise exception 'feedback_admin_update: % is not an admin', coalesce(p_actor, '(null)')
      using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new','seen','done') then
    raise exception 'feedback_admin_update: bad status %', p_status using errcode = '22023';
  end if;
  update feedback
     set status       = coalesce(p_status, status),
         github_issue = coalesce(p_github_issue, github_issue)
   where id = p_id
  returning * into r;
  if r.id is null then
    raise exception 'feedback_admin_update: no such feedback %', p_id using errcode = 'P0002';
  end if;
  return r;
end $$;

revoke all on function feedback_admin_update(uuid, text, text, int) from public, anon;
grant execute on function feedback_admin_update(uuid, text, text, int) to authenticated;


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
create policy transcribe_log_read on transcribe_log for select to authenticated using (true);
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
