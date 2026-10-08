-- ═══════════════════════════════════════════════════════════════════════════
-- 🤖 bug bot — state columns on `feedback` (spec 2026-10-08-bugbot-design.md).
-- ADDITIVE only. NOT applied by the agent: MAIN applies it.
--
-- BACKUP first (run, keep the table):
--   create table feedback_backup_20261008 as select * from feedback;
--
-- bot_state: NULL = nobody took it. The bot claims a row with
--   update feedback set bot_state='working', bot_at=now()
--    where id=$1 and bot_state is null and status='new' and kind='bug'  returning *
-- so two runs can never take the same bug.
-- Clients READ these columns through the existing feedback_select policy. Nobody but
-- service_role writes them: UPDATE is already revoked from anon/authenticated and
-- feedback_admin_update() only touches status + github_issue.
-- ═══════════════════════════════════════════════════════════════════════════
alter table feedback add column if not exists bot_state  text;
alter table feedback add column if not exists bot_note   text;
alter table feedback add column if not exists bot_branch text;
alter table feedback add column if not exists bot_at     timestamptz;

alter table feedback drop constraint if exists feedback_bot_state_check;
alter table feedback add constraint feedback_bot_state_check
  check (bot_state is null or bot_state in ('working','merged','needs_approval','not_reproduced','failed'));

-- the watcher's one query: open bugs nobody took
create index if not exists feedback_bot_open_idx on feedback (created_at)
  where kind = 'bug' and status = 'new' and bot_state is null;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   drop index if exists feedback_bot_open_idx;
--   alter table feedback drop constraint if exists feedback_bot_state_check;
--   alter table feedback drop column if exists bot_at, drop column if exists bot_branch,
--                        drop column if exists bot_note, drop column if exists bot_state;
