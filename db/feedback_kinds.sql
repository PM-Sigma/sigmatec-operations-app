-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: feedback kinds → idea/bug only (עידן's ruling, 18.9.26 21:40, binding).
-- 'complaint' is cut entirely — no third bucket in the toggle, the inbox filter, the push
-- title, or here in the DB constraint. Existing 'complaint' rows are recategorised as 'bug'
-- (closest bucket: a complaint is almost always "something is broken/annoying") rather than
-- dropped, so no feedback is lost.
--
-- NOT applied to prod by the agent — the controller applies this migration and redeploys the
-- `push-send` Edge Function (new titles) together.
-- ══════════════════════════════════════════════════════════════════════════════
update feedback set kind = 'bug' where kind = 'complaint';

alter table feedback drop constraint if exists feedback_kind_check;
alter table feedback add constraint feedback_kind_check check (kind in ('idea', 'bug'));
